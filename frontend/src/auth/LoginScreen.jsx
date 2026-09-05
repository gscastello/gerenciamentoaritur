// src/auth/LoginScreen.jsx
//
// Tela de login por e-mail/senha (Supabase Auth). Sem cadastro público —
// contas são criadas pelo admin no painel do Supabase (Authentication →
// Users) ou por um futuro fluxo de convite. Ver AGENTS.md §papéis.

import { useState } from "react";
import { Route } from "lucide-react";
import { useAuth } from "./AuthProvider.jsx";
import { ProgressBar } from "../ui/motion/index.js";

const C = {
  bg: "#0E1116",
  panel: "#161B22",
  panel2: "#1C222B",
  border: "#262D38",
  ink: "#ECEEF2",
  inkSoft: "#8B93A3",
  amber: "#E8A33D",
  red: "#F0625F",
};

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
      setError(err?.message?.includes("Invalid login") ? "E-mail ou senha incorretos." : err?.message || "Falha ao entrar.");
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
          width: "100%",
          maxWidth: 360,
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.amber, marginBottom: 4 }}>
          <Route size={20} strokeWidth={2.3} />
          <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>Gestão AriTur</span>
        </div>
        <p style={{ color: C.inkSoft, fontSize: 13, margin: "0 0 20px" }}>
          Entre com sua conta da equipe.
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

        {error && (
          <div style={{ color: C.red, fontSize: 12, marginTop: 12 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            marginTop: 20,
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            background: busy ? C.border : C.amber,
            color: busy ? C.inkSoft : "#20180A",
            fontWeight: 600,
            fontSize: 14,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
        {busy && (
          <div style={{ marginTop: 12 }}>
            <ProgressBar />
          </div>
        )}
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
