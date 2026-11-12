// supabase/functions/revisor-reservas/index.ts
//
// Revisor de reservas (issue #339). Chamada pela rotina do banco (pg_cron + pg_net, a
// cada 15 min) com a chave da rotina no cabeçalho x-rotina (no banco só o hash:
// fn_rotina_autorizada). Responde na hora e revisa em segundo plano.
// Deploy: verify_jwt = false (a autenticação é a chave da rotina).

import { rodadaDoRevisor } from "../_shared/revisor.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  const chave = req.headers.get("x-rotina") ?? "";
  const { data: autorizada } = await supabaseAdmin.rpc("fn_rotina_autorizada", { p_nome: "revisor", p_token: chave });
  if (!chave || autorizada !== true) return json({ success: false, message: "Não autorizado." }, 401);

  // simulação (teste): revisa e devolve o que faria, sem mudar nada
  const corpo = await req.json().catch(() => ({}));
  if (corpo?.simular === true) {
    const limite = Math.min(Math.max(Number(corpo.limite) || 3, 1), 10);
    return json({ success: true, simulacao: await rodadaDoRevisor(limite, { simular: true }) });
  }

  const trabalho = rodadaDoRevisor().catch((err) =>
    console.log(JSON.stringify({ evento: "bot_erro", etapa: "revisor_rodada", erro: String(err).slice(0, 300) }))
  );
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(trabalho);
    return json({ success: true, message: "revisão iniciada" }, 202);
  }
  await trabalho;
  return json({ success: true, message: "revisão feita" });
});
