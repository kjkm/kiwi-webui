import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/signin',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PUBLIC_APP_NAME: 'Kiwi WebUI',
      PUBLIC_BASE_URL: 'http://127.0.0.1:4173',
      DATABASE_PATH: './data/e2e.db',
      SESSION_TTL_SECONDS: '3600',
      OIDC_ISSUER: 'http://127.0.0.1:43210',
      OIDC_CLIENT_ID: 'kiwi-e2e',
      OIDC_CLIENT_SECRET: 'e2e-secret',
      OIDC_ALLOW_INSECURE_HTTP: 'true',
      OPENAI_BASE_URL: 'http://127.0.0.1:43211/v1',
      OPENAI_API_KEY: 'e2e-key',
      OPENAI_MODEL: 'e2e-model'
    }
  }
});
