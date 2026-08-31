import { defineConfig, devices } from "@playwright/test";

// E2E dos fluxos de Agenda/Reservas (AGENTS.md §3). Sobe o preview do
// build; no CI o build já roda antes.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // placeholders só para o build embutir algo — o e2e sem sessão só
    // testa a tela de login. Fluxos autenticados = issue #4.
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://e2e-placeholder.supabase.co",
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || "e2e-placeholder-key",
    },
  },
});
