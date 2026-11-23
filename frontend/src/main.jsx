// Tailwind (base/components/utilities) — carregado antes de tudo para que
// tokens.css e os estilos inline dos componentes tenham precedência.
import "./index.css";

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.jsx";
import { AuthGate } from "./auth/AuthGate.jsx";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import { carregarFonte } from "./lib/fonte.js";
import { applyMotion } from "./lib/motion.js";
import { initObservability, reportError } from "./observability/index.js";
import { PWAUpdatePrompt } from "./pwa/PWAUpdatePrompt.jsx";

// Resolve a preferência de movimento antes do primeiro paint (evita
// piscar animação para quem tem "reduzir movimento" no sistema).
applyMotion();
carregarFonte();

initObservability();

window.addEventListener("unhandledrejection", (e) =>
  reportError(e.reason, { kind: "unhandledrejection" }),
);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
    <PWAUpdatePrompt />
  </React.StrictMode>,
);
