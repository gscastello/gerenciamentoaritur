// supabase/functions/_shared/assistente.ts
//
// Assistente da equipe (issue #288) — a parte com I/O. Lê o app com as
// permissões de QUEM ESTÁ LOGADO (cliente Supabase com o token da pessoa:
// RLS e as travas das RPCs valem igual à Agenda) e só PROPÕE gravações; a
// gravação acontece em executarAcao, depois do toque em "Confirmar" no app.
// Preço: sempre recalculado aqui pela tabela (valorDoPedido), nunca o que o
// navegador mandou. Regras puras em assistentePuro.ts.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { acharPonto, lugaresNasCidades, valorDoPedido } from "./agenteFerramentas.ts";
import { areaDoDesembarque, calendarioParaOPrompt, diaCivil, somarDias } from "./agentePuro.ts";
import {
  type Acao,
  type AcaoCriar,
  type AcaoMudar,
  custoUsd,
  descreverAcao,
  escolherModelo,
  FERRAMENTAS_DO_ASSISTENTE,
  instrucoesDoAssistente,
  MODELOS,
  type MensagemDoChat,
  palavrasDaBusca,
  reservasParecidas,
  type Uso,
  validarCriacao,
  validarMudanca,
} from "./assistentePuro.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { variantesTelefone } from "./telefone.ts";
import { whatsappService } from "./whatsappService.ts";

// biome-ignore lint/suspicious/noExplicitAny: linhas do banco e respostas da API
type Linha = Record<string, any>;

export type Contexto = {
  /** cliente Supabase com o token de quem está logado */
  db: SupabaseClient;
  userId: string;
  papel: string;
  hoje: string;
  pontos: { ida: string[]; volta: string[] };
  pontosCompletos: { ida: Linha[]; volta: Linha[] };
  areas: { ida: { code: string; label: string }[]; volta: { code: string; label: string }[] };
  nomesDosPontos: Record<string, string>;
  acoes: Acao[];
};

function evento(nome: string, dados: Record<string, unknown>) {
  console.log(JSON.stringify({ evento: nome, ...dados }));
}

export async function montarContexto(db: SupabaseClient, userId: string, papel: string): Promise<Contexto> {
  const [ida, volta, areasIda, areasVolta] = await Promise.all([
    whatsappService.listRoutePoints("ida"),
    whatsappService.listRoutePoints("volta"),
    whatsappService.listDropoffAreas("ida"),
    whatsappService.listDropoffAreas("volta"),
  ]);
  const ativos = (l: Linha[] | null) => (l ?? []).filter((p) => p.active !== false);
  const nomes: Record<string, string> = {};
  for (const p of [...ativos(ida), ...ativos(volta)]) nomes[String(p.code)] = String(p.name);
  return {
    db,
    userId,
    papel,
    hoje: diaCivil(new Date()),
    pontos: { ida: ativos(ida).map((p) => String(p.code)), volta: ativos(volta).map((p) => String(p.code)) },
    pontosCompletos: { ida: ativos(ida), volta: ativos(volta) },
    areas: {
      ida: (areasIda ?? []) as { code: string; label: string }[],
      volta: (areasVolta ?? []) as { code: string; label: string }[],
    },
    nomesDosPontos: nomes,
    acoes: [],
  };
}

const telefonesDe = (t: string) => {
  const v = variantesTelefone(t).filter(Boolean);
  return { semDdi: v, comDdi: v.map((x) => `55${x}`) };
};
const CAMPOS_RESERVA =
  "id, customer_id, data, direcao, pontoId, bairro, localExato, desembarque, quantidade, valorUnit, valorTotal, status, tipo, nome, telefone, pago, extra";
const resumoDaReserva = (r: Linha, nomes: Record<string, string>) =>
  `${r.direcao === "ida" ? "Ida" : "Volta"} ${String(r.data).split("-").reverse().slice(0, 2).join("/")} · ${r.nome || "(sem nome)"} · ${
    nomes[r.pontoId] ?? r.pontoId ?? "encomenda"
  }${r.localExato ? `, ${r.localExato}` : ""}`;

async function buscarReserva(ctx: Contexto, id: string): Promise<Linha | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await ctx.db.from("v_reservations_flat").select(CAMPOS_RESERVA).eq("id", id).maybeSingle();
  return data ?? null;
}

/** Preço de uma reserva nova pela tabela (mesma regra do bot). null = sem valor. */
async function precoDaCriacao(ctx: Contexto, a: Omit<AcaoCriar, "valor_unitario" | "aviso">) {
  if (a.tipo_reserva === "encomenda") return { valor: null, aviso: null };
  if (a.valor_dito != null) return { valor: a.valor_dito, aviso: "Valor informado por você no chat." };
  if (a.sentido === "ida" && /a confirmar/i.test(a.embarque ?? "")) {
    return { valor: null, aviso: "Sem endereço: entra sem valor até o cliente confirmar onde embarca." };
  }
  const ponto = acharPonto(ctx.pontosCompletos[a.sentido], a.ponto);
  if (!ponto) return { valor: null, aviso: "Ponto não reconhecido para calcular o valor." };
  const v = await valorDoPedido(ponto, { bairro: a.bairro, endereco: a.embarque, desembarque: a.desembarque ?? "" });
  if (v.ok) return { valor: v.preco, aviso: v.trecho ? `Valor do trecho ${v.trecho}.` : null };
  return { valor: null, aviso: `Sem valor na tabela: ${String(v.erro?.erro ?? "confira o preço").slice(0, 160)}` };
}

/** Novo valor de uma mudança que mexe no embarque/desembarque (null = mantém o atual). */
async function precoDaMudanca(ctx: Contexto, atual: Linha, m: Omit<AcaoMudar, "tipo" | "reserva_id" | "resumo_atual" | "valor_unitario">) {
  if (atual.tipo === "encomenda") return null;
  if (!(m.novo_ponto || m.bairro || m.embarque || m.desembarque || m.novo_sentido)) return null;
  const sentido = (m.novo_sentido ?? atual.direcao) as "ida" | "volta";
  const ponto = acharPonto(ctx.pontosCompletos[sentido], m.novo_ponto ?? atual.pontoId);
  if (!ponto) return null;
  const v = await valorDoPedido(ponto, {
    bairro: m.bairro ?? atual.bairro,
    endereco: m.embarque ?? atual.localExato,
    desembarque: m.desembarque ?? atual.desembarque ?? "",
  });
  return v.ok ? v.preco : null;
}

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

async function executarFerramenta(nome: string, a: Linha, ctx: Contexto): Promise<unknown> {
  switch (nome) {
    case "buscar_cliente": {
      let q = ctx.db.from("customers").select("id, name, phone, phone_secondary").is("deleted_at", null).limit(8);
      if (a.telefone) {
        const { semDdi } = telefonesDe(String(a.telefone));
        if (!semDdi.length) return { ok: false, erro: "telefone inválido" };
        q = q.or(`phone.in.(${semDdi.join(",")}),phone_secondary.in.(${semDdi.join(",")})`);
      } else if (a.nome) {
        // o nome inteiro; se não achar, cada palavra ("Iara Santo Antônio" acha a Iara)
        const palavras = palavrasDaBusca(String(a.nome));
        const filtro = [String(a.nome), ...palavras]
          .map((p) => p.replace(/[%_,()]/g, " ").trim())
          .filter(Boolean)
          .map((p) => `name.ilike.%${p}%`)
          .join(",");
        q = q.or(filtro);
      } else return { ok: false, erro: "informe telefone ou nome" };
      const { data: clientes, error } = await q;
      if (error) return { ok: false, erro: error.message };
      if (!clientes?.length) return { ok: true, clientes: [], nota: "Nenhum cliente com esse telefone/nome." };
      const { data: reservas } = await ctx.db
        .from("v_reservations_flat")
        .select(CAMPOS_RESERVA)
        .in("customer_id", clientes.map((c: Linha) => c.id))
        .gte("data", ctx.hoje)
        .in("status", ["confirmada", "pendente"])
        .order("data")
        .limit(30);
      return {
        ok: true,
        clientes: clientes.map((c: Linha) => ({
          id: c.id,
          nome: c.name,
          telefone: c.phone,
          proximas_reservas: (reservas ?? []).filter((r: Linha) => r.customer_id === c.id).map((r: Linha) => ({
            id: r.id,
            resumo: resumoDaReserva(r, ctx.nomesDosPontos),
            status: r.status,
            valor: r.valorUnit,
          })),
        })),
      };
    }
    case "ler_conversa": {
      if (ctx.papel !== "admin") return { ok: false, erro: "Ler a conversa do WhatsApp é só para admin." };
      const { comDdi, semDdi } = telefonesDe(String(a.telefone ?? ""));
      if (!semDdi.length) return { ok: false, erro: "telefone inválido" };
      const { data: convs } = await ctx.db
        .from("whatsapp_conversations")
        .select("id, last_message_preview, last_message_at")
        .in("phone", [...comDdi, ...semDdi])
        .is("deleted_at", null);
      if (!convs?.length) return { ok: true, mensagens: [], nota: "Sem conversa no WhatsApp com esse número." };
      const { data: obs, error } = await ctx.db
        .from("bot_observations")
        .select("author, content, created_at")
        .in("conversation_id", convs.map((c: Linha) => c.id))
        .in("author", ["cliente", "equipe"])
        .order("created_at", { ascending: false })
        .limit(40);
      if (error || (!obs?.length && ctx.papel !== "admin")) {
        return { ok: false, erro: "Ler a conversa do WhatsApp é só para admin." };
      }
      const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const ultima = convs[0]?.last_message_preview;
      return {
        ok: true,
        mensagens: (obs ?? []).reverse().map((o: Linha) => `[${fmt.format(new Date(o.created_at))}] ${o.author}: ${String(o.content).slice(0, 500)}`),
        nota: /áudio|audio|liga/i.test(String(ultima ?? ""))
          ? "A última mensagem foi áudio ou ligação: o conteúdo não aparece aqui. Pergunte ao sócio o que foi combinado."
          : null,
      };
    }
    case "procurar_reserva": {
      const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(a.data ?? "")) ? String(a.data) : ctx.hoje;
      let q = ctx.db
        .from("v_reservations_flat")
        .select(CAMPOS_RESERVA)
        .gte("data", desde)
        .lte("data", somarDias(desde, a.data ? 0 : 21))
        .neq("status", "cancelada")
        .order("data")
        .limit(800);
      if (a.sentido === "ida" || a.sentido === "volta") q = q.eq("direcao", a.sentido);
      const { data: rs, error } = await q;
      if (error) return { ok: false, erro: error.message };
      const achadas = reservasParecidas(String(a.texto ?? ""), (rs ?? []) as Linha[], (r) => ({
        nome: r.nome,
        outros: [r.localExato, r.bairro, r.desembarque, ctx.nomesDosPontos[r.pontoId] ?? r.pontoId],
      }));
      if (!achadas.length) return { ok: true, reservas: [], nota: "Nada parecido nas reservas de hoje em diante." };
      return {
        ok: true,
        reservas: achadas.map(({ reserva: r, pontos }) => ({
          id: r.id,
          resumo: resumoDaReserva(r, ctx.nomesDosPontos),
          telefone: r.telefone,
          status: r.status,
          pontos,
        })),
      };
    }
    case "reservas_do_dia": {
      const data = String(a.data ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: "data AAAA-MM-DD" };
      let q = ctx.db.from("v_reservations_flat").select(CAMPOS_RESERVA).eq("data", data).neq("status", "cancelada").limit(120);
      if (a.sentido === "ida" || a.sentido === "volta") q = q.eq("direcao", a.sentido);
      const { data: rs, error } = await q;
      if (error) return { ok: false, erro: error.message };
      return {
        ok: true,
        total: rs?.length ?? 0,
        reservas: (rs ?? []).map((r: Linha) => ({
          id: r.id,
          sentido: r.direcao,
          nome: r.nome,
          telefone: r.telefone,
          tipo: r.tipo,
          ponto: r.pontoId,
          bairro: r.bairro,
          embarque: r.localExato,
          desembarque: r.desembarque,
          quantidade: r.quantidade,
          valor_unitario: r.valorUnit,
          status: r.status,
          pago: r.pago,
          a_confirmar: r.extra?.a_confirmar ?? null,
        })),
      };
    }
    case "vagas": {
      const { data, error } = await ctx.db
        .from("v_trip_occupancy")
        .select("direction, capacity, occupied, available")
        .eq("trip_date", String(a.data ?? ""));
      if (error) return { ok: false, erro: error.message };
      return { ok: true, viagens: data?.length ? data : "Nenhuma viagem cadastrada nesse dia (o app cria ao reservar; capacidade padrão)." };
    }
    case "calcular_valor": {
      const sentido = a.sentido === "volta" ? "volta" : "ida";
      const ponto = acharPonto(ctx.pontosCompletos[sentido], a.ponto);
      if (!ponto) return { ok: false, erro: `ponto desconhecido; pontos: ${ctx.pontos[sentido].join(", ")}` };
      return await valorDoPedido(ponto, { bairro: a.bairro ?? null, endereco: a.embarque ?? null, desembarque: a.desembarque ?? "" });
    }
    case "pendencias": {
      const [pend, prontas, pendentes] = await Promise.all([
        ctx.db.from("v_pendencias_atendimento").select("assunto, detail, phone, cliente, created_at").eq("status", "aberta").order("created_at", { ascending: false }).limit(20),
        ctx.db.from("reservation_drafts").select("trip_date, direction, customer_name, phone, notes").eq("status", "pronta").gte("trip_date", ctx.hoje).limit(20),
        ctx.db.from("v_reservations_flat").select(CAMPOS_RESERVA).eq("status", "pendente").gte("data", ctx.hoje).limit(20),
      ]);
      return {
        ok: true,
        pendencias_abertas: pend.data ?? [],
        reservas_prontas_para_lancar: prontas.data ?? [],
        reservas_pendentes: (pendentes.data ?? []).map((r: Linha) => ({ id: r.id, resumo: resumoDaReserva(r, ctx.nomesDosPontos) })),
      };
    }
    case "onde_fica":
      return { ok: true, lugares: await lugaresNasCidades(String(a.texto ?? "")) };
    case "financeiro": {
      if (!["admin", "financeiro"].includes(ctx.papel)) return { ok: false, erro: "Números do financeiro são só para admin/financeiro." };
      const de = String(a.de ?? "");
      const ate = String(a.ate ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || ate < de || ate > somarDias(de, 400)) {
        return { ok: false, erro: "período inválido (AAAA-MM-DD, até 400 dias)" };
      }
      const [res, lanc, receber] = await Promise.all([
        ctx.db.from("v_reservations_flat").select("data, direcao, tipo, quantidade, valorTotal, status").gte("data", de).lte("data", ate).in("status", ["confirmada", "embarcado"]).limit(10000),
        ctx.db.from("financial_entries").select("type, category, amount").gte("entry_date", de).lte("entry_date", ate).is("deleted_at", null).limit(10000),
        ctx.db.from("v_contas_a_receber").select("valor_devido"),
      ]);
      const somar = (l: Linha[], f: (x: Linha) => string, v: (x: Linha) => number) => {
        const out: Record<string, number> = {};
        for (const x of l) out[f(x)] = Math.round(((out[f(x)] ?? 0) + v(x)) * 100) / 100;
        return out;
      };
      const rs = (res.data ?? []) as Linha[];
      const ls = (lanc.data ?? []) as Linha[];
      return {
        ok: true,
        periodo: { de, ate },
        passagens_por_sentido: somar(rs.filter((r) => r.tipo === "passagem"), (r) => r.direcao, (r) => Number(r.quantidade ?? 0)),
        valor_das_passagens_por_sentido: somar(rs.filter((r) => r.tipo === "passagem"), (r) => r.direcao, (r) => Number(r.valorTotal ?? 0)),
        encomendas: rs.filter((r) => r.tipo === "encomenda").length,
        lancamentos_por_tipo: somar(ls, (l) => String(l.type), (l) => Number(l.amount ?? 0)),
        lancamentos_por_categoria: somar(ls, (l) => `${l.type}:${l.category ?? "sem categoria"}`, (l) => Number(l.amount ?? 0)),
        contas_a_receber: {
          quantidade: receber.data?.length ?? 0,
          total: Math.round((receber.data ?? []).reduce((s: number, x: Linha) => s + Number(x.valor_devido ?? 0), 0) * 100) / 100,
        },
        erros: [res.error?.message, lanc.error?.message, receber.error?.message].filter(Boolean),
      };
    }
    case "propor_reserva": {
      const v = validarCriacao(a, { hoje: ctx.hoje, pontos: ctx.pontos });
      if (!v.ok) return { ok: false, erro: v.erro };
      const avisos: string[] = [];
      const { valor, aviso } = await precoDaCriacao(ctx, v.acao);
      if (aviso) avisos.push(aviso);
      const [{ data: ocup }, { semDdi }] = [
        await ctx.db.from("v_trip_occupancy").select("available").eq("trip_date", v.acao.data).eq("direction", v.acao.sentido).maybeSingle(),
        telefonesDe(v.acao.telefone),
      ];
      if (ocup && Number(ocup.available) < v.acao.quantidade && v.acao.tipo_reserva === "passagem") {
        avisos.push(`Só ${ocup.available} vaga(s) livre(s) nessa viagem.`);
      }
      const { data: jaTem } = await ctx.db
        .from("v_reservations_flat")
        .select("id")
        .in("telefone", semDdi)
        .eq("data", v.acao.data)
        .eq("direcao", v.acao.sentido)
        .in("status", ["confirmada", "pendente"])
        .limit(1);
      if (jaTem?.length) avisos.push("Esse cliente já tem reserva nesse dia e sentido.");
      const acao: Acao = { ...v.acao, valor_unitario: valor, aviso: avisos.join(" ") || null, id: crypto.randomUUID() };
      ctx.acoes.push(acao);
      return { ok: true, proposta: descreverAcao(acao, ctx.nomesDosPontos), avisos };
    }
    case "propor_mudanca": {
      const atual = await buscarReserva(ctx, String(a.reserva_id ?? ""));
      if (!atual || atual.status === "cancelada") return { ok: false, erro: "Reserva não encontrada (use o id de reservas_do_dia ou buscar_cliente)." };
      const v = validarMudanca(a, { hoje: ctx.hoje });
      if (!v.ok) return { ok: false, erro: v.erro };
      const sentido = (v.mudancas.novo_sentido ?? atual.direcao) as "ida" | "volta";
      if (v.mudancas.novo_ponto && !ctx.pontos[sentido].includes(v.mudancas.novo_ponto)) {
        return { ok: false, erro: `Ponto não existe na ${sentido}. Pontos: ${ctx.pontos[sentido].join(", ")}.` };
      }
      const acao: Acao = {
        tipo: "mudar",
        reserva_id: atual.id,
        resumo_atual: resumoDaReserva(atual, ctx.nomesDosPontos),
        ...v.mudancas,
        valor_unitario: await precoDaMudanca(ctx, atual, v.mudancas),
        id: crypto.randomUUID(),
      };
      ctx.acoes.push(acao);
      return { ok: true, proposta: descreverAcao(acao, ctx.nomesDosPontos) };
    }
    case "propor_cancelamento": {
      const atual = await buscarReserva(ctx, String(a.reserva_id ?? ""));
      if (!atual || atual.status === "cancelada") return { ok: false, erro: "Reserva não encontrada ou já cancelada." };
      const acao: Acao = { tipo: "cancelar", reserva_id: atual.id, resumo_atual: resumoDaReserva(atual, ctx.nomesDosPontos), id: crypto.randomUUID() };
      ctx.acoes.push(acao);
      return { ok: true, proposta: descreverAcao(acao, ctx.nomesDosPontos) };
    }
    default:
      return { ok: false, erro: `ferramenta desconhecida: ${nome}` };
  }
}

// ---------------------------------------------------------------------------
// Conversa com o modelo
// ---------------------------------------------------------------------------

async function chamarModelo(modelo: string, system: string, messages: Linha[]): Promise<Linha> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY nos secrets da função.");
  const capaz = modelo === MODELOS.capaz;
  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
  // recusa por engano do classificador cai num modelo de reserva (só no Sonnet 5.5)
  if (capaz) headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelo,
      max_tokens: 8000,
      system,
      tools: FERRAMENTAS_DO_ASSISTENTE,
      messages,
      cache_control: { type: "ephemeral" },
      output_config: { effort: "medium" },
      ...(capaz ? { fallbacks: "default" } : {}),
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

export async function conversar(historico: MensagemDoChat[], ctx: Contexto, opcoes: { voz?: boolean } = {}) {
  const ultimo = historico[historico.length - 1]?.texto ?? "";
  const modelo = escolherModelo(ultimo, historico.length);
  const desembarques = (["ida", "volta"] as const).map((d) => `- ${d}: ${ctx.areas[d].map((x) => x.label).join(", ")}`).join("\n");
  const pontos = (["ida", "volta"] as const)
    .flatMap((d) => ctx.pontosCompletos[d].map((p) => `- ${d}: ${p.code} = ${p.name}`))
    .join("\n");
  const system = instrucoesDoAssistente({ pontos, desembarques, voz: opcoes.voz });
  const messages: Linha[] = historico.map((m, i) => ({
    role: m.papel === "usuario" ? "user" : "assistant",
    content: i === historico.length - 1 ? `HOJE (São Luís):\n${calendarioParaOPrompt(new Date())}\n\nPEDIDO:\n${m.texto}` : m.texto,
  }));
  const uso: Required<Uso> = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  let custo = 0;
  let resposta: Linha = {};
  for (let volta = 0; volta < 8; volta++) {
    resposta = await chamarModelo(modelo, system, messages);
    const u = (resposta.usage ?? {}) as Uso;
    for (const k of Object.keys(uso) as (keyof Uso)[]) uso[k] += Number(u[k] ?? 0);
    custo += custoUsd(String(resposta.model ?? modelo), u);
    if (resposta.stop_reason !== "tool_use") break;
    messages.push({ role: "assistant", content: resposta.content });
    const chamadas = (resposta.content ?? []).filter((b: Linha) => b.type === "tool_use");
    const resultados = await Promise.all(
      chamadas.map(async (b: Linha) => {
        let saida: unknown;
        try {
          saida = await executarFerramenta(b.name, b.input ?? {}, ctx);
        } catch (err) {
          saida = { ok: false, erro: String(err).slice(0, 200) };
        }
        return { type: "tool_result", tool_use_id: b.id, content: JSON.stringify(saida).slice(0, 30000) };
      }),
    );
    messages.push({ role: "user", content: resultados });
  }
  let texto = (resposta.content ?? []).filter((b: Linha) => b.type === "text").map((b: Linha) => b.text).join("\n").trim();
  if (resposta.stop_reason === "refusal") texto = "Não consegui atender esse pedido. Tente dizer de outro jeito.";
  if (!texto) texto = ctx.acoes.length ? "Confira a proposta abaixo." : "Não entendi. Pode dizer de outro jeito?";
  return {
    texto,
    acoes: ctx.acoes.map((a) => ({ ...a, descricao: descreverAcao(a, ctx.nomesDosPontos) })),
    modelo,
    uso,
    custo: Math.round(custo * 100000) / 100000,
  };
}

// ---------------------------------------------------------------------------
// Gravação (depois do "Confirmar")
// ---------------------------------------------------------------------------

export async function executarAcao(bruta: Linha, ctx: Contexto): Promise<{ ok: boolean; mensagem: string }> {
  const tipo = bruta?.tipo;
  if (tipo === "criar") {
    const v = validarCriacao(bruta, { hoje: ctx.hoje, pontos: ctx.pontos });
    if (!v.ok) return { ok: false, mensagem: v.erro };
    const a = v.acao;
    const { valor } = await precoDaCriacao(ctx, a); // recalculado aqui: nunca o valor do navegador
    const semEndereco = /a confirmar/i.test(a.embarque ?? "");
    const { data, error } = await ctx.db.rpc("rpc_create_reservation", {
      p_trip_date: a.data,
      p_direction: a.sentido,
      p_customer_name: a.nome,
      p_customer_phone: a.telefone,
      p_type: a.tipo_reserva,
      p_route_point_code: a.ponto,
      p_quantity: a.quantidade,
      p_unit_price: valor ?? 0,
      p_payment_method: a.pagamento,
      p_pickup_neighborhood: a.bairro,
      p_pickup_detail: a.embarque,
      p_dropoff_location: a.desembarque,
      p_dropoff_area: a.desembarque ? areaDoDesembarque(a.desembarque, ctx.areas[a.sentido]) : null,
      p_status: "confirmada",
      p_extra_data: { origem: "assistente", ...(semEndereco ? { a_confirmar: ["endereco"] } : {}) },
      // idempotente: dois toques em "Confirmar" não duplicam
      p_whatsapp_source_message_id: `assistente-${String(bruta.id ?? crypto.randomUUID()).slice(0, 40)}`,
      p_created_by: ctx.userId,
    });
    if (error || !data?.success) return { ok: false, mensagem: String(error?.message ?? data?.message ?? "A reserva foi recusada.") };
    evento("assistente_acao", { tipo, ok: true });
    return { ok: true, mensagem: data.message === "created" || data.status ? "Reserva lançada na Agenda." : "Reserva já estava lançada." };
  }

  const atual = await buscarReserva(ctx, String(bruta?.reserva_id ?? ""));
  if (!atual || atual.status === "cancelada") return { ok: false, mensagem: "Reserva não encontrada ou já cancelada." };

  if (tipo === "cancelar") {
    const { data, error } = await ctx.db.rpc("rpc_cancel_reservation", { p_reservation_id: atual.id, p_actor: ctx.userId });
    if (error || data?.success === false) return { ok: false, mensagem: String(error?.message ?? data?.message ?? "Não cancelou.") };
    evento("assistente_acao", { tipo, ok: true });
    return { ok: true, mensagem: "Reserva cancelada (fica no histórico)." };
  }

  if (tipo === "mudar") {
    const v = validarMudanca(bruta, { hoje: ctx.hoje });
    if (!v.ok) return { ok: false, mensagem: v.erro };
    const m = v.mudancas;
    if (m.nova_data || m.novo_sentido || m.novo_ponto) {
      const { data, error } = await ctx.db.rpc("rpc_move_reservation", {
        p_reservation_id: atual.id,
        p_new_trip_date: m.nova_data ?? atual.data,
        p_new_direction: m.novo_sentido ?? atual.direcao,
        p_new_route_point_code: m.novo_ponto ?? atual.pontoId,
        p_actor: ctx.userId,
      });
      if (error || data?.success === false) return { ok: false, mensagem: String(error?.message ?? data?.message ?? "Não mudou o dia/ponto.") };
    }
    const detalhes: Record<string, unknown> = {};
    if (m.embarque) detalhes.pickup_detail = m.embarque;
    if (m.bairro) detalhes.pickup_neighborhood = m.bairro;
    if (m.desembarque) detalhes.dropoff_location = m.desembarque;
    const preco = await precoDaMudanca(ctx, atual, m);
    if (preco != null) detalhes.unit_price = preco;
    if (Object.keys(detalhes).length || m.quantidade) {
      const { error } = await ctx.db.rpc("rpc_edit_reservation", {
        p_reservation_id: atual.id,
        p_details: Object.keys(detalhes).length ? detalhes : null,
        p_quantity: m.quantidade,
        p_contact: null,
        p_move: null,
        p_paid: null,
        p_proof: null,
        p_extra_data: null,
        p_status: null,
        p_actor: ctx.userId,
      });
      if (error) return { ok: false, mensagem: error.message };
    }
    evento("assistente_acao", { tipo, ok: true });
    return { ok: true, mensagem: "Reserva atualizada." };
  }
  return { ok: false, mensagem: "Ação desconhecida." };
}

// ---------------------------------------------------------------------------
// Uso e teto de gasto
// ---------------------------------------------------------------------------

export async function gastoDoMes(): Promise<{ gasto: number; teto: number }> {
  const inicio = `${diaCivil(new Date()).slice(0, 8)}01`;
  const [{ data: linhas }, { data: cfg }] = await Promise.all([
    supabaseAdmin.from("assistente_uso").select("custo_usd").gte("created_at", `${inicio}T03:00:00Z`),
    supabaseAdmin.from("settings").select("value").eq("key", "assistant_budget").maybeSingle(),
  ]);
  const gasto = (linhas ?? []).reduce((s: number, l: Linha) => s + Number(l.custo_usd ?? 0), 0);
  const teto = Number(cfg?.value?.usd_mensal ?? 20);
  return { gasto: Math.round(gasto * 100) / 100, teto };
}

export async function registrarUso(userId: string, modelo: string, uso: Required<Uso>, custo: number) {
  const { error } = await supabaseAdmin.from("assistente_uso").insert({
    user_id: userId,
    modelo,
    entrada: uso.input_tokens,
    saida: uso.output_tokens,
    cache_leitura: uso.cache_read_input_tokens,
    cache_escrita: uso.cache_creation_input_tokens,
    custo_usd: custo,
  });
  if (error) evento("bot_aviso", { aviso: "assistente_uso_nao_gravado", erro: error.message.slice(0, 200) });
}
