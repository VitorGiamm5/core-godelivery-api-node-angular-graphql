import type { INestApplication } from '@nestjs/common';
import type { Express, Request, Response } from 'express';
import express from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import Provider, { type AdapterPayload } from 'oidc-provider';
import { exportJWK, generateKeyPair, type JSONWebKeySet } from 'jose';
import argon2 from 'argon2';
import { PrismaService } from '../database/prisma.service.js';
import { trustedWebOrigins } from '../common/web-origins.js';
import { OidcAdapter } from './oidc.adapter.js';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const loginAttemptLimit = 10;
const loginIpAttemptLimit = 50;
const loginAttemptWindowMs = 60_000;

async function privateJwks(): Promise<JSONWebKeySet> {
  const path = process.env.OIDC_JWKS_PATH ?? '/data/oidc-jwks.json';
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as JSONWebKeySet;
  mkdirSync(dirname(path), { recursive: true });
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = await exportJWK(privateKey);
  jwk.kid = randomBytes(12).toString('hex');
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const result = { keys: [jwk] };
  const temporaryPath = `${path}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(result), { mode: 0o600, flag: 'wx' });
  try {
    linkSync(temporaryPath, path);
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return JSON.parse(readFileSync(path, 'utf8')) as JSONWebKeySet;
  } finally {
    unlinkSync(temporaryPath);
  }
}

export async function setupOidc(app: INestApplication) {
  const issuer = process.env.OIDC_ISSUER;
  const webUrl = process.env.WEB_URL;
  const cookieSecret = process.env.OIDC_COOKIE_SECRET;
  if (!issuer || !webUrl || !cookieSecret || cookieSecret.length < 32) throw new Error('OIDC_ISSUER, WEB_URL and OIDC_COOKIE_SECRET (32+ chars) are required');
  const db = app.get(PrismaService);
  const resource = `${issuer}/api`;
  const webOrigins = trustedWebOrigins(webUrl);
  const provider = new Provider(issuer, {
    adapter: (name: string) => new OidcAdapter(name, db),
    jwks: await privateJwks(),
    cookies: { keys: [cookieSecret] },
    clients: [{
      client_id: 'godelivery-angular',
      redirect_uris: webOrigins.map(origin => `${origin}/callback`),
      post_logout_redirect_uris: webOrigins,
      response_types: ['code'],
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'none',
    }],
    pkce: { required: () => true },
    rotateRefreshToken: true,
    issueRefreshToken: () => true,
    ttl: { AccessToken: 900, RefreshToken: 30 * 24 * 60 * 60, IdToken: 900 },
    features: {
      devInteractions: { enabled: false },
      revocation: { enabled: true },
      rpInitiatedLogout: {
        enabled: true,
        logoutSource: async (ctx, form) => {
          ctx.type = 'html';
          ctx.body = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Encerrando sessão</title><p role="status">Encerrando sessão GoDelivery…</p>${form}<button type="submit" form="op.logoutForm">Continuar</button><script>const form=document.getElementById('op.logoutForm');const logout=document.createElement('input');logout.type='hidden';logout.name='logout';logout.value='yes';form.append(logout);form.requestSubmit()</script>`;
        },
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => resource,
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx, requested, client) => {
          if (requested !== resource || client.clientId !== 'godelivery-angular') throw new Error('Invalid resource');
          return { scope: 'api', audience: process.env.OIDC_AUDIENCE ?? 'godelivery-api', accessTokenFormat: 'jwt', accessTokenTTL: 900 };
        },
      },
    },
    interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
    async findAccount(_ctx, id) {
      const user = await db.user.findUnique({ where: { id } });
      if (!user?.enabled) return undefined;
      return { accountId: id, async claims() { return { sub: id, email: user.email, name: user.name, role: user.role }; } };
    },
  });
  const server = app.getHttpAdapter().getInstance() as Express;
  const form = express.urlencoded({ extended: false, limit: '8kb' });
  const csrf = (uid: string) => createHmac('sha256', cookieSecret).update(uid).digest('hex');
  const csrfValid = (uid: string, sent: unknown) => typeof sent === 'string' && /^[a-f0-9]{64}$/.test(sent) && timingSafeEqual(Buffer.from(sent), Buffer.from(csrf(uid)));

  server.get('/interaction/:uid', async (req: Request, res: Response, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.set('Content-Security-Policy', "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; base-uri 'none'");
      const details = await provider.interactionDetails(req, res);
      const action = details.prompt.name === 'login' ? 'login' : 'confirm';
      const fields = action === 'login'
        ? '<label>Email <input name="email" type="email" autocomplete="username" required></label><label>Senha <input name="password" type="password" autocomplete="current-password" required></label>'
        : '<p>Autorizar o acesso do aplicativo GoDelivery aos dados da sua conta?</p>';
      const errorMessage = req.query.error === 'invalid_credentials' ? '<p role="alert" aria-live="assertive">Email ou senha inválidos</p>' : '';
      res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>GoDelivery · Entrar</title><style>body{font:16px system-ui;max-width:26rem;margin:10vh auto;padding:1rem}label{display:block;margin:1rem 0}input{display:block;width:100%;padding:.7rem}button{padding:.7rem 1.4rem}</style><h1>GoDelivery</h1>${errorMessage}<form method="post" action="/interaction/${escapeHtml(details.uid)}/${action}">${fields}<input type="hidden" name="csrf" value="${csrf(details.uid)}"><button>${action === 'login' ? 'Entrar' : 'Autorizar'}</button></form></html>`);
    } catch (error) { next(error); }
  });

  server.post('/interaction/:uid/login', form, async (req: Request, res: Response, next) => {
    try {
      if (!csrfValid(String(req.params.uid), req.body.csrf)) {
        req.log?.warn({ event: 'auth.login.failed', reason: 'csrf_invalid' }, 'Login rejected');
        return res.sendStatus(403);
      }
      const details = await provider.interactionDetails(req, res);
      if (details.prompt.name !== 'login') return res.sendStatus(400);
      const now = Date.now();
      const address = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        const email = String(req.body.email ?? '').trim().toLowerCase();
        const accountKey = `account:${createHmac('sha256', cookieSecret).update(email).digest('hex')}`;
        const ipKey = `ip:${address}`;
        const accountAttempts = loginAttempts.get(accountKey);
        const ipAttempts = loginAttempts.get(ipKey);
        const activeAccountAttempts = !accountAttempts || accountAttempts.resetAt <= now ? { count: 0, resetAt: now + loginAttemptWindowMs } : accountAttempts;
        const activeIpAttempts = !ipAttempts || ipAttempts.resetAt <= now ? { count: 0, resetAt: now + loginAttemptWindowMs } : ipAttempts;
        if (activeAccountAttempts.count >= loginAttemptLimit || activeIpAttempts.count >= loginIpAttemptLimit) {
          req.log?.warn({ event: 'auth.login.rate_limited', scope: activeAccountAttempts.count >= loginAttemptLimit ? 'account' : 'ip' }, 'Login rate limit reached');
        return res.status(429).type('html').send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>GoDelivery · Acesso temporariamente bloqueado</title><p role="alert" aria-live="assertive">Muitas tentativas. Aguarde um minuto e tente novamente</p></html>');
      }
        activeAccountAttempts.count++;
        activeIpAttempts.count++;
        loginAttempts.set(accountKey, activeAccountAttempts);
        loginAttempts.set(ipKey, activeIpAttempts);
      if (loginAttempts.size > 4096) {
        for (const [key, entry] of loginAttempts) if (entry.resetAt <= now) loginAttempts.delete(key);
        if (loginAttempts.size > 4096) loginAttempts.delete(loginAttempts.keys().next().value!);
      }
        const user = await db.user.findUnique({ where: { email } });
      if (!user?.enabled || !await argon2.verify(user.passwordHash, String(req.body.password ?? ''))) {
        req.log?.warn({ event: 'auth.login.failed', reason: 'invalid_credentials' }, 'Login rejected');
        return res.redirect(303, `/interaction/${encodeURIComponent(String(req.params.uid))}?error=invalid_credentials`);
      }
      await provider.interactionFinished(req, res, { login: { accountId: user.id } }, { mergeWithLastSubmission: false });
        loginAttempts.delete(accountKey);
        loginAttempts.delete(ipKey);
      req.log?.info({ event: 'auth.login.succeeded', subject: user.id }, 'User authenticated');
    } catch (error) { next(error); }
  });

  server.post('/interaction/:uid/confirm', form, async (req: Request, res: Response, next) => {
    try {
      if (!csrfValid(String(req.params.uid), req.body.csrf)) return res.sendStatus(403);
      const details = await provider.interactionDetails(req, res);
      if (details.prompt.name !== 'consent' || !details.session?.accountId) return res.sendStatus(400);
      const grant = details.grantId ? await provider.Grant.find(details.grantId) : new provider.Grant({ accountId: details.session.accountId, clientId: details.params.client_id as string });
      if (!grant) return res.sendStatus(400);
      const missing = details.prompt.details;
      if (missing.missingOIDCScope) grant.addOIDCScope((missing.missingOIDCScope as string[]).join(' '));
      if (missing.missingOIDCClaims) grant.addOIDCClaims(missing.missingOIDCClaims as string[]);
      if (missing.missingResourceScopes) for (const [indicator, scopes] of Object.entries(missing.missingResourceScopes)) grant.addResourceScope(indicator, (scopes as string[]).join(' '));
      const grantId = await grant.save();
      await provider.interactionFinished(req, res, { consent: details.grantId ? {} : { grantId } }, { mergeWithLastSubmission: true });
    } catch (error) { next(error); }
  });
  server.use('/oidc', (req: Request, res: Response, next) => {
    if (req.method === 'POST' && req.path === '/session/end/confirm') {
      res.once('finish', () => req.log?.info({ event: res.statusCode < 400 ? 'auth.idp_logout.succeeded' : 'auth.idp_logout.failed', statusCode: res.statusCode }, 'Identity provider logout processed'));
    }
    next();
  });
  server.use('/oidc', provider.callback());
}
