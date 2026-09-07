// supabase/functions/create-user/index.ts
//
// Cria um LOGIN novo para a equipe (aba Sistema → Equipe). Só um admin
// pode chamar. O Auth (auth.users) exige a service_role — por isso é uma
// Edge Function e não uma RPC. Fluxo:
//   1) confere que quem chamou é 'admin' (com o JWT do próprio chamador);
//   2) cria o usuário no Auth com uma senha temporária (email já
//      confirmado — sem depender de SMTP);
//   3) cria/atualiza a linha em public.users com nome + papel.
// O admin comunica a senha temporária à pessoa, que troca depois.
//
// Deploy: supabase functions deploy create-user   (verify_jwt = true)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PAPEIS = ["admin", "atendente", "motorista", "financeiro"];

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
    return json({ success: false, message: "Só um admin pode criar usuários." }, 403);
  }

  // 2) valida a entrada
  let payload: { email?: string; name?: string; role?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, message: "Corpo inválido." }, 400);
  }
  const email = (payload.email ?? "").trim().toLowerCase();
  const name = (payload.name ?? "").trim();
  const role = payload.role ?? "atendente";
  const password = payload.password ?? "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ success: false, message: "E-mail inválido." }, 400);
  if (!name) return json({ success: false, message: "Informe o nome." }, 400);
  if (!PAPEIS.includes(role)) return json({ success: false, message: "Papel inválido." }, 400);
  if (password.length < 8) return json({ success: false, message: "A senha temporária precisa de 8+ caracteres." }, 400);

  // 3) cria no Auth + na tabela (service_role)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createErr || !created?.user) {
    return json({ success: false, message: createErr?.message ?? "Não foi possível criar o login." }, 400);
  }

  const { error: rowErr } = await admin
    .from("users")
    .upsert({ id: created.user.id, name, role, active: true, created_by: callerId }, { onConflict: "id" });
  if (rowErr) {
    // desfaz o auth.user para não deixar órfão
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ success: false, message: `Falha ao gravar o perfil: ${rowErr.message}` }, 400);
  }

  return json({ success: true, id: created.user.id });
});
