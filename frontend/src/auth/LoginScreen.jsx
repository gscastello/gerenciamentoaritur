// src/auth/LoginScreen.jsx
//
// Tela de login por e-mail/senha (Supabase Auth). Sem cadastro público —
// contas são criadas pelo admin no painel do Supabase (Authentication →
// Users) ou por um futuro fluxo de convite. Ver AGENTS.md §papéis.

import { useState } from "react";
import { useAuth } from "./AuthProvider.jsx";
import { ProgressBar } from "../ui/motion/index.js";

const C = {
  bg: "#08090B",
  panel: "#111214",
  panel2: "#191A1D",
  border: "#292A2E",
  ink: "#F2F3F5",
  inkSoft: "#9CA0A8",
  inkFaint: "#63666D",
  brand: "#E4121F",
  brandDim: "#A50D17",
  red: "#F0625F",
};

function Mark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 3 L44 45 H33 L24 24 L15 45 H4 Z" fill={C.brand} />
      <path d="M24 3 L44 45 H33 L24 24 Z" fill={C.brandDim} />
      <rect x="17.5" y="33" width="13" height="4.2" rx="1" fill={C.bg} />
    </svg>
  );
}

function Bus() {
  return (
    <svg
      viewBox="0 0 220 84"
      fill="none"
      aria-hidden="true"
      style={{ position: "absolute", width: 320, left: -40, bottom: -30, opacity: 0.08 }}
    >
      <path
        d="M6 20c0-6 4-10 10-10h150c22 0 40 12 48 30l4 9c1 3 2 6 2 9v9c0 4-3 7-7 7h-14a16 16 0 0 0-32 0H70a16 16 0 0 0-32 0H14c-4 0-8-3-8-8V20Z"
        fill={C.brand}
      />
      <g fill={C.brand} opacity="0.9">
        <circle cx="54" cy="72" r="11" />
        <circle cx="186" cy="72" r="11" />
      </g>
    </svg>
  );
}

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      // AuthProvider troca a tela sozinho ao receber a sessão.
    } catch (err) {
      setError(
        err?.message?.includes("Invalid login")
          ? "E-mail ou senha incorretos."
          : err?.message || "Falha ao entrar.",
      );
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        color: C.ink,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          position: "relative",
          overflow: "hidden",
          width: "100%",
          maxWidth: 380,
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          padding: 30,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(120% 90% at 100% 0%, rgba(228,18,31,0.16) 0%, transparent 55%)",
          }}
        />
        <Bus />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Mark />
            <div style={{ lineHeight: 1 }}>
              <div
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.35rem",
                  letterSpacing: "0.04em",
                }}
              >
                ARI<span style={{ color: C.brand }}>TUR</span>
              </div>
              <div
                style={{
                  fontSize: "0.55rem",
                  letterSpacing: "0.22em",
                  color: C.inkFaint,
                  marginTop: 5,
                }}
              >
                TRANSPORTE DE PASSAGEIROS
              </div>
            </div>
          </div>
          <p style={{ color: C.inkSoft, fontSize: 13, margin: "14px 0 20px" }}>
            <b style={{ color: C.ink }}>Gestão AriTur</b> — entre com sua conta da equipe.
          </p>

          <label style={{ display: "block", fontSize: 12, color: C.inkSoft, marginBottom: 4 }}>
            E-mail
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>

          <label style={{ display: "block", fontSize: 12, color: C.inkSoft, marginTop: 14 }}>
            Senha
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>

          {error && <div style={{ color: C.red, fontSize: 12, marginTop: 12 }}>{error}</div>}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 20,
              padding: "11px 16px",
              borderRadius: 11,
              border: "none",
              background: busy ? C.border : C.brand,
              color: busy ? C.inkSoft : "#fff",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "0.02em",
              cursor: busy ? "default" : "pointer",
              boxShadow: busy ? "none" : "0 8px 22px -8px rgba(228,18,31,0.55)",
            }}
          >
            {busy ? "Entrando…" : "Entrar"}
          </button>
          {busy && (
            <div style={{ marginTop: 12 }}>
              <ProgressBar />
            </div>
          )}
          <div
            style={{
              marginTop: 18,
              fontSize: "0.62rem",
              letterSpacing: "0.14em",
              color: C.inkFaint,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            MAIS QUE TRANSPORTE, <span style={{ color: C.brand }}>CONECTAMOS PESSOAS.</span>
          </div>
        </div>
      </form>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: C.panel2,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 12px",
  color: C.ink,
  fontSize: 14,
  outline: "none",
};
