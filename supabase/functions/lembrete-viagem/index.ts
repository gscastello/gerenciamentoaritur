// supabase/functions/lembrete-viagem/index.ts
//
// Lembrete automático da viagem (issue #458): Ida na noite anterior, Volta 1 hora antes do ponto,
// e quem agenda depois recebe na rodada seguinte enquanto a viagem não saiu (regras em
// _shared/lembretePuro.ts). Chamada pelo pg_cron de 5 em 5 minutos com a chave da rotina do
// revisor (x-rotina). Quem envia é o "avisar-passageiros" (texto nas 24 h, modelo da Meta fora
// delas, registro em avisos_passageiros), para as duas portas fazerem igual.
//
// Deploy: verify_jwt = false (a autenticação é a chave da rotina).

import { diaCivil } from "../_shared/agentePuro.ts";
import { configDoLembrete, lembretesDevidos, type ReservaDoLembrete, textoDoLembrete, variaveisDoModelo } from "../_shared/lembretePuro.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const evento = (nome: string, dados: Record<string, unknown>) => console.log(JSON.stringify({ evento: nome, ...dados }));

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ success: false, message: "Método não permitido." }, 405);
  const chave = req.headers.get("x-rotina") ?? "";
  if (!chave) return json({ success: false, message: "Não autorizado." }, 401);
  const { data: autorizada } = await supabaseAdmin.rpc("fn_rotina_autorizada", { p_nome: "revisor", p_token: chave });
  if (autorizada !== true) return json({ success: false, message: "Não autorizado." }, 401);

  // deno-lint-ignore no-explicit-any
  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  const simular = corpo?.simular === true;

  try {
    const { data: cfgs } = await supabaseAdmin.from("settings").select("key, value").in("key", ["lembrete_viagem", "monday_adjustment"]);
    const valor = (k: string) => ((cfgs ?? []) as Linha[]).find((c) => c.key === k)?.value ?? null;
    const cfg = configDoLembrete(valor("lembrete_viagem"));
    // simular: mostra quem receberia agora, sem enviar nada (mesmo desligado)
    if (!cfg.ativo && !simular) return json({ success: true, ativo: false, enviados: 0 });

    const agora = new Date();
    const hoje = diaCivil(agora);
    const { data: linhas, error } = await supabaseAdmin
      .from("reservations")
      .select(
        "id, status, type, quantity, created_at, extra_data, pickup_neighborhood, pickup_detail, street, customers(name), trips!inner(trip_date, direction), route_points(code, name, base_time)",
      )
      .is("deleted_at", null)
      .in("status", ["confirmada", "pendente"])
      .in("trips.trip_date", [hoje, somarDias(hoje, 1)])
      .limit(1000);
    if (error) throw error;
    const reservas: ReservaDoLembrete[] = ((linhas ?? []) as Linha[]).map((r) => ({
      id: r.id,
      data: r.trips?.trip_date,
      direcao: r.trips?.direction === "volta" ? "volta" : "ida",
      status: r.status,
      tipo: r.type ?? "passagem",
      criadaEm: r.created_at,
      peloAgendado: r.extra_data?.origem === "agendado_equipe",
      pontoCodigo: r.route_points?.code ?? null,
      pontoNome: r.route_points?.name ?? null,
      pontoHora: r.route_points?.base_time ?? null,
      nome: r.customers?.name ?? null,
      bairro: r.pickup_neighborhood ?? null,
      endereco: [r.street, r.pickup_detail].map((x: unknown) => String(x ?? "").trim()).filter(Boolean).join(", ") || null,
      quantidade: Number(r.quantity ?? 1),
    }));

    const ids = reservas.map((r) => r.id);
    const { data: avisos } = ids.length
      ? await supabaseAdmin.from("avisos_passageiros").select("reservation_id, status").eq("tipo", "horario").in("reservation_id", ids)
      : { data: [] };
    // já tem lembrete (manual ou automático); falha conta depois de 3 tentativas
    const falhas = new Map<string, number>();
    const jaAvisadas = new Set<string>();
    for (const a of (avisos ?? []) as Linha[]) {
      if (a.status === "falhou") falhas.set(a.reservation_id, (falhas.get(a.reservation_id) ?? 0) + 1);
      else jaAvisadas.add(a.reservation_id);
    }
    for (const [id, n] of falhas) if (n >= 3) jaAvisadas.add(id);

    // simular ignora o horário de silêncio (para conferir a lista a qualquer hora)
    const regra = simular ? { ...cfg, ativo: true, silencio: { de: "00:00", ate: "00:00" } } : { ...cfg, ativo: true };
    const devidos = lembretesDevidos(reservas, jaAvisadas, agora, regra, valor("monday_adjustment"));
    const itens = devidos.map(({ reserva, horario }) => ({
      reservation_id: reserva.id,
      texto: textoDoLembrete(reserva, horario, hoje),
      ...variaveisDoModelo(reserva, horario, hoje),
    }));
    if (simular || !itens.length) {
      evento("lembrete_viagem", { devidos: itens.length, simular });
      return json({ success: true, ativo: cfg.ativo, simular, devidos: itens });
    }

    // quem envia é o avisar-passageiros, com a mesma chave da rotina (até 80 por chamada)
    let enviados = 0;
    let fora = 0;
    let falhou = 0;
    for (let i = 0; i < itens.length; i += 80) {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/avisar-passageiros`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-rotina": chave },
        body: JSON.stringify({ tipo: "horario", itens: itens.slice(i, i + 80) }),
      });
      const r = await resp.json().catch(() => ({}));
      for (const x of (r?.resultados ?? []) as Linha[]) {
        if (x.status === "enviado") enviados++;
        else if (x.status === "falhou") falhou++;
        else fora++;
      }
    }
    evento("lembrete_viagem", { devidos: itens.length, enviados, fora_da_janela_ou_sem_conversa: fora, falhas: falhou });
    return json({ success: true, devidos: itens.length, enviados, fora, falhou });
  } catch (err) {
    evento("bot_erro", { onde: "lembrete_viagem", erro: String(err).slice(0, 300) });
    return json({ success: false, message: "Falha no lembrete." }, 500);
  }
});
