import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'itch.spec.ts',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4186',
    channel: 'chrome',
    viewport: { width: 1000, height: 720 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tools/serve-itch-fixture.mjs',
    url: 'http://127.0.0.1:4186/healthz',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
