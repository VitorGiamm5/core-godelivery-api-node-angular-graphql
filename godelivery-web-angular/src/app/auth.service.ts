import { Injectable, signal } from '@angular/core';

type Tokens = { access_token: string; refresh_token: string; expires_in: number; id_token: string };
type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; revocation_endpoint: string; end_session_endpoint?: string };

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly authenticated = signal(!!sessionStorage.getItem('access_token'));
  private discovery?: Discovery;
  private refreshInFlight?: Promise<void>;

  private async metadata(): Promise<Discovery> {
    if (!this.discovery) {
      let response: Response;
      try { response = await fetch('/oidc/.well-known/openid-configuration'); }
      catch { throw new Error('Servidor de identidade indisponível'); }
      if (!response.ok) throw new Error('Servidor de identidade indisponível');
      this.discovery = await response.json() as Discovery;
      const current = new URL(location.origin);
      const trustedIssuerOrigins = new Set([current.origin]);
      if (current.protocol === 'http:' && current.hostname === 'localhost') {
        current.hostname = '127.0.0.1';
        trustedIssuerOrigins.add(current.origin);
      } else if (current.protocol === 'http:' && current.hostname === '127.0.0.1') {
        current.hostname = 'localhost';
        trustedIssuerOrigins.add(current.origin);
      }
      if (!trustedIssuerOrigins.has(new URL(this.discovery.issuer).origin)) throw new Error('Servidor de identidade inválido');
      for (const endpoint of [this.discovery.authorization_endpoint, this.discovery.token_endpoint, this.discovery.revocation_endpoint, this.discovery.end_session_endpoint].filter((value): value is string => Boolean(value))) {
        if (new URL(endpoint).origin !== location.origin) throw new Error('Servidor de identidade inválido');
      }
    }
    return this.discovery;
  }

  async login() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = encode(bytes);
    const state = encode(crypto.getRandomValues(new Uint8Array(24)));
    const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    sessionStorage.setItem('pkce_verifier', verifier);
    sessionStorage.setItem('oauth_state', state);
    const metadata = await this.metadata();
    const url = new URL(metadata.authorization_endpoint);
    url.search = new URLSearchParams({ client_id: 'godelivery-angular', response_type: 'code', redirect_uri: `${location.origin}/callback`, scope: 'openid email profile offline_access api', code_challenge: challenge, code_challenge_method: 'S256', state, resource: `${metadata.issuer}/api` }).toString();
    location.assign(url.toString());
  }

  async completeLogin() {
    const query = new URLSearchParams(location.search);
    const verifier = sessionStorage.getItem('pkce_verifier');
    const state = sessionStorage.getItem('oauth_state');
    const code = query.get('code');
    try {
      const metadata = await this.metadata();
      if (!code || !verifier || !state || query.get('state') !== state || query.get('iss') !== metadata.issuer) throw new Error('Retorno de login inválido');
      const response = await fetch(metadata.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${location.origin}/callback`, client_id: 'godelivery-angular', code_verifier: verifier, resource: `${metadata.issuer}/api` }) });
      if (!response.ok) throw new Error('Falha ao concluir o login');
      this.save(await response.json() as Tokens);
    } catch (error) {
      this.clear();
      throw error;
    } finally {
      sessionStorage.removeItem('pkce_verifier');
      sessionStorage.removeItem('oauth_state');
      history.replaceState({}, '', '/');
    }
  }

  private save(tokens: Tokens) {
    if (!tokens.access_token || !tokens.refresh_token || !tokens.id_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new Error('Resposta de autenticação inválida');
    sessionStorage.setItem('access_token', tokens.access_token);
    sessionStorage.setItem('refresh_token', tokens.refresh_token);
    sessionStorage.setItem('id_token', tokens.id_token);
    sessionStorage.setItem('expires_at', String(Date.now() + tokens.expires_in * 1000));
    this.authenticated.set(true);
  }

  async token(): Promise<string> {
    const current = sessionStorage.getItem('access_token');
    const expiresAt = Number(sessionStorage.getItem('expires_at'));
    if (!current || !Number.isFinite(expiresAt)) {
      this.clear();
      throw new Error('Faça login para continuar');
    }
    if (Date.now() + 30_000 >= expiresAt) {
      const refreshToken = sessionStorage.getItem('refresh_token');
      if (!refreshToken) { this.clear(); throw new Error('Sessão expirada'); }
      if (!this.refreshInFlight) {
        this.refreshInFlight = this.refresh(refreshToken).finally(() => { this.refreshInFlight = undefined; });
      }
      try { await this.refreshInFlight; }
      catch (error) { this.clear(); throw error; }
    }
    const token = sessionStorage.getItem('access_token');
    if (!token) throw new Error('Faça login para continuar');
    return token;
  }

  private async refresh(refreshToken: string) {
    const metadata = await this.metadata();
    const response = await fetch(metadata.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: 'godelivery-angular', resource: `${metadata.issuer}/api` }) });
    if (!response.ok) throw new Error('Sessão expirada');
    this.save(await response.json() as Tokens);
  }

  clear() {
    for (const key of ['access_token', 'refresh_token', 'id_token', 'expires_at']) sessionStorage.removeItem(key);
    this.authenticated.set(false);
  }

  async logout() {
    const accessToken = sessionStorage.getItem('access_token');
    const refreshToken = sessionStorage.getItem('refresh_token');
    const idToken = sessionStorage.getItem('id_token');
    this.clear();
    try {
      if (accessToken) {
        const response = await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
        if (!response.ok) throw new Error('Não foi possível registrar o encerramento da sessão');
      }
      const metadata = await this.metadata();
      if (refreshToken && metadata.revocation_endpoint) {
        const response = await fetch(metadata.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: 'godelivery-angular' }) });
        if (!response.ok) throw new Error('Não foi possível revogar a sessão');
      }
      if (metadata.end_session_endpoint) {
        const url = new URL(metadata.end_session_endpoint);
        url.search = new URLSearchParams({ client_id: 'godelivery-angular', post_logout_redirect_uri: location.origin, ...(idToken ? { id_token_hint: idToken } : {}) }).toString();
        location.assign(url.toString());
      }
    } catch {
      throw new Error('Sessão local encerrada; o provedor de identidade está indisponível');
    }
  }
}
