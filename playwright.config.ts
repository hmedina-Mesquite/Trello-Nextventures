import { defineConfig, devices } from '@playwright/test'

// Vite's default dev port (vite.config.ts sets no explicit port).
const PORT = process.env.PORT ?? '5173'
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Boots the real app (npm run dev) so these tests exercise the actual
  // Supabase-backed frontend, not a mock. Requires a valid .env with
  // VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example) and a
  // live Supabase project with the supabase/migrations/*.sql applied.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
