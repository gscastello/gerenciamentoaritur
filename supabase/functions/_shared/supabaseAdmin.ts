// supabase/functions/_shared/supabaseAdmin.ts
//
// Cliente com a service_role key — ignora RLS de propósito, porque o bot
// precisa ler/escrever em nome de qualquer cliente, sem estar "logado"
// como um atendente específico. Isso só é seguro porque este arquivo
// roda dentro de uma Edge Function (servidor), nunca no navegador — a
// service_role key nunca deve ir para o frontend nem para o .env do Vite.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nos secrets da função.");
}

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** id do usuário de sistema "Bot WhatsApp" — usado como created_by/performed_by nas ações da IA. */
export async function getBotUserId(): Promise<string> {
  const { data, error } = await supabaseAdmin.from("users").select("id").eq("name", "Bot WhatsApp").single();
  if (error || !data) {
    throw new Error("Usuário de sistema 'Bot WhatsApp' não encontrado — rode o INSERT do 06-whatsapp.sql.");
  }
  return data.id;
}
