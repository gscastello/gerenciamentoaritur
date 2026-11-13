// src/auth/LoginScreen.jsx
//
// Tela de login por e-mail/senha (Supabase Auth). Sem cadastro público —
// contas são criadas pelo admin no painel do Supabase (Authentication →
// Users) ou por um futuro fluxo de convite. Ver AGENTS.md §papéis.

import { useState } from "react";
import { ProgressBar } from "../ui/motion/index.js";
import { useAuth } from "./AuthProvider.jsx";

const C = {
  bg: "#0A0B0D",
  panel: "#131417",
  panel2: "#1B1C20",
  border: "#2A2C31",
  ink: "#F3F4F6",
  inkSoft: "#A7ABB3",
  inkFaint: "#8A8E96",
  brand: "#E4121F",
  red: "#F0625F",
};

export function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lembrar, setLembrar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password, lembrar);
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

  // Crítica de design (issue #393): a marca recebe quem chega. A foto vertical do ônibus enche
  // a tela, com um véu escuro que garante a leitura; a logo oficial (que já traz o slogan) fica
  // logo acima do formulário. É a única tela com a marca em tamanho cheio.
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "100dvh",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        background: C.bg,
        color: C.ink,
        fontFamily: "'Inter', 'Helvetica Neue', Arial, system-ui, sans-serif",
      }}
    >
      <img
        src="/brand/login-onibus.webp"
        alt=""
        aria-hidden="true"
        width={900}
        height={1600}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "50% 30%",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, rgba(10,11,13,0) 18%, rgba(10,11,13,.78) 48%, ${C.bg} 66%)`,
        }}
      />
      <form
        onSubmit={onSubmit}
        className="anim-fadeUp"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 400,
          padding: "0 20px max(28px, env(safe-area-inset-bottom))",
          display: "grid",
          gap: 10,
        }}
      >
        <h1 className="sr-only">Gestão AriTur</h1>
        <img
          src="/brand/logo-fundo-escuro.webp"
          alt="AriTur Transportes — Conectando destinos, cuidando de cada viagem"
          width={560}
          height={542}
          style={{
            width: "min(200px, 56vw)",
            height: "auto",
            display: "block",
            margin: "0 auto 6px",
          }}
        />

        <label style={labelStyle}>
          E-mail
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Senha
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            color: C.inkSoft,
            minHeight: 44,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={lembrar}
            onChange={(e) => setLembrar(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: C.brand }}
          />
          Permanecer conectado (abre a Agenda sem internet)
        </label>

        {error && (
          <div role="alert" style={{ color: C.red, fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="login-entrar"
          style={{
            width: "100%",
            minHeight: 50,
            borderRadius: 12,
            border: "none",
            background: busy ? C.border : C.brand,
            color: busy ? C.inkSoft : "#fff",
            fontWeight: 700,
            fontSize: 15,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
        {busy && <ProgressBar />}
      </form>
      <style>{`
        .login-entrar { transition: transform .12s cubic-bezier(.2,0,0,1), background-color .15s ease; }
        .login-entrar:active { transform: scale(.97); }
        @media (prefers-reduced-motion: reduce) { .login-entrar { transition: none; } .login-entrar:active { transform: none; } }
      `}</style>
    </div>
  );
}

const labelStyle = {
  display: "grid",
  gap: 5,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".07em",
  textTransform: "uppercase",
  color: C.inkFaint,
};

const inputStyle = {
  width: "100%",
  minHeight: 48,
  background: "rgba(19,20,23,.92)",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "10px 12px",
  color: C.ink,
  textTransform: "none",
  letterSpacing: "normal",
  fontWeight: 500,
  // 16px, não 14 — abaixo disso o Safari/iOS dá zoom sozinho ao focar o
  // campo (a tela de login não carrega o GlobalStyles do app, que tem a
  // correção equivalente pros campos do resto do app — precisa fixar aqui).
  fontSize: 16,
  outline: "none",
};
