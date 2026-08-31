// Tailwind (base/components/utilities) — carregado antes de tudo para que
// tokens.css e os estilos inline dos componentes tenham precedência.
import "./index.css";

import React from "react";
import { createRoot } from "react-dom/client";
import { initObservability, reportError } from "./observability/index.js";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import { AuthGate } from "./auth/AuthGate.jsx";
import App from "./app/App.jsx";

initObservability();

window.addEventListener("unhandledrejection", (e) => reportError(e.reason, { kind: "unhandledrejection" }));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </React.StrictMode>,
);
