// supabase/functions/_shared/revisor.ts
//
// Revisor de reservas (issue #339) — a parte com I/O. Para cada passageiro com reserva
// futura em que algo mudou (fn_clientes_para_revisar): lê as reservas, a conversa, o
// costume, as instruções da equipe e a base de lugares; o modelo capaz aponta os erros
// com a prova da conversa; revisaoPura decide o que corrigir sozinho; aqui aplica pelas
// RPCs da Agenda (auditado, autor = Bot WhatsApp), recalcula o preço pela tabela, cancela
// a duplicada do bot, avisa o cliente do que mudou e abre pendência para o resto.

import { acharPonto, valorDoPedido } from "./agenteFerramentas.ts";
import { areaDoDesembarque, diaCivil } from "./agentePuro.ts";
import { custoUsd, MODELOS } from "./assistentePuro.ts";
import { chatwootClient } from "./chatwootClient.ts";
import { mensagemDeConfirmacao, type ReservaParaConfirmar } from "./confirmacaoAoCliente.ts";
import {
  achadosValidos,
  type Correcao,
  decidirRevisao,
  duplicadasDaRevisao,
  camposMudadosPelaEquipe,
  FERRAMENTA_DA_REVISAO,
  instrucoesDoRevisor,
  type MudancaAuditada,
  precoRevisado,
  type ReservaRevisada,
  reservasParaOPrompt,
} from "./revisaoPura.ts";
import { viagemDeHojeJaSaiu } from "./rascunhoPuro.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";

// deno-lint-ignore no-explicit-any
type Linha = Record<string, any>;

const MODELO = Deno.env.get("REVISOR_MODELO") ?? MODELOS.capaz;
const TETO_PADRAO_USD = 40;

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

async function gastoDoMes(): Promise<number> {
  const agora = new Date();
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
  const { data } = await supabaseAdmin.from("revisoes_reservas").select("custo").gte("revisado_em", inicio);
  return (data ?? []).reduce((s: number, r: Linha) => s + Number(r.custo ?? 0), 0);
}

async function tetoDoMes(): Promise<number> {
  const { data } = await supabaseAdmin.from("settings").select("value").eq("key", "revisao_budget").maybeSingle();
  const v = Number(data?.value?.usd ?? data?.value);
  return Number.isFinite(v) && v >= 0 ? v : TETO_PADRAO_USD;
}

/** Reservas futuras do passageiro, no formato do revisor. */
async function reservasDoCliente(customerId: string, hoje: string, botId: string | null) {
  const { data } = await supabaseAdmin
    .from("reservations")
    .select(
      "id, status, type, quantity, unit_price, pickup_neighborhood, pickup_detail, dropoff_location, dropoff_area, created_by, created_at, trip_id, extra_data, trips!inner(trip_date, direction), route_points(code, name)",
    )
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .in("status", ["confirmada", "pendente"])
    .gte("trips.trip_date", hoje)
    .order("created_at");
  return ((data ?? []) as Linha[]).map((r): ReservaRevisada & { _bruta: Linha } => ({
    id: r.id,
    data: r.trips.trip_date,
    direcao: r.trips.direction,
    trip_id: r.trip_id,
    ponto: r.route_points?.code ?? null,
    bairro: r.pickup_neighborhood,
    embarque: r.pickup_detail,
    desembarque: r.dropoff_location,
    quantidade: r.quantity ?? 1,
    valor: r.unit_price == null ? null : Number(r.unit_price),
    tipo: r.type === "encomenda" ? "encomenda" : "passagem",
    status: r.status,
    criada_pelo_bot: !!botId && r.created_by === botId,
    criada_em: r.created_at,
    _bruta: r,
  }));
}

/** Conversa do passageiro (14 dias): o texto todo para o modelo e só cliente+equipe para a prova. */
async function conversaDoCliente(telefone: string) {
  const { data: variantes } = await supabaseAdmin.rpc("fn_variantes_telefone", { p_telefone: telefone });
  const formas = ((variantes as string[] | null) ?? [telefone]).flatMap((v) => [v, `55${v}`]);
  const { data: convs } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, chatwoot_conversation_id")
    .in("phone", formas)
    .is("deleted_at", null);
  const ids = ((convs ?? []) as Linha[]).map((c) => c.id);
  if (!ids.length) return { texto: "", prova: "", falas: [] as { em: string; texto: string }[], chatwoot: null as number | null };
  const desde = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
  const { data: obs } = await supabaseAdmin
    .from("bot_observations")
    .select("author, content, created_at")
    .in("conversation_id", ids)
    .gte("created_at", desde)
    .order("created_at")
    .limit(200);
  const rotulo: Record<string, string> = { cliente: "CLIENTE", equipe: "EQUIPE", bot: "BOT", bot_rascunho: "BOT" };
  const linhas = ((obs ?? []) as Linha[]).map((o) => ({
    quem: o.author as string,
    linha: `[${fmtHora.format(new Date(o.created_at))}] ${rotulo[o.author] ?? o.author}: ${String(o.content ?? "").replace(/\s+/g, " ").slice(0, 600)}`,
  }));
  const chatwoot = ((convs ?? []) as Linha[]).map((c) => c.chatwoot_conversation_id).find(Boolean) ?? null;
  return {
    texto: linhas.map((l) => l.linha).join("\n"),
    prova: linhas.filter((l) => l.quem === "cliente" || l.quem === "equipe").map((l) => l.linha).join("\n"),
    falas: ((obs ?? []) as Linha[])
      .filter((o) => o.author === "cliente" || o.author === "equipe")
      .map((o) => ({ em: new Date(o.created_at).toISOString(), texto: String(o.content ?? "") })),
    chatwoot: chatwoot as number | null,
  };
}

const fmtSoHora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Viagens dos últimos 10 dias (para o revisor não confundir pedido antigo com o atual). */
async function viagensPassadas(customerId: string, hoje: string): Promise<string> {
  const desde = new Date(Date.now() - 10 * 86400 * 1000).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("reservations")
    .select("status, pickup_detail, dropoff_location, quantity, trips!inner(trip_date, direction), route_points(code)")
    .eq("customer_id", customerId)
    .is("deleted_at", null)
    .gte("trips.trip_date", desde)
    .lt("trips.trip_date", hoje);
  const linhas = ((data ?? []) as Linha[]).map((r) =>
    `- ${r.trips.direction === "ida" ? "Ida" : "Volta"} ${String(r.trips.trip_date).split("-").reverse().slice(0, 2).join("/")} · ponto ${r.route_points?.code ?? "?"} · embarque "${r.pickup_detail ?? ""}" · ${r.quantity} passagem(ns) · ${r.status}`
  );
  return linhas.length ? linhas.join("\n") : "(nenhuma nos últimos 10 dias)";
}

async function chamarRevisor(system: string, conteudo: string): Promise<{ entrada: Linha | null; custo: number }> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY nos secrets da função.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 3000,
      system,
      tools: [FERRAMENTA_DA_REVISAO],
      // os modelos 5.5 maiores não aceitam ferramenta forçada: a instrução pede a ferramenta
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: conteudo }],
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`revisor: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const corpo = await res.json();
  const bloco = (corpo.content ?? []).find((b: Linha) => b.type === "tool_use" && b.name === FERRAMENTA_DA_REVISAO.name);
  return { entrada: bloco?.input ?? null, custo: custoUsd(MODELO, corpo.usage) };
}

/** Por reserva, quando uma pessoa (não o bot) mudou cada campo — o revisor não desfaz (issue #389). */
async function mudancasDaEquipe(ids: string[], botId: string | null) {
  const out: Record<string, ReturnType<typeof camposMudadosPelaEquipe>> = {};
  if (!ids.length) return out;
  const { data } = await supabaseAdmin
    .from("audit_logs")
    .select("entity_id, before_data, after_data, performed_by, performed_at")
    .eq("entity_table", "reservations")
    .in("entity_id", ids)
    .eq("action", "update")
    .limit(1000);
  const porReserva = new Map<string, MudancaAuditada[]>();
  for (const l of (data ?? []) as Linha[]) {
    porReserva.set(l.entity_id, [...(porReserva.get(l.entity_id) ?? []), l as MudancaAuditada]);
  }
  for (const [id, logs] of porReserva) out[id] = camposMudadosPelaEquipe(logs, botId);
  return out;
}

/** A equipe mudou o preço desta reserva à mão? (então o revisor não mexe no valor) */
async function precoMudadoPelaEquipe(reservaId: string, botId: string | null): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("audit_logs")
    .select("before_data, after_data, performed_by")
    .eq("entity_table", "reservations")
    .eq("entity_id", reservaId)
    .eq("action", "update")
    .limit(100);
  return ((data ?? []) as Linha[]).some(
    (a) => a.performed_by && a.performed_by !== botId && a.before_data?.unit_price !== a.after_data?.unit_price,
  );
}

async function aplicarCorrecao(c: Correcao, r: ReservaRevisada, ctx: { botId: string | null }) {
  const novaData = c.data ?? r.data;
  const novoSentido = c.sentido ?? r.direcao;
  const novoPonto = c.ponto ?? r.ponto;
  if (c.data || c.sentido || c.ponto) {
    const { data, error } = await supabaseAdmin.rpc("rpc_move_reservation", {
      p_reservation_id: r.id,
      p_new_trip_date: novaData,
      p_new_direction: novoSentido,
      p_new_route_point_code: novoPonto,
      p_actor: ctx.botId,
    });
    if (error || data?.success === false) throw new Error(String(error?.message ?? data?.message ?? "não moveu"));
  }
  const detalhes: Linha = {};
  if ("bairro" in c) detalhes.pickup_neighborhood = c.bairro ?? "";
  if (c.embarque) detalhes.pickup_detail = c.embarque;
  if ("desembarque" in c) {
    detalhes.dropoff_location = c.desembarque ?? "";
    const { data: areas } = await supabaseAdmin
      .from("dropoff_areas")
      .select("code, label")
      .eq("direction", novoSentido)
      .eq("active", true)
      .is("deleted_at", null);
    detalhes.dropoff_area = c.desembarque ? (areaDoDesembarque(c.desembarque, (areas ?? []) as { code: string; label: string }[]) ?? "") : "";
  }
  const { data, error } = await supabaseAdmin.rpc("rpc_edit_reservation", {
    p_reservation_id: r.id,
    p_details: Object.keys(detalhes).length ? detalhes : null,
    p_quantity: c.quantidade ?? null,
    p_contact: null,
    p_move: null,
    p_paid: null,
    p_proof: null,
    p_extra_data: { revisao: { em: new Date().toISOString(), mudancas: c.motivos } },
    p_status: null,
    p_actor: ctx.botId,
  });
  if (error || data?.success === false) throw new Error(String(error?.message ?? data?.message ?? "não editou"));
}

/** Preço pela tabela depois da revisão (zerado → tabela; valor do bot diferente da tabela → tabela). */
async function conferirPreco(r: ReservaRevisada, ctx: { botId: string | null }): Promise<string | null> {
  if (r.tipo !== "passagem" || !r.ponto) return null;
  const { data: pontos } = await supabaseAdmin.from("route_points").select("*").eq("direction", r.direcao).is("deleted_at", null);
  const ponto = acharPonto((pontos ?? []) as Linha[], r.ponto);
  if (!ponto) return null;
  const valor = await valorDoPedido(ponto, { bairro: r.bairro, endereco: r.embarque, desembarque: r.desembarque ?? "" });
  const novo = precoRevisado({
    atual: r.valor,
    tabela: valor.ok ? valor.preco : null,
    alteradoPelaEquipe: await precoMudadoPelaEquipe(r.id, ctx.botId),
  });
  if (novo == null) return null;
  const { data, error } = await supabaseAdmin.rpc("rpc_edit_reservation", {
    p_reservation_id: r.id,
    p_details: { unit_price: novo },
    p_quantity: null,
    p_contact: null,
    p_move: null,
    p_paid: null,
    p_proof: null,
    p_extra_data: { revisao: { em: new Date().toISOString(), mudancas: [`valor: ${r.valor ?? 0} → ${novo} (tabela)`] } },
    p_status: null,
    p_actor: ctx.botId,
  });
  if (error || data?.success === false) return null;
  return `valor: R$ ${r.valor ?? 0} → R$ ${novo} (tabela)`;
}

async function abrirPendencia(customerId: string, telefone: string, detalhe: string, assinatura: string) {
  const { count } = await supabaseAdmin
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("status", "aberta")
    .eq("meta->>revisao_cliente", customerId);
  if ((count ?? 0) > 0) return;
  await supabaseAdmin.rpc("rpc_open_support_ticket", {
    p_subject: "Revisão: conferir reserva",
    p_detail: detalhe.slice(0, 1500),
    p_phone: telefone,
    p_customer_id: customerId,
    p_source: "whatsapp",
    p_meta: { revisao_cliente: customerId, revisao_assinatura: assinatura },
  });
}

async function avisarCliente(chatwoot: number, reservas: ReservaRevisada[], nome: string | null, hoje: string) {
  const { data: cfg } = await supabaseAdmin.from("settings").select("value").eq("key", "agendado_confirmacao").maybeSingle();
  if (cfg?.value?.ativo === false) return;
  const { data: pontos } = await supabaseAdmin.from("route_points").select("code, name").is("deleted_at", null);
  const nomes = Object.fromEntries(((pontos ?? []) as Linha[]).map((p) => [p.code, p.name]));
  const lista: ReservaParaConfirmar[] = reservas.map((r) => ({
    tipo: r.tipo,
    direcao: r.direcao,
    data: r.data,
    pontoCodigo: r.ponto,
    pontoNome: r.ponto ? (nomes[r.ponto] ?? null) : null,
    bairro: r.bairro,
    detalhe: r.embarque,
    desembarque: r.desembarque,
    quantidade: r.quantidade,
    aConfirmar: [],
  }));
  const texto = mensagemDeConfirmacao(lista, { hoje, nome, atualizacao: true });
  if (!texto) return;
  await chatwootClient.postMessage(chatwoot, texto);
}

/** Revisa um passageiro. Devolve o resultado gravado. */
export async function revisarCliente(customerId: string, assinaturaAntes: string, opcoes: { simular?: boolean } = {}) {
  const simular = opcoes.simular === true;
  const hoje = diaCivil(new Date());
  const { data: bot } = await supabaseAdmin.from("users").select("id").eq("name", "Bot WhatsApp").maybeSingle();
  const botId: string | null = bot?.id ?? null;
  const { data: cliente } = await supabaseAdmin
    .from("customers")
    .select("id, name, phone, bot_instructions")
    .eq("id", customerId)
    .maybeSingle();
  if (!cliente) return { resultado: "erro", erro: "cliente não encontrado" };
  let custo = 0;
  try {
    const reservas = await reservasDoCliente(customerId, hoje, botId);
    if (!reservas.length) return { resultado: "ok" };
    const conversa = await conversaDoCliente(cliente.phone);
    const aplicados: string[] = [];
    const pendenciasTexto: string[] = [];
    let mudouParaOCliente = false;

    // 1) duplicadas na mesma viagem
    const dup = duplicadasDaRevisao(reservas);
    for (const id of dup.cancelar) {
      if (simular) {
        aplicados.push(`[simulação] cancelaria a reserva repetida ${id.slice(0, 8)}`);
        continue;
      }
      const { data, error } = await supabaseAdmin.rpc("rpc_cancel_reservation", { p_reservation_id: id, p_actor: botId });
      if (!error && data?.success !== false) {
        aplicados.push(`cancelada a reserva repetida ${id.slice(0, 8)} (mesma viagem)`);
        mudouParaOCliente = true;
      }
    }
    for (const grupo of dup.pendentes) pendenciasTexto.push(`Reservas repetidas na mesma viagem (${grupo.map((i) => i.slice(0, 8)).join(", ")}): a equipe lançou alguma — conferir.`);
    // viagem de hoje que já saiu não é revisada (não há mais o que corrigir)
    const agora = fmtSoHora.format(new Date());
    const ativas = reservas.filter((r) =>
      !dup.cancelar.includes(r.id) && !(r.data === hoje && viagemDeHojeJaSaiu(r.direcao, agora))
    );

    // 2) leitura crítica da conversa
    let achados: ReturnType<typeof achadosValidos> = [];
    let observacoes: string | null = null;
    if (conversa.prova && ativas.length) {
      const { data: pontos } = await supabaseAdmin.from("route_points").select("code, name, direction, active").is("deleted_at", null);
      const lista = ((pontos ?? []) as Linha[]).filter((p) => p.active !== false);
      const porSentido = {
        ida: lista.filter((p) => p.direction === "ida").map((p) => String(p.code)),
        volta: lista.filter((p) => p.direction === "volta").map((p) => String(p.code)),
      };
      const nomes = Object.fromEntries(lista.map((p) => [p.code, p.name]));
      const { data: costume } = await supabaseAdmin.rpc("rpc_endereco_de_costume", { p_customer_id: customerId });
      const extras = [
        cliente.bot_instructions ? `INSTRUÇÕES DA EQUIPE SOBRE ESTE PASSAGEIRO:\n${cliente.bot_instructions}` : "",
        costume?.ida || costume?.volta ? `ENDEREÇO DE COSTUME: ${JSON.stringify({ ida: costume?.ida ?? null, volta: costume?.volta ?? null })}` : "",
      ].filter(Boolean).join("\n\n");
      const system = instrucoesDoRevisor({
        pontos: lista.map((p) => `- ${p.direction}: ${p.code} = ${p.name}`).join("\n"),
        hoje,
        extras,
      });
      const passadas = await viagensPassadas(customerId, hoje);
      const conteudo = `PASSAGEIRO: ${cliente.name || "(sem nome)"}\n\nRESERVAS FUTURAS (revise estas):\n${reservasParaOPrompt(ativas, nomes)}\n\nVIAGENS PASSADAS (já feitas; os pedidos delas na conversa NÃO valem para as futuras):\n${passadas}\n\nCONVERSA (mais antiga primeiro):\n${conversa.texto}`;
      const r = await chamarRevisor(system, conteudo);
      custo += r.custo;
      achados = achadosValidos(r.entrada?.achados);
      // observação só vira pendência quando o revisor diz que a equipe precisa agir
      observacoes = r.entrada?.equipe_precisa_agir === true && typeof r.entrada?.observacoes === "string"
        ? r.entrada.observacoes.slice(0, 600)
        : null;
      const decisao = decidirRevisao(achados, {
        reservas: ativas,
        conversa: conversa.prova,
        hoje,
        pontos: porSentido,
        falas: conversa.falas,
        horaAgora: agora,
        // o que a equipe (ou o Assistente) mudou à mão vence a conversa anterior (issue #389)
        mudancasDaEquipe: await mudancasDaEquipe(ativas.map((x) => x.id), botId),
      });
      for (const c of decisao.correcoes) {
        const alvo = ativas.find((x) => x.id === c.reserva_id) as ReservaRevisada;
        if (simular) {
          aplicados.push(...c.motivos.map((m) => `[simulação] ${alvo.direcao} ${alvo.data}: ${m}`));
          continue;
        }
        try {
          await aplicarCorrecao(c, alvo, { botId });
          aplicados.push(...c.motivos);
          mudouParaOCliente = true;
        } catch (err) {
          pendenciasTexto.push(`Não consegui corrigir ${alvo.direcao} ${alvo.data}: ${String(err).slice(0, 120)} — ${c.motivos.join("; ")}`);
        }
      }
      for (const a of decisao.pendencias) {
        pendenciasTexto.push(`${a.campo}: está "${a.valor_atual ?? "—"}", parece "${a.valor_correto ?? "—"}" (${a.certeza}) — "${a.evidencia}". ${a.explicacao}`);
      }
      if (observacoes) pendenciasTexto.push(`Observação do revisor: ${observacoes}`);
    }

    // 3) preço pela tabela, com os dados já corrigidos
    if (simular) {
      evento("revisor_simulacao", { aplicados: aplicados.length, pendencias: pendenciasTexto.length, custo });
      return { resultado: "simulacao", aplicados, pendencias: pendenciasTexto, achados, custo };
    }
    const depois = await reservasDoCliente(customerId, hoje, botId);
    for (const r of depois) {
      const mudou = await conferirPreco(r, { botId });
      if (mudou) aplicados.push(`${r.direcao} ${r.data}: ${mudou}`);
    }

    // 4) cliente vê o resumo atualizado; o resto vira pendência
    if (mudouParaOCliente && conversa.chatwoot) {
      await avisarCliente(conversa.chatwoot, await reservasDoCliente(customerId, hoje, botId), cliente.name, hoje).catch(() => {});
    }
    if (pendenciasTexto.length) {
      await abrirPendencia(customerId, cliente.phone, pendenciasTexto.join("\n"), assinaturaAntes);
    }
    const resultado = aplicados.length ? "corrigida" : pendenciasTexto.length ? "pendencia" : "ok";
    const { data: assinatura } = await supabaseAdmin.rpc("fn_assinatura_revisao", { p_customer_id: customerId });
    await supabaseAdmin.from("revisoes_reservas").insert({
      customer_id: customerId,
      assinatura: assinatura ?? assinaturaAntes,
      resultado,
      achados,
      aplicados,
      observacoes,
      modelo: conversa.prova ? MODELO : null,
      custo,
    });
    evento("revisor_cliente", { resultado, aplicados: aplicados.length, pendencias: pendenciasTexto.length, custo });
    return { resultado, aplicados, pendencias: pendenciasTexto.length };
  } catch (err) {
    await supabaseAdmin.from("revisoes_reservas").insert({
      customer_id: customerId,
      assinatura: assinaturaAntes,
      resultado: "erro",
      erro: String(err).slice(0, 500),
      custo,
    });
    evento("bot_erro", { etapa: "revisor", erro: String(err).slice(0, 300) });
    return { resultado: "erro", erro: String(err) };
  }
}

/** Uma rodada da rotina: revisa até `limite` passageiros, dentro do teto do mês. */
export async function rodadaDoRevisor(limite = 6, opcoes: { simular?: boolean } = {}) {
  const [gasto, teto] = await Promise.all([gastoDoMes(), tetoDoMes()]);
  if (gasto >= teto) {
    evento("revisor_teto", { gasto, teto });
    return { revisados: 0, motivo: "teto do mês atingido" };
  }
  const { data, error } = await supabaseAdmin.rpc("fn_clientes_para_revisar", { p_limite: limite });
  if (error) throw new Error(`fn_clientes_para_revisar: ${error.message}`);
  const fila = (data ?? []) as Linha[];
  const resultados: string[] = [];
  for (const c of fila) {
    const r = await revisarCliente(c.customer_id, c.assinatura, opcoes);
    resultados.push(opcoes.simular ? JSON.stringify(r) : String(r.resultado));
  }
  evento("revisor_rodada", { revisados: fila.length, resultados });
  return { revisados: fila.length, resultados };
}
