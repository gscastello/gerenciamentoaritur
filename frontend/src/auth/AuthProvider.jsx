// src/auth/AuthProvider.jsx
//
// Fonte única do estado de autenticação. Mantém a sessão do Supabase e o
// perfil (users.role) sincronizados, e reage a login/logout/refresh de
// token em qualquer aba.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apagarCopias, lerCopia, salvarCopia, semRede } from "../lib/copiaOffline.js";
import { logTecnico } from "../lib/erros.js";
import { setRememberMe, supabase } from "../lib/supabaseClient.js";
import { usersService } from "../services/usersService.js";

const AuthContext = createContext(null);

// Sem internet (issue #355): o token vence em 1 h e, sem rede para renová-lo,
// o Supabase diz "sem sessão", mas a sessão continua guardada no aparelho
// (ele só apaga no logout ou quando o servidor recusa a renovação). Usamos a
// guardada para abrir o app com a cópia da Agenda; quando a rede volta, o
// próprio Supabase renova e avisa (TOKEN_REFRESHED).
function sessaoGuardada() {
  try {
    const k = supabase.auth.storageKey;
    const raw = localStorage.getItem(k) ?? sessionStorage.getItem(k);
    const s = raw ? JSON.parse(raw) : null;
    return s?.access_token && s?.user?.id ? s : null;
  } catch {
    return null;
  }
}

const chavePerfil = (userId) => `perfil:${userId}`;
// quanto esperar o Supabase confirmar a sessão antes de abrir com a guardada
const ESPERA_SESSAO_MS = 2500;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true); // resolvendo a sessão inicial
  const mounted = useRef(true);

  // Falha passageira (rede oscilando ao recarregar — "puxar para atualizar",
  // issue #353 — ou duas leituras ao mesmo tempo) não pode virar "Conta sem
  // permissão": tenta de novo e nunca apaga um perfil bom por causa de um erro.
  // Quem zera o perfil é o logout (onAuthStateChange sem sessão).
  // Sem internet, vale o último perfil lido neste aparelho (issue #355).
  const loadProfile = useCallback(async (userId) => {
    const doAparelho = () => {
      const c = userId ? lerCopia(chavePerfil(userId)) : null;
      if (c?.dados && mounted.current) setProfile((atual) => atual ?? c.dados);
    };
    // o perfil deste aparelho abre o app na hora; o do servidor vale por cima
    // (sem rede, a leitura dele espera a renovação do token por até 30 s)
    doAparelho();
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      try {
        const p = await usersService.getCurrentProfile();
        if (p) {
          if (mounted.current) setProfile(p);
          salvarCopia(chavePerfil(p.id), p);
          return;
        }
      } catch (e) {
        if (semRede(e)) return;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (tentativa < 3) await new Promise((r) => setTimeout(r, 400 * 2 ** tentativa));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    // Sem internet e com o token vencido, o getSession fica até ~30 s tentando
    // renovar antes de responder (issue #355). Se ele demora ou o aparelho já
    // está sem rede, abre com a sessão guardada; a resposta dele, quando vier,
    // vale por cima.
    let abriu = false;
    const abrirComGuardada = () => {
      if (abriu || !mounted.current) return;
      const s = sessaoGuardada();
      if (!s) return;
      abriu = true;
      setSession((atual) => atual ?? s);
      setLoading(false);
      loadProfile(s.user.id);
    };
    if (typeof navigator !== "undefined" && navigator.onLine === false) abrirComGuardada();
    const espera = setTimeout(abrirComGuardada, ESPERA_SESSAO_MS);

    // Sem .catch aqui, uma rejeição (ex.: sem rede nenhuma ao abrir o PWA
    // offline) deixava `loading` true PARA SEMPRE — AuthGate mostra o
    // skeleton indefinidamente, sem erro, sem jeito de tentar de novo.
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted.current) return;
        // sem sessão do Supabase e sem a guardada = saiu de verdade (o
        // Supabase só apaga a guardada no logout ou se o servidor recusou)
        const s = data.session ?? sessaoGuardada();
        if (!s) {
          setSession(null);
          setProfile(null);
          return;
        }
        if (data.session || !abriu) setSession(data.session ?? s);
        if (data.session || !abriu) await loadProfile(s.user?.id);
      })
      .catch((e) => {
        logTecnico(e, { origem: "AuthProvider.getSession" });
        abrirComGuardada();
      })
      .finally(() => {
        clearTimeout(espera);
        if (mounted.current) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (!mounted.current) return;
      if (next) {
        setSession(next);
        await loadProfile(next.user?.id);
        return;
      }
      // "sem sessão" sem logout e com a sessão ainda guardada = sem rede para
      // renovar o token: segue com a guardada (ver sessaoGuardada)
      const guardada = event === "SIGNED_OUT" ? null : sessaoGuardada();
      if (guardada) {
        setSession((atual) => atual ?? guardada);
        return;
      }
      setSession(null);
      setProfile(null);
      if (event === "SIGNED_OUT") apagarCopias();
    });

    return () => {
      mounted.current = false;
      clearTimeout(espera);
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email, password, remember = true) => {
    // precisa vir ANTES do signInWithPassword: é o valor que o storage
    // dinâmico do client (supabaseClient.js) lê no exato momento em que a
    // sessão nova é salva.
    setRememberMe(remember);
    await usersService.signInWithPassword(email, password);
    // onAuthStateChange cuida de setSession + loadProfile
  }, []);

  const signOut = useCallback(async () => {
    await usersService.signOut();
    apagarCopias(); // aparelho compartilhado: a cópia da Agenda sai junto
    setRememberMe(true); // volta ao padrão pro próximo login (não herda "não lembrar" de um dispositivo compartilhado)
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile, // { id, name, role, ... } de public.users — pode ser null se o trigger ainda não criou a linha
      role: profile?.role ?? null,
      loading,
      isAuthenticated: !!session,
      signIn,
      signOut,
      reloadProfile: () => loadProfile(session?.user?.id),
    }),
    [session, profile, loading, signIn, signOut, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>.");
  return ctx;
}

/**
 * true se o papel do usuário está entre os permitidos. `null` de role => false.
 * @public — usado ao ligar as abas por papel (issue #10, ver APP-INTEGRATION-PLAN.md)
 */
export function useHasRole(...roles) {
  const { role } = useAuth();
  return role != null && roles.flat().includes(role);
}
