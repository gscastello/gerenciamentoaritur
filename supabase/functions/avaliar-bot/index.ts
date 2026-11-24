// supabase/functions/avaliar-bot/index.ts
//
// Avaliação do bot com casos reais (issue #419). Para cada caso de `bot_casos` ainda não avaliado
// na rodada, faz a MESMA leitura do "Agendado ☑️" como a conversa estava no momento da marca, sem
// gravar nada (simularAgendado), e compara com as viagens que ficaram (avaliacaoPura.compararCaso).
// Grava em `bot_avaliacoes`. Chamada com a chave da rotina do revisor (x-rotina), como o revisor;
// responde na hora e avalia em segundo plano (alguns casos por chamada).
// Deploy: verify_jwt = false (a autenticação é a chave da rotina).
//
// `{"atendente": true}` (etapa 2 do bot autônomo, issue #501): em vez da leitura do Agendado, refaz a
// conversa com o ATENDENTE DE IA no lugar da equipe (provaDoAtendente.ts), sem enviar nem gravar
// nada, e compara o que ele reservaria com o que ficou, inclusive o preço (provaPura.compararProva).
// Use uma rodada própria (ex.: "atendente-2026-11-23"); o custo de cada caso vai em `tokens.custo_usd`.

import { bairroDaTabela } from "../_shared/agentePuro.ts";
import { compararCaso, type ViagemDoCaso } from "../_shared/avaliacaoPura.ts";
import { type CampoDaReserva, esperadoNaHoraDaMarca, type MudancaDoCampo, quemMudou } from "../_shared/mudancaDepoisDaMarca.ts";
import { simularAtendimento } from "../_shared/provaDoAtendente.ts";
import { compararProva, type EsperadaComPreco } from "../_shared/provaPura.ts";
import { simularAgendado } from "../_shared/rascunhoReserva.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

async function avaliarCaso(caso: Linha, rodada: string, versao: string | null, modelo: string | null, memoria: boolean, bairros: { neighborhood: string }[]) {
  try {
    const r = await simularAgendado({
      conversationId: caso.conversation_id,
      chatwootConversationId: Number(caso.chatwoot_conversation_id),
      mensagemId: Number(caso.mensagem_id),
      telefone: String(caso.telefone),
      marcaEm: String(caso.marca_em),
      ...(modelo ? { modelo } : {}),
      memoria,
    });
    const planejadas = r.planejadas.map((p: Linha) => ({
      trip_date: p.trip_date,
      direction: p.direction,
      route_point_code: p.route_point_code,
      quantity: p.quantity,
      pickup_neighborhood: p.pickup_neighborhood,
      type: p.type,
      pickup_detail: p.pickup_detail,
      dropoff_location: p.dropoff_location,
      pendencia: p.pendencia ?? null,
      notes: p.notes ?? null,
    }));
    await supabaseAdmin.from("bot_avaliacoes").delete().eq("rodada", rodada).eq("caso_id", caso.id).eq("resultado", "erro");
    const cmp = compararCaso((caso.esperado ?? []) as ViagemDoCaso[], planejadas, {
      motivos: r.motivos,
      pendenteOk: caso.pendente_ok === true,
      bairroNaTabela: (b) => bairroDaTabela(b, bairros)?.neighborhood ?? null,
    });
    await supabaseAdmin.from("bot_avaliacoes").insert({
      rodada,
      caso_id: caso.id,
      resultado: cmp.resultado,
      diferencas: cmp.diferencas,
      lido: { planejadas, motivos: r.motivos, dias_sem_pedido: r.diasSemPedido },
      releu: r.releu,
      tokens: r.tokens,
      versao,
    });
    return cmp.resultado;
  } catch (err) {
    await supabaseAdmin.from("bot_avaliacoes").insert({
      rodada,
      caso_id: caso.id,
      resultado: "erro",
      diferencas: [String(err).slice(0, 300)],
      versao,
    });
    return "erro";
  }
}

/** As viagens que ficaram, com o preço unitário de cada uma (o caso não guarda o preço). */
async function esperadasComPreco(esperado: ViagemDoCaso[]): Promise<EsperadaComPreco[]> {
  const ids = (esperado as Linha[]).map((e) => e.reservation_id).filter(Boolean);
  const { data } = ids.length
    ? await supabaseAdmin.from("reservations").select("id, unit_price").in("id", ids)
    : { data: [] as Linha[] };
  const preco = new Map(((data ?? []) as Linha[]).map((r) => [r.id, r.unit_price == null ? null : Number(r.unit_price)]));
  return (esperado as Linha[]).map((e) => ({ ...(e as ViagemDoCaso), unit_price: preco.get(e.reservation_id) ?? null }));
}

async function provarAtendente(caso: Linha, rodada: string, versao: string | null, bairros: { neighborhood: string }[]) {
  try {
    const r = await simularAtendimento({
      conversationId: caso.conversation_id,
      chatwootConversationId: Number(caso.chatwoot_conversation_id),
      mensagemId: Number(caso.mensagem_id),
      telefone: String(caso.telefone),
      marcaEm: String(caso.marca_em),
    });
    await supabaseAdmin.from("bot_avaliacoes").delete().eq("rodada", rodada).eq("caso_id", caso.id).eq("resultado", "erro");
    const cmp = compararProva(await esperadasComPreco((caso.esperado ?? []) as ViagemDoCaso[]), r.acoes, {
      ultimaResposta: r.ultimaResposta,
      pendenteOk: caso.pendente_ok === true,
      bairroNaTabela: (b) => bairroDaTabela(b, bairros)?.neighborhood ?? null,
    });
    await supabaseAdmin.from("bot_avaliacoes").insert({
      rodada,
      caso_id: caso.id,
      resultado: cmp.resultado,
      diferencas: cmp.diferencas,
      lido: { atendente: true, acoes: r.acoes, turnos: r.turnos },
      releu: false,
      tokens: { ...r.tokens, custo_usd: r.custoUsd },
      versao,
    });
    return cmp.resultado;
  } catch (err) {
    await supabaseAdmin.from("bot_avaliacoes").insert({
      rodada,
      caso_id: caso.id,
      resultado: "erro",
      diferencas: [String(err).slice(0, 300)],
      versao,
    });
    return "erro";
  }
}

const MARCA_DO_AJUSTE = "[mudança depois da marca]";

/**
 * A reserva do caso mudou depois de uma nova mensagem do cliente (issue #504, caso 8bfa7860)? O bot decide
 * sozinho quem mudou (mudancaDepoisDaMarca.quemMudou) e acerta o esperado para a HORA DO AGENDADO: onde o
 * cliente mudou de ideia, volta o valor de antes; erro de leitura fica o de agora; sem prova, só anota para
 * conferir. Caso conferido à mão (verificado) ou já ajustado não é mexido. Tudo fica escrito na observação.
 */
async function ajustarPelaMudanca(caso: Linha, pontosIda: string[]): Promise<Linha> {
  if (caso.verificado || String(caso.observacao ?? "").includes(MARCA_DO_AJUSTE)) return caso;
  const esperado = (caso.esperado ?? []) as Linha[];
  const ids = esperado.map((e) => e.reservation_id).filter(Boolean) as string[];
  if (!ids.length) return caso;
  const marca = Date.parse(String(caso.marca_em));
  const { data: obs } = await supabaseAdmin
    .from("bot_observations")
    .select("content, created_at")
    .eq("chatwoot_conversation_id", caso.chatwoot_conversation_id)
    .eq("author", "cliente")
    .gte("created_at", new Date(marca - 3 * 86_400_000).toISOString())
    .order("created_at")
    .limit(400);
  const msgs = ((obs ?? []) as Linha[]).map((o) => ({ texto: String(o.content ?? ""), em: String(o.created_at) }));
  const antesDaMarca = msgs.filter((m) => Date.parse(m.em) <= marca + 30_000);
  const primeiraDepois = msgs.find((m) => Date.parse(m.em) > marca + 30_000);
  if (!primeiraDepois) return caso;
  const { data: logs } = await supabaseAdmin
    .from("audit_logs")
    .select("entity_id, before_data, after_data, performed_at")
    .eq("entity_table", "reservations")
    .eq("action", "update")
    .in("entity_id", ids)
    .gt("performed_at", primeiraDepois.em)
    .order("performed_at");
  if (!logs?.length) return caso;

  const pontos = new Map<string, string>();
  const viagens = new Map<string, { trip_date: string; direction: string }>();
  const idsPonto = [...new Set((logs as Linha[]).map((l) => l.before_data?.route_point_id).filter(Boolean))];
  const idsViagem = [...new Set((logs as Linha[]).map((l) => l.before_data?.trip_id).filter(Boolean))];
  if (idsPonto.length) {
    const { data } = await supabaseAdmin.from("route_points").select("id, code").in("id", idsPonto);
    for (const p of (data ?? []) as Linha[]) pontos.set(p.id, p.code);
  }
  if (idsViagem.length) {
    const { data } = await supabaseAdmin.from("trips").select("id, trip_date, direction").in("id", idsViagem);
    for (const t of (data ?? []) as Linha[]) viagens.set(t.id, { trip_date: t.trip_date, direction: t.direction });
  }

  const mudancas: MudancaDoCampo[] = [];
  const vistos = new Set<string>();
  for (const l of logs as Linha[]) {
    const e = esperado.find((x) => x.reservation_id === String(l.entity_id));
    if (!e) continue;
    const antes = l.before_data ?? {};
    const depois = l.after_data ?? {};
    const campos: [CampoDaReserva, unknown, unknown][] = [];
    if (antes.route_point_id && antes.route_point_id !== depois.route_point_id) campos.push(["ponto", pontos.get(antes.route_point_id) ?? null, e.route_point_code]);
    if (antes.quantity != null && Number(antes.quantity) !== Number(depois.quantity)) campos.push(["quantidade", Number(antes.quantity), Number(e.quantity)]);
    if (antes.trip_id && antes.trip_id !== depois.trip_id) {
      const v = viagens.get(antes.trip_id);
      if (v && v.trip_date !== e.trip_date) campos.push(["dia", v.trip_date, e.trip_date]);
      if (v && v.direction !== e.direction) campos.push(["sentido", v.direction, e.direction]);
    }
    const depoisDaMarca = msgs.filter((m) => Date.parse(m.em) > marca + 30_000 && Date.parse(m.em) <= Date.parse(String(l.performed_at)));
    for (const [campo, valorAntes, valorDepois] of campos) {
      const chave = `${e.reservation_id}:${campo}`;
      if (vistos.has(chave) || valorAntes == null) continue; // vale a primeira mudança de cada campo
      vistos.add(chave);
      const quem = quemMudou({
        campo,
        antes: valorAntes as string | number,
        depois: valorDepois as string | number,
        antesDaMarca,
        depoisDaMarca,
        direcao: e.direction === "volta" ? "volta" : "ida",
        pontosIda,
      });
      mudancas.push({ reservation_id: e.reservation_id, campo, antes: valorAntes as string | number, depois: valorDepois as string | number, quem });
    }
  }
  if (!mudancas.length) return caso;
  const r = esperadoNaHoraDaMarca(esperado, mudancas);
  const notas = [
    ...r.ajustes,
    ...mudancas.filter((m) => m.quem === "erro_de_leitura").map((m) => `${m.campo}: ${m.antes} → ${m.depois} (erro de leitura do bot: fica o de agora)`),
    ...(r.incertos.length ? [`conferir: ${r.incertos.join("; ")}`] : []),
  ];
  const observacao = [caso.observacao, `${MARCA_DO_AJUSTE} ${notas.join("; ")}`].filter(Boolean).join(" ").slice(0, 900);
  await supabaseAdmin.from("bot_casos").update({ esperado: r.esperado, observacao }).eq("id", caso.id);
  evento("caso_ajustado_pela_mudanca", { caso: caso.id, ajustes: r.ajustes.length, incertos: r.incertos.length });
  return { ...caso, esperado: r.esperado, observacao };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  const chave = req.headers.get("x-rotina") ?? "";
  const { data: autorizada } = await supabaseAdmin.rpc("fn_rotina_autorizada", { p_nome: "revisor", p_token: chave });
  if (!chave || autorizada !== true) return json({ success: false, message: "Não autorizado." }, 401);

  const corpo = await req.json().catch(() => ({}));
  const rodada = String(corpo?.rodada ?? "").trim();
  if (!rodada) return json({ success: false, message: "Informe a rodada." }, 400);
  const limite = Math.min(Math.max(Number(corpo?.limite) || 6, 1), 15);
  const versao = typeof corpo?.versao === "string" ? corpo.versao : null;
  // só os modelos que o bot usa (issue #421: comparar a primeira leitura com o modelo capaz)
  const modelo = ["claude-haiku-5-5", "claude-sonnet-5-5"].includes(corpo?.modelo) ? String(corpo.modelo) : null;

  // mesmo texto já lido: usa a leitura guardada, sem gastar API; {"fresco": true} lê tudo de novo (issue #494)
  const memoria = corpo?.fresco !== true;
  // prova do atendente de IA (issue #501): conversa inteira, sem enviar nem gravar
  const atendente = corpo?.atendente === true;

  // erro técnico (limite da API, tempo) não conta como feito: a próxima chamada refaz
  const { data: feitos } = await supabaseAdmin.from("bot_avaliacoes").select("caso_id").eq("rodada", rodada).neq("resultado", "erro");
  const jaFeitos = new Set(((feitos ?? []) as Linha[]).map((f) => f.caso_id));
  let q = supabaseAdmin.from("bot_casos").select("*").eq("ativo", true).order("marca_em", { ascending: true });
  if (Array.isArray(corpo?.casos) && corpo.casos.length) q = q.in("id", corpo.casos);
  const { data: casos } = await q.limit(1000);
  const fila = ((casos ?? []) as Linha[]).filter((c) => !jaFeitos.has(c.id)).slice(0, limite);

  const { data: tabela } = await supabaseAdmin.from("neighborhood_pricing").select("neighborhood");
  const bairros = (tabela ?? []) as { neighborhood: string }[];
  const { data: daIda } = await supabaseAdmin.from("route_points").select("code").eq("direction", "ida").is("deleted_at", null);
  const pontosIda = ((daIda ?? []) as Linha[]).map((p) => String(p.code));
  const trabalho = (async () => {
    const resultados: string[] = [];
    for (const original of fila) {
      // o esperado da hora do Agendado: o cliente pode ter mudado depois (issue #504)
      const caso = await ajustarPelaMudanca(original, pontosIda).catch((err) => {
        evento("bot_aviso", { aviso: "ajuste_pela_mudanca_falhou", caso: original.id, erro: String(err).slice(0, 200) });
        return original;
      });
      resultados.push(atendente ? await provarAtendente(caso, rodada, versao, bairros) : await avaliarCaso(caso, rodada, versao, modelo, memoria, bairros));
    }
    evento(atendente ? "prova_atendente_rodada" : "avaliacao_rodada", { rodada, avaliados: fila.length, resultados });
  })().catch((err) => evento("bot_erro", { etapa: "avaliacao", erro: String(err).slice(0, 300) }));

  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(trabalho);
    return json({ success: true, rodada, na_fila: fila.length, faltam: Math.max(0, ((casos ?? []).length - jaFeitos.size) - fila.length) }, 202);
  }
  await trabalho;
  return json({ success: true, rodada, avaliados: fila.length });
});
