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
  red: "#F0625F",
};

const SERIF = "'Fraunces', 'Times New Roman', Georgia, serif";
const MONO_T = "#DDDEE2";

// Monograma "AT" com a fita da rodovia — recriação vetorial da logo AriTur.
function Mark({ size = 46 }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }} aria-hidden="true">
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        <path
          d="M1 62 C 22 34, 44 12, 76 8 C 90 6, 99 13, 99 26 C 92 19, 82 19, 71 23 C 44 33, 24 55, 12 76 Z"
          fill="#2A2A30"
        />
        <path
          d="M6 60 C 26 34, 46 15, 76 12"
          stroke={C.brand}
          strokeWidth="2.6"
          strokeDasharray="5 6"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: SERIF,
          lineHeight: 1,
        }}
      >
        <span
          style={{
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: size * 0.9,
            color: C.brand,
            textShadow: "0 1px 2px rgba(0,0,0,.55)",
          }}
        >
          A
        </span>
        <span style={{ fontWeight: 700, fontSize: size * 0.82, color: MONO_T, marginLeft: -size * 0.28 }}>
          T
        </span>
      </span>
    </div>
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
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <Mark />
            <div style={{ lineHeight: 1 }}>
              <div
                style={{
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  fontWeight: 700,
                  fontSize: "1.7rem",
                  letterSpacing: "0.005em",
                }}
              >
                <span style={{ color: C.brand }}>Ari</span>
                <span style={{ color: MONO_T }}>Tur</span>
              </div>
              <div
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 600,
                  fontSize: "0.55rem",
                  letterSpacing: "0.42em",
                  color: C.inkSoft,
                  marginTop: 7,
                }}
              >
                TRANSPORTES
              </div>
              <div
                style={{
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  fontSize: "0.66rem",
                  color: C.inkFaint,
                  marginTop: 6,
                }}
              >
                Conectando destinos, cuidando de cada viagem
              </div>
            </div>
          </div>
          <p style={{ color: C.inkSoft, fontSize: 13, margin: "16px 0 20px" }}>
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
