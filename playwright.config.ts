import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'output/playwright/html', open: 'never' }], ['json', { outputFile: 'output/playwright/results.json' }]],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:9100',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
