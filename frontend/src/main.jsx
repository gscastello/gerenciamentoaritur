import "./lib/storageShim.js";

import React from "react";
import { createRoot } from "react-dom/client";
import { initObservability, reportError } from "./observability/index.js";
import App from "./app/App.jsx";

initObservability();

window.addEventListener("unhandledrejection", (e) => reportError(e.reason, { kind: "unhandledrejection" }));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
