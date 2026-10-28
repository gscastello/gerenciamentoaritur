// supabase/functions/bot-aprender/index.ts
//
// Botão "Aprender agora" (Sistema → Bot → Aprendizado do modo sombra). Só um
// admin pode chamar. Roda o mesmo aprendizado que o bot dispara sozinho depois
// de observar bastante conversa (aprendizadoRun.ts), sem esperar a janela.
//
// Deploy: supabase functions deploy bot-aprender   (verify_jwt = true)
// Secrets: ANTHROPIC_API_KEY (+ os de sempre da Supabase).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { executarAprendizado } from "../_shared/aprendizadoRun.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
  if (!authHeader.startsWith("Bearer ")) return json({ success: false, message: "Sem autenticação." }, 401);

  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asCaller.auth.getUser();
  const callerId = userData?.user?.id;
  if (!callerId) return json({ success: false, message: "Sessão inválida." }, 401);
  const { data: perfil } = await asCaller.from("users").select("role").eq("id", callerId).maybeSingle();
  if (perfil?.role !== "admin") return json({ success: false, message: "Só um admin pode rodar o aprendizado." }, 403);

  try {
    const resumo = await executarAprendizado({ forcar: true });
    return json({ success: true, resumo });
  } catch (err) {
    console.error(JSON.stringify({ evento: "bot_erro", etapa: "aprender_agora", erro: String(err).slice(0, 300) }));
    return json({ success: false, message: "Não foi possível aprender agora. Tente de novo em instantes." }, 500);
  }
});
