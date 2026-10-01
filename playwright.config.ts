import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: 'itch.spec.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && PORT=4174 HOST=127.0.0.1 npm run serve',
    url: 'http://127.0.0.1:4174/healthz',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
