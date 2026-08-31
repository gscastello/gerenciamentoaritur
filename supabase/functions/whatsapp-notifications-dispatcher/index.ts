// supabase/functions/whatsapp-notifications-dispatcher/index.ts
//
// Não responde a mensagem nenhuma — só processa a fila da tabela
// `notifications` (populada por triggers do banco, ex.: quando
// rpc_start_trip roda, ou por um job de lembrete). Deploy:
//   supabase functions deploy whatsapp-notifications-dispatcher --no-verify-jwt
// e agendar via pg_cron (ver database/07-scheduling.sql) chamando esta
// URL a cada 5 minutos com um cabeçalho de autenticação simples.

import { whatsappService } from "../_shared/whatsappService.ts";

const DISPATCH_SECRET = Deno.env.get("DISPATCH_SECRET")!;

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-dispatch-secret") !== DISPATCH_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  const results = await whatsappService.dispatchPendingNotifications();
  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
