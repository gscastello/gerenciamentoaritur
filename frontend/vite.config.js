import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA (issue: uso diário no celular — instalar na tela inicial,
    // abrir sem depender de rede pra baixar o app de novo). Só o
    // SHELL (JS/CSS/HTML/fontes/ícones) é pré-cacheado; dado de verdade
    // (reservas, capacidade, financeiro) NUNCA passa pelo cache do
    // service worker — vai sempre à rede (ver runtimeCaching abaixo).
    // Uma tela offline sem internet nenhuma é melhor que a do próprio
    // navegador, mas o app continua exigindo rede pra qualquer ação
    // real, do jeito que sempre foi (capacidade decidida pelo banco).
    VitePWA({
      registerType: "prompt",
      // registro manual (src/pwa/PWAUpdatePrompt.jsx, virtual:pwa-register/react)
      // — decide QUANDO trocar de versão, em vez do <script> automático
      // do plugin recarregar a página sozinho no meio de alguma anotação.
      injectRegister: false,
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "Gestão AriTur",
        short_name: "AriTur",
        description: "Painel operacional da AriTur Transportes — reservas, agenda, lista do dia e financeiro.",
        lang: "pt-BR",
        theme_color: "#E4121F",
        background_color: "#08090B",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // as duas viagens de fundo (aritur-bg/aritur-hero, ~590KB cada)
        // não entram no precache — pesariam demais na instalação num
        // celular com dado limitado. Cacheiam sozinhas no 1º uso (regra
        // "video" abaixo).
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        globIgnores: ["icon-gen.html"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/(rest|rpc|auth|realtime|storage|functions)\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Supabase (dados, autenticação, RPCs) — NUNCA cacheado. É
            // sempre rede ou erro claro; nenhuma tela mostra número
            // (vaga, capacidade, saldo) que possa estar desatualizado.
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) => url.hostname === "fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request, url }) =>
              url.origin === self.location.origin &&
              (request.destination === "video" || request.destination === "image"),
            handler: "CacheFirst",
            options: {
              cacheName: "aritur-media",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
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
      // issue #4: apertado depois da leva de testes do motor de regras.
      thresholds: {
        statements: 97,
        branches: 92,
        functions: 100,
        lines: 97,
      },
    },
  },
});
