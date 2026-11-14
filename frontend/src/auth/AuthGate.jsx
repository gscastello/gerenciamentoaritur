// src/auth/AuthGate.jsx
//
// Decide o que renderizar conforme o estado de auth:
//   - resolvendo a sessão .......... skeleton de tela cheia
//   - sem sessão .................... <LoginScreen/>
//   - autenticado sem papel ........ aviso "conta sem permissão" + sair
//   - autenticado com papel ........ o app

import { isSupabaseConfigured } from "../lib/supabaseClient.js";
import { ProgressBar } from "../ui/motion/index.js";
import { useAuth } from "./AuthProvider.jsx";
import { LoginScreen } from "./LoginScreen.jsx";

const C = { bg: "#0A0B0D", ink: "#F3F4F6", inkSoft: "#A7ABB3", amber: "#E4121F" };

export function AuthGate({ children }) {
  const { loading, isAuthenticated, profile, signOut } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          color: C.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Supabase não configurado</div>
          <p style={{ color: C.inkSoft, fontSize: 13 }}>
            Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no{" "}
            <code>.env</code> (local) ou nas variáveis de ambiente do host. Ver{" "}
            <code>frontend/DEPLOY.md</code>.
          </p>
        </div>
      </div>
    );
  }

  // Abertura do app (crítica de design, issue #393): a mesma foto do ônibus do login, com a logo,
  // enquanto a sessão é conferida — é a primeira coisa que o sócio vê ao abrir o app.
  if (loading) {
    return (
      <div
        data-testid="abertura"
        style={{
          position: "relative",
          minHeight: "100dvh",
          overflow: "hidden",
          background: "#0A0B0D",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
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
            background:
              "linear-gradient(180deg, rgba(10,11,13,0) 30%, rgba(10,11,13,.8) 60%, #0A0B0D 78%)",
          }}
        />
        <div
          style={{
            position: "relative",
            width: "min(220px, 60vw)",
            paddingBottom: "max(48px, env(safe-area-inset-bottom))",
          }}
        >
          <img
            src="/brand/logo-fundo-escuro.webp"
            alt="AriTur Transportes — carregando"
            width={560}
            height={542}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
          <div style={{ marginTop: 18 }}>
            <ProgressBar label="Abrindo o app" color="#E4121F" trackColor="#2A2C31" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginScreen />;

  // Autenticado, mas o trigger fn_handle_new_auth_user ainda não criou a
  // linha em public.users, ou a conta foi criada sem papel.
  if (!profile?.role) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          color: C.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Inter', system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Conta sem permissão</div>
          <p style={{ color: C.inkSoft, fontSize: 13 }}>
            Sua conta entrou, mas ainda não tem um papel definido no sistema. Peça para um
            administrador liberar o acesso.
          </p>
          <button
            type="button"
            onClick={signOut}
            style={{
              marginTop: 16,
              padding: "0 20px",
              minHeight: 44,
              borderRadius: 10,
              border: "none",
              background: C.amber,
              color: "#FFFFFF",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return children;
}
