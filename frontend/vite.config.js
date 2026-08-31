import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    sourcemap: true, // necessário para o upload de source maps no Sentry
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
      // Só o que tem teste unitário de verdade entra no gate: o domínio
      // (regras puras) e a lib de motion. Services/hooks/auth são camada
      // de I/O — cobertos por integração/e2e (issue #4), não por unit.
      include: ["src/domain/**/*.js", "src/ui/motion/**/*.{js,jsx}"],
      exclude: ["src/**/*.{test,spec}.{js,jsx}", "src/**/__tests__/**", "src/domain/index.js"],
      thresholds: {
        statements: 75,
        branches: 75,
        functions: 75,
        lines: 75,
        "src/domain/**/*.js": {
          statements: 90,
          branches: 85,
          functions: 95,
          lines: 90,
        },
      },
    },
  },
});
