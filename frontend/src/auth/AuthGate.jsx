// src/auth/AuthGate.jsx
//
// Decide o que renderizar conforme o estado de auth:
//   - resolvendo a sessão .......... skeleton de tela cheia
//   - sem sessão .................... <LoginScreen/>
//   - autenticado sem papel ........ aviso "conta sem permissão" + sair
//   - autenticado com papel ........ o app

import { useAuth } from "./AuthProvider.jsx";
import { LoginScreen } from "./LoginScreen.jsx";
import { Skeleton } from "../ui/motion/index.js";
import { isSupabaseConfigured } from "../lib/supabaseClient.js";

const C = { bg: "#0E1116", ink: "#ECEEF2", inkSoft: "#8B93A3", amber: "#E8A33D" };

export function AuthGate({ children }) {
  const { loading, isAuthenticated, profile, signOut } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Supabase não configurado</div>
          <p style={{ color: C.inkSoft, fontSize: 13 }}>
            Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code>
            {" "}no <code>.env</code> (local) ou nas variáveis de ambiente do host.
            Ver <code>frontend/DEPLOY.md</code>.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, padding: "32px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton height={28} width={220} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={80} rounded={12} />
            ))}
          </div>
          <Skeleton height={320} rounded={12} />
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
            Sua conta entrou, mas ainda não tem um papel definido no sistema.
            Peça para um administrador liberar o acesso.
          </p>
          <button
            type="button"
            onClick={signOut}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              background: C.amber,
              color: "#20180A",
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
