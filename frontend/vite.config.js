import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    sourcemap: true, // necessário para o upload de source maps no Sentry
    // Sem o polyfill de modulepreload não sobra NENHUM <script> inline no
    // index.html — assim a CSP pode usar `script-src 'self'` (sem
    // 'unsafe-inline'). Navegadores atuais (alvo: celulares da equipe)
    // suportam modulepreload nativo.
    modulepreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: {
          // Recharts é pesado e só a view Dashboard usa — mantém fora do
          // bundle inicial (a view é carregada com React.lazy).
          recharts: ["recharts"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.js"],
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      // Só o domínio (regras puras) entra no gate de cobertura. A lib de
      // motion tem teste dos comportamentos críticos (reduced-motion,
      // Presence), mas cobertura 100% não é o objetivo dela. Services/
      // hooks/auth são I/O — cobertos por integração/e2e (issue #4).
      include: ["src/domain/**/*.js"],
      exclude: ["src/**/*.{test,spec}.{js,jsx}", "src/**/__tests__/**", "src/domain/index.js"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
