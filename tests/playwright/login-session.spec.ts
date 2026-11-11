import { expect, test } from '@playwright/test';
import { apiLogEvents, baseUrl, envValue, login, startLogin } from './helpers.js';

const canonicalUrl = new URL(baseUrl);
const oidcIssuer = `${canonicalUrl.origin}/oidc`;

test('[@NORMAL] login cria sessão isolada por aba e mantém a sessão após recarregar', async ({ page, context }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: 'Motocicletas', exact: true })).toBeVisible();
  const originalTokens = await page.evaluate(() => ({
    access: sessionStorage.getItem('access_token'),
    refresh: sessionStorage.getItem('refresh_token'),
    expires: Number(sessionStorage.getItem('expires_at')),
    state: sessionStorage.getItem('oauth_state'),
    verifier: sessionStorage.getItem('pkce_verifier'),
    url: location.href,
  }));
  expect(originalTokens.access).toMatch(/^eyJ/);
  expect(originalTokens.refresh).toBeTruthy();
  expect(originalTokens.expires).toBeGreaterThan(Date.now());
  expect(originalTokens.state).toBeNull();
  expect(originalTokens.verifier).toBeNull();
  expect(originalTokens.url).toBe(`${baseUrl}/`);

  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

  const secondTab = await context.newPage();
  await secondTab.goto('/');
  await expect(secondTab.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await expect(secondTab.getByRole('navigation', { name: 'Módulos' })).toHaveCount(0);
  await secondTab.close();

  const events = apiLogEvents('auth.login.succeeded');
  expect(events.length).toBeGreaterThan(0);
  expect(events.at(-1).level).toBe(30);
  expect(events.at(-1).req.url).toBe('/interaction/:id/login');
  const serialized = JSON.stringify(events.at(-1));
  expect(serialized).not.toContain(envValue('ADMIN_PASSWORD'));
  expect(serialized).not.toMatch(/access_token|refresh_token|authorization code/i);
});

test('[@MODERADA] login por 127.0.0.1 aceita o callback e preserva o issuer canônico', async ({ page }) => {
  const origin = `http://127.0.0.1:${canonicalUrl.port}`;
  await login(page, origin);
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible();
  await expect(page).toHaveURL(`${origin}/`);

  const issuer = await page.evaluate(() => {
    const token = sessionStorage.getItem('access_token')!;
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).iss as string;
  });
  expect(issuer).toBe(oidcIssuer);
});

test('[@GRAVE] refresh simultâneo durante a carga inicial usa uma única rotação', async ({ page }) => {
  await login(page);
  const originalRefresh = await page.evaluate(() => sessionStorage.getItem('refresh_token'));
  await page.evaluate(() => sessionStorage.setItem('expires_at', '0'));
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('refresh_token'))).not.toBe(originalRefresh);
  await expect(page.getByRole('heading', { name: 'Motocicletas', exact: true })).toBeVisible();
});

test('[@NORMAL] logout encerra a sessão e bloqueia o token anterior', async ({ page }) => {
  await login(page);
  const accessToken = await page.evaluate(() => sessionStorage.getItem('access_token'));
  const mainFrameNavigations: string[] = [];
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) mainFrameNavigations.push(frame.url());
  });
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect.poll(() => {
    const logoutIndex = mainFrameNavigations.findIndex(url => new URL(url).pathname.startsWith('/oidc/session/end'));
    return logoutIndex >= 0 && mainFrameNavigations.slice(logoutIndex + 1).some(url => new URL(url).pathname === '/');
  }).toBe(true);
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    access: sessionStorage.getItem('access_token'),
    refresh: sessionStorage.getItem('refresh_token'),
    expiry: sessionStorage.getItem('expires_at'),
    idToken: sessionStorage.getItem('id_token'),
  }))).toEqual({ access: null, refresh: null, expiry: null, idToken: null });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();

  const response = await page.request.post(`${baseUrl}/graphql`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { query: '{ motorcycleModels { id } }' },
  });
  const result = await response.json();
  expect(result.errors?.[0]?.message).toMatch(/revoked|expired/i);
  const logoutEvents = apiLogEvents('auth.logout.succeeded');
  expect(logoutEvents.length).toBeGreaterThan(0);
  expect(logoutEvents.at(-1).level).toBe(30);
  const idpLogoutEvents = apiLogEvents('auth.idp_logout.succeeded');
  expect(idpLogoutEvents.length).toBeGreaterThan(0);
  expect(idpLogoutEvents.at(-1).level).toBe(30);
  const serialized = JSON.stringify([...logoutEvents, ...idpLogoutEvents]);
  expect(serialized).not.toMatch(/id_token_hint|access_token|refresh_token|authorization|referer/i);

  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
});

test('[@MODERADA] credenciais inválidas dão erro acessível e geram log de segurança sem segredo', async ({ page }) => {
  await startLogin(page, 'senha-incorreta-de-proposito');
  await expect(page.getByRole('alert')).toContainText(/inválid|incorret/i);
  await expect(page.locator('input[name="password"]')).toBeVisible();

  const failures = apiLogEvents('auth.login.failed');
  expect(failures.length).toBeGreaterThan(0);
  expect(failures.at(-1).level).toBe(40);
  expect(failures.at(-1).req.url).toBe('/interaction/:id/login');
  const serialized = JSON.stringify(failures.at(-1));
  expect(serialized).not.toContain('senha-incorreta-de-proposito');
  expect(serialized).not.toContain(envValue('ADMIN_PASSWORD'));
  expect(serialized).not.toMatch(/authorization code|access_token|refresh_token/i);
});

test('[@MODERADA] callback com state adulterado não troca o código e limpa PKCE', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('pkce_verifier', 'x'.repeat(64));
    sessionStorage.setItem('oauth_state', 'state-legitimo');
  });
  let tokenExchangeCount = 0;
  page.on('request', request => {
    if (request.url().endsWith('/oidc/token')) tokenExchangeCount++;
  });
  await page.goto('/callback?code=nao-usar&state=state-adulterado&iss=invalid');
  await expect(page.getByRole('alert')).toContainText(/inválido/i);
  await expect(page).toHaveURL(`${baseUrl}/`);
  expect(tokenExchangeCount).toBe(0);
  expect(await page.evaluate(() => ({
    access: sessionStorage.getItem('access_token'),
    state: sessionStorage.getItem('oauth_state'),
    verifier: sessionStorage.getItem('pkce_verifier'),
  }))).toEqual({ access: null, state: null, verifier: null });
});

test('[@GRAVE] callback rejeita issuer adulterado mesmo com state válido', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('pkce_verifier', 'x'.repeat(64));
    sessionStorage.setItem('oauth_state', 'state-legitimo');
  });
  let tokenExchangeCount = 0;
  page.on('request', request => { if (request.url().endsWith('/oidc/token')) tokenExchangeCount++; });
  await page.goto('/callback?code=nao-usar&state=state-legitimo&iss=https%3A%2F%2Foutro-idp.example');
  await expect(page.getByRole('alert')).toContainText(/inválido/i);
  await expect(page).toHaveURL(`${baseUrl}/`);
  expect(tokenExchangeCount).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem('pkce_verifier'))).toBeNull();
});

test('[@APOCALIPTICO] falha do provedor de identidade não deixa erro JavaScript sem tratamento', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/oidc/.well-known/openid-configuration', route => route.abort('connectionrefused'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText(/identidade|indisponível/i);
  expect(pageErrors).toEqual([]);
});

test('[@ABSURDO] storage de sessão corrompido termina sessão sem bloquear nova tentativa', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('access_token', 'not.a.jwt');
    sessionStorage.setItem('refresh_token', 'refresh-corrompido');
    sessionStorage.setItem('expires_at', '0');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/sessão expirada/i);
  expect(await page.evaluate(() => ['access_token', 'refresh_token', 'expires_at'].every(key => sessionStorage.getItem(key) === null))).toBe(true);
});

test('[@APOCALIPTICO] logout local continua seguro quando revogação do IdP falha', async ({ page }) => {
  await login(page);
  await page.route('**/oidc/token/revocation', route => route.abort('connectionrefused'));
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/identidade|indisponível/i);
  expect(await page.evaluate(() => sessionStorage.getItem('access_token'))).toBeNull();
});

test('[@ABSURDO] dez credenciais incorretas bloqueiam novas tentativas e registram alerta', async ({ page }) => {
  await startLogin(page, 'senha-incorreta-de-proposito');
  await expect(page.getByRole('alert')).toContainText(/inválid/i);
  const form = page.locator('form');
  const action = await form.getAttribute('action');
  const csrf = await page.locator('input[name="csrf"]').inputValue();
  expect(action).toBeTruthy();
  for (let attempt = 2; attempt <= 10; attempt++) {
    const response = await page.request.post(new URL(action!, page.url()).toString(), {
      form: { email: envValue('ADMIN_EMAIL'), password: `senha-incorreta-${attempt}`, csrf },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
  }
  await page.getByLabel('Email').fill(envValue('ADMIN_EMAIL'));
  await page.locator('input[name="password"]').fill('senha-incorreta-11');
  const interactionPath = new URL(action!, page.url()).pathname;
  const blockedResponse = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === interactionPath,
  );
  await page.getByRole('button', { name: 'Entrar' }).click();
  expect((await blockedResponse).status()).toBe(429);
  await expect(page.getByRole('alert')).toContainText(/muitas tentativas/i);
  const events = apiLogEvents('auth.login.rate_limited');
  expect(events.length).toBeGreaterThan(0);
  expect(events.at(-1).level).toBe(40);
  expect(events.at(-1).scope).toBe('account');
});
