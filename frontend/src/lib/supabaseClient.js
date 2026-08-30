// src/lib/supabaseClient.js
//
// Fonte única de verdade para a conexão com o Postgres (via Supabase).
// Nenhum outro arquivo deve chamar createClient() de novo — todo mundo
// importa esta instância.
//
// Variáveis de ambiente esperadas (ex.: arquivo .env, Vite):
//   VITE_SUPABASE_URL=https://xxxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ...
//
// A anon key é segura para expor no frontend — quem protege os dados é a
// Row Level Security (supabase-rls-policies.sql), não o sigilo da chave.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Falha alto e cedo — é melhor a tela quebrar com uma mensagem clara do
  // que o app rodar "modo silencioso" sem persistência nenhuma.
  throw new Error(
    "Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

/**
 * Uid do usuário autenticado no momento (para created_by/updated_by e
 * para os parâmetros p_actor das funções RPC). Retorna null se ninguém
 * estiver logado — os services tratam isso lançando erro antes de tentar
 * escrever, nunca gravando um "autor" inventado.
 */
export async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

/**
 * Erro normalizado usado por todos os services, para os hooks saberem
 * distinguir "erro de rede/transiente" (pode tentar de novo) de
 * "erro de regra de negócio" (nunca deve ser reexecutado automaticamente
 * — ex.: capacidade excedida).
 */
export class ServiceError extends Error {
  constructor(message, { cause, retryable = false, code } = {}) {
    super(message);
    this.name = "ServiceError";
    this.cause = cause;
    this.retryable = retryable;
    this.code = code;
  }
}

/** Classifica um erro do Postgres/Supabase como "vale tentar de novo" ou não. */
export function isRetryableError(error) {
  if (!error) return false;
  // erros de rede do fetch/undici não têm "code" do Postgres
  if (error.message?.toLowerCase().includes("fetch")) return true;
  if (error.message?.toLowerCase().includes("network")) return true;
  // 57014 = statement timeout, 40001 = serialization_failure, 40P01 = deadlock
  if (["57014", "40001", "40P01"].includes(error.code)) return true;
  return false;
}
