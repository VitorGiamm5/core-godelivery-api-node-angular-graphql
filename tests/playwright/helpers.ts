import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

export const baseUrl = process.env.WEB_URL ?? 'http://localhost:9100';

export function envValue(key: string) {
  const line = readFileSync(resolve(import.meta.dirname, '../../.env'), 'utf8').split(/\r?\n/).find(value => value.startsWith(`${key}=`));
  if (!line) throw new Error(`Missing ${key} in angular-node-graphql/.env`);
  return line.slice(key.length + 1);
}

export async function startLogin(page: Page, password = envValue('ADMIN_PASSWORD'), email = envValue('ADMIN_EMAIL'), origin = baseUrl) {
  await page.goto(`${origin}/`);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

export async function finishConsentIfPresent(page: Page) {
  const consentButton = page.getByRole('button', { name: 'Autorizar' });
  if (await consentButton.isVisible().catch(() => false)) await consentButton.click();
}

export async function login(page: Page, origin = baseUrl) {
  await startLogin(page, envValue('ADMIN_PASSWORD'), envValue('ADMIN_EMAIL'), origin);
  await finishConsentIfPresent(page);
  await page.waitForURL(`${origin}/`);
  await page.getByRole('navigation', { name: 'Módulos' }).waitFor();
}

export function apiLogEvents(event: string) {
  const result = spawnSync('docker', ['compose', 'logs', '--no-color', '--no-log-prefix', '--tail', '1000', 'api-blue', 'api-green'], {
    cwd: resolve(import.meta.dirname, '../..'),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`Could not inspect API logs: ${result.stderr.slice(0, 300)}`);
  return result.stdout.split(/\r?\n/).flatMap(line => {
    if (!line.startsWith('{')) return [];
    try {
      const record = JSON.parse(line);
      return record.event === event ? [record] : [];
    } catch { return []; }
  });
}
