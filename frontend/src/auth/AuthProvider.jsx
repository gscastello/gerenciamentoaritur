// src/auth/AuthProvider.jsx
//
// Fonte única do estado de autenticação. Mantém a sessão do Supabase e o
// perfil (users.role) sincronizados, e reage a login/logout/refresh de
// token em qualquer aba.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { usersService } from "../services/usersService.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true); // resolvendo a sessão inicial
  const mounted = useRef(true);

  const loadProfile = useCallback(async () => {
    try {
      const p = await usersService.getCurrentProfile();
      if (mounted.current) setProfile(p);
    } catch {
      if (mounted.current) setProfile(null);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted.current) return;
      setSession(data.session ?? null);
      if (data.session) await loadProfile();
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!mounted.current) return;
      setSession(next ?? null);
      if (next) {
        await loadProfile();
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email, password) => {
    await usersService.signInWithPassword(email, password);
    // onAuthStateChange cuida de setSession + loadProfile
  }, []);

  const signOut = useCallback(async () => {
    await usersService.signOut();
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
      reloadProfile: loadProfile,
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

/** true se o papel do usuário está entre os permitidos. `null` de role => false. */
export function useHasRole(...roles) {
  const { role } = useAuth();
  return role != null && roles.flat().includes(role);
}
