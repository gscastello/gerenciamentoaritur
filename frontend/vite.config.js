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
      include: ["src/**/*.{js,jsx}"],
      exclude: [
        "src/**/*.{test,spec}.{js,jsx}",
        "src/main.jsx",
        "src/**/__tests__/**",
        "src/observability/**", // instrumentação: coberta por e2e, não unit
      ],
      // Gate global. O gate mais rígido dos módulos críticos (motor de
      // vagas, financeiro) fica no codecov.yml.
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
        "src/domain/**/*.js": {
          statements: 95,
          branches: 90,
          functions: 100,
          lines: 95,
        },
      },
    },
  },
});
