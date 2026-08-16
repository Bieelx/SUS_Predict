import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3010',
    headless: true,
  },
  webServer: [
    {
      command: 'env APP_ENV=development SUS_PREDICT_DEV_AUTH=true SUS_PREDICT_DEV_PASSWORD=playwright-local-password SUSBOT_DEV_AUTH_SECRET=playwright-secret-with-at-least-32-characters FRONTEND_URL=http://127.0.0.1:3010 CORS_ALLOWED_ORIGINS=http://127.0.0.1:3010 AUTH_COOKIE_SECURE=false SQLITE_PATH=/tmp/sus-predict-playwright.db ../venv/bin/python -m uvicorn main:app --app-dir ../api --host 127.0.0.1 --port 8010',
      url: 'http://127.0.0.1:8010/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'env VITE_API_BASE=http://127.0.0.1:8010 npm run dev -- --host 127.0.0.1 --port 3010 --strictPort',
      url: 'http://127.0.0.1:3010',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
