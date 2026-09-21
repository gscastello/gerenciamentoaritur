// supabase/functions/reset-user-password/index.ts
//
// Redefine a senha de um login já existente (aba Sistema → Equipe). Só
// um admin pode chamar. Igual a create-user, o Auth (auth.users) exige
// service_role — por isso é uma Edge Function e não uma RPC. Fluxo:
//   1) confere que quem chamou é 'admin' (com o JWT do próprio chamador);
//   2) troca a senha do usuário alvo no Auth (service_role).
// O admin comunica a nova senha temporária à pessoa, que troca depois.
//
// Deploy: supabase functions deploy reset-user-password   (verify_jwt = true)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, message: "Método não permitido." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ success: false, message: "Sem autenticação." }, 401);
  }

  // 1) quem chamou é admin?
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await asCaller.auth.getUser();
  const callerId = userData?.user?.id;
  if (!callerId) return json({ success: false, message: "Sessão inválida." }, 401);
  const { data: perfil } = await asCaller.from("users").select("role").eq("id", callerId).maybeSingle();
  if (perfil?.role !== "admin") {
    return json({ success: false, message: "Só um admin pode redefinir senhas." }, 403);
  }

  // 2) valida a entrada
  let payload: { userId?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, message: "Corpo inválido." }, 400);
  }
  const userId = (payload.userId ?? "").trim();
  const password = payload.password ?? "";
  if (!userId) return json({ success: false, message: "Usuário não informado." }, 400);
  if (password.length < 8) return json({ success: false, message: "A senha precisa de 8+ caracteres." }, 400);

  // 3) troca a senha no Auth (service_role)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error: updateErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (updateErr) {
    return json({ success: false, message: updateErr.message ?? "Não foi possível redefinir a senha." }, 400);
  }

  return json({ success: true });
});
