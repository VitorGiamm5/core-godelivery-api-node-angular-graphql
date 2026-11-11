import { readFileSync } from 'node:fs';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import newman from 'newman';
import pg from 'pg';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import './generate-collection.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const settings = Object.fromEntries(readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/).filter(line => line.includes('=')).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const baseUrl = process.env.WEB_URL ?? settings.WEB_URL ?? 'http://localhost:9100';
const cookies = new Map();
const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
async function request(url, options = {}) {
  const response = await fetch(new URL(url, baseUrl), { ...options, redirect: 'manual', headers: { ...(options.headers ?? {}), Cookie: cookieHeader() } });
  for (const item of response.headers.getSetCookie()) {
    const [key, value] = item.split(';', 1)[0].split('=', 2);
    if (key) cookies.set(key, value ?? '');
  }
  return response;
}
const locationOf = (response) => {
  const location = response.headers.get('location');
  if (!location) throw new Error(`OIDC redirect missing after HTTP ${response.status}`);
  return new URL(location, baseUrl).toString();
};
async function followToInteractionOrCallback(url) {
  for (let i = 0; i < 12; i++) {
    if (url.startsWith(`${baseUrl}/callback`)) return { callback: url };
    const response = await request(url);
    if (response.status === 200 && url.includes('/interaction/')) return { html: await response.text(), url };
    if (![302, 303].includes(response.status)) throw new Error(`OIDC flow stopped at ${new URL(url).pathname}: HTTP ${response.status}`);
    url = locationOf(response);
  }
  throw new Error('OIDC redirect loop');
}
async function authenticate() {
  const discoveryResponse = await request('/oidc/.well-known/openid-configuration');
  if (!discoveryResponse.ok) throw new Error('OIDC discovery failed');
  const discovery = await discoveryResponse.json();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(18).toString('base64url');
  const auth = new URL(discovery.authorization_endpoint);
  auth.search = new URLSearchParams({ client_id: 'godelivery-angular', response_type: 'code', redirect_uri: `${baseUrl}/callback`, scope: 'openid email profile offline_access api', code_challenge: challenge, code_challenge_method: 'S256', state, resource: `${baseUrl}/oidc/api` }).toString();
  let step = await followToInteractionOrCallback(locationOf(await request(auth)));
  if (!step.html) throw new Error('OIDC login interaction missing');
  const csrf = /name="csrf" value="([^"]+)"/.exec(step.html)?.[1];
  if (!csrf) throw new Error('OIDC CSRF token missing');
  const loginResponse = await request(`${step.url}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: settings.ADMIN_EMAIL, password: settings.ADMIN_PASSWORD, csrf }) });
  if (![302, 303].includes(loginResponse.status)) throw new Error(`OIDC login failed: HTTP ${loginResponse.status}`);
  step = await followToInteractionOrCallback(locationOf(loginResponse));
  if (step.html) {
    const consentCsrf = /name="csrf" value="([^"]+)"/.exec(step.html)?.[1];
    if (!consentCsrf) throw new Error('OIDC consent CSRF token missing');
    const consentResponse = await request(`${step.url}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: consentCsrf }) });
    if (![302, 303].includes(consentResponse.status)) throw new Error(`OIDC consent failed: HTTP ${consentResponse.status}`);
    step = await followToInteractionOrCallback(locationOf(consentResponse));
  }
  if (!step.callback) throw new Error('OIDC authorization code missing');
  const callback = new URL(step.callback);
  if (callback.searchParams.get('state') !== state || !callback.searchParams.get('code')) throw new Error('OIDC state/code mismatch');
  const tokenResponse = await request(discovery.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: callback.searchParams.get('code'), redirect_uri: `${baseUrl}/callback`, client_id: 'godelivery-angular', code_verifier: verifier, resource: `${baseUrl}/oidc/api` }) });
  if (!tokenResponse.ok) throw new Error(`OIDC token exchange failed: HTTP ${tokenResponse.status} ${(await tokenResponse.text()).slice(0, 120)}`);
  const token = await tokenResponse.json();
  if (!token.access_token || !token.refresh_token || token.access_token.split('.').length !== 3) throw new Error('OIDC access/refresh tokens missing or not JWT');
  const refreshResponse = await request(discovery.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token.refresh_token, client_id: 'godelivery-angular', resource: `${baseUrl}/oidc/api` }) });
  if (!refreshResponse.ok) throw new Error(`OIDC refresh failed: HTTP ${refreshResponse.status} ${(await refreshResponse.text()).slice(0, 120)}`);
  const refreshed = await refreshResponse.json();
  if (!refreshed.access_token || !refreshed.refresh_token || refreshed.refresh_token === token.refresh_token) throw new Error('OIDC refresh rotation failed');
  return refreshed.access_token;
}
function cnpj() {
  let value = String(randomInt(10 ** 10, 10 ** 11));
  value += '0';
  for (let length = 12; length < 14; length++) {
    let weight = length - 7;
    let sum = 0;
    for (const digit of value.slice(0, length)) { sum += Number(digit) * weight; weight = weight === 2 ? 9 : weight - 1; }
    value += String(sum % 11 < 2 ? 0 : 11 - sum % 11);
  }
  return value;
}
const plate = `QZA${randomInt(1000, 9999)}`;
const plateChanged = `QZB${plate.slice(3)}`;
const queuePlate = `QZC${plate.slice(3)}`;
const document = cnpj();
const licenseNumber = String(randomInt(10 ** 10, 10 ** 11));
const startDate = new Date(Date.now() - 6 * 86_400_000).toISOString();
const returnDate = new Date(new Date(startDate).getTime() + 6 * 86_400_000).toISOString();
const db = new pg.Client({ host: '127.0.0.1', port: Number(process.env.POSTGRES_HOST_PORT ?? 9101), user: settings.POSTGRES_USER, password: settings.POSTGRES_PASSWORD, database: settings.POSTGRES_DB });
let connected = false;
try {
  const accessToken = await authenticate();
  await new Promise((resolveRun, rejectRun) => newman.run({
    collection: resolve(root, 'tests/collection.json'),
    envVar: [
      { key: 'baseUrl', value: baseUrl }, { key: 'accessToken', value: accessToken },
      { key: 'plate', value: plate }, { key: 'plateChanged', value: plateChanged }, { key: 'cnpj', value: document }, { key: 'licenseNumber', value: licenseNumber },
      { key: 'startDate', value: startDate }, { key: 'returnDate', value: returnDate },
      { key: 'licenseBase64', value: readFileSync(resolve(root, 'tests/fixtures/CNH.bmp')).toString('base64') },
    ], reporters: ['cli'],
  }, (error, summary) => {
    if (error) rejectRun(error);
    else if (summary.run.failures.length) rejectRun(new Error(`${summary.run.failures.length} Postman assertions failed`));
    else resolveRun();
  }));
  await db.connect(); connected = true;
  const queueResponse = await fetch(`${baseUrl}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ query: 'mutation($input: CreateMotorcycleInput!) { createMotorcycle(input: $input) { id } }', variables: { input: { plate: queuePlate, yearManufacture: new Date().getFullYear(), modelName: 'Honda Pop' } } }) });
  const queueResult = await queueResponse.json();
  const queueMotorcycleId = queueResult.data?.createMotorcycle?.id;
  if (!queueMotorcycleId) throw new Error(`Queue fixture create failed: ${JSON.stringify(queueResult.errors)}`);
  let notificationCount = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await db.query('SELECT count(*)::int AS total FROM "Notification" WHERE "motorcycleId" = $1', [queueMotorcycleId]);
    notificationCount = result.rows[0].total;
    if (notificationCount > 0) break;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 200));
  }
  if (notificationCount < 1) throw new Error('RabbitMQ notification was not persisted');
  console.log('RabbitMQ notification persisted');
  console.log('OAuth/OIDC and Postman E2E passed');
} finally {
  try {
    if (!connected) { await db.connect(); connected = true; }
    await db.query('BEGIN');
    const ids = await db.query('SELECT id FROM "Motorcycle" WHERE "plateNormalized" IN ($1, $2, $3)', [plate, plateChanged, queuePlate]);
    for (const row of ids.rows) {
      await db.query('DELETE FROM "Notification" WHERE "motorcycleId" = $1', [row.id]);
      await db.query('DELETE FROM "Rental" WHERE "motorcycleId" = $1', [row.id]);
      await db.query('DELETE FROM "Motorcycle" WHERE id = $1', [row.id]);
    }
    const people = await db.query('SELECT id FROM "Deliverier" WHERE cnpj = $1', [document]);
    for (const row of people.rows) {
      await db.query('DELETE FROM "Rental" WHERE "deliverierId" = $1', [row.id]);
      await db.query('DELETE FROM "License" WHERE "deliverierId" = $1', [row.id]);
      await db.query('DELETE FROM "Deliverier" WHERE id = $1', [row.id]);
    }
    await db.query('COMMIT');
  } catch (error) { if (connected) await db.query('ROLLBACK'); console.error('Fixture cleanup failed:', error.message); }
  finally { if (connected) await db.end(); }
  try {
    const s3 = new S3Client({ region: 'us-east-1', endpoint: process.env.S3_TEST_ENDPOINT ?? `http://localhost:${process.env.S3_HOST_PORT ?? 9104}`, forcePathStyle: true, credentials: { accessKeyId: settings.S3_ACCESS_KEY, secretAccessKey: settings.S3_SECRET_KEY } });
    await s3.send(new DeleteObjectCommand({ Bucket: 'godelivery-node-cnh', Key: `licenses/${licenseNumber}.bmp` }));
    s3.destroy();
  } catch (error) { console.error('S3 fixture cleanup failed:', error.message); }
}
