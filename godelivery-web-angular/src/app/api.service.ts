import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private readonly auth: AuthService) {}

  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch('/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this.auth.token()}` }, body: JSON.stringify({ query, variables }) });
    const result = await response.json() as { data?: T; errors?: { message: string }[] };
    if (!response.ok || result.errors?.length || !result.data) throw new Error(result.errors?.map(error => error.message).join('; ') ?? `HTTP ${response.status}`);
    return result.data;
  }

  async uploadLicense(id: string, file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    const response = await fetch(`/api/licenses/${encodeURIComponent(id)}/file`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this.auth.token()}` }, body: JSON.stringify({ licenseImageBase64: base64 }) });
    if (!response.ok) throw new Error(`Falha no envio da CNH: HTTP ${response.status}`);
  }

  async downloadLicense(id: string) {
    const response = await fetch(`/api/licenses/${encodeURIComponent(id)}/file`, { headers: { Authorization: `Bearer ${await this.auth.token()}` } });
    if (!response.ok) throw new Error(`CNH não encontrada: HTTP ${response.status}`);
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
