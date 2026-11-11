// supabase/functions/_shared/agenteFerramentas.ts
//
// O que o atendente de IA pode CONSULTAR e FAZER no app. Duas regras:
//
//   1) Tudo que ele diz sobre vaga, preço, horário, reserva ou pagamento vem do
//      resultado de uma ferramenta (lido do banco agora) — e a trava de números
//      (botGuard) confere isso na resposta. O preço unitário nunca é digitado
//      pelo modelo: sai da tabela do sistema.
//   2) Ferramentas de cliente só enxergam o PRÓPRIO cliente da conversa (pelo
//      telefone). Nada de dados de outros passageiros; reserva alheia é recusada.
//
// As ações passam pelo whatsappService (modo humano, modo sombra, auditoria e as
// mesmas RPCs de sempre — a capacidade continua decidida pelo banco).

import {
  andamentoPeloHorario,
  areaDoDesembarque,
  bairroDaTabela,
  bairroParecido,
  calcularTotal,
  costumeParaFerramenta,
  cronogramaValido,
  nomeDeveSerCompletado,
  type PedidoValidado,
  precoDoLocalDeOutros,
  trechoDoPedido,
  validarPedidoDeReserva,
} from "./agentePuro.ts";
import { resolverBairro } from "./bairroResolver.ts";
import { getBotContext } from "./botContext.ts";
import { type LugarNasCidades, lugarDeOutraCidade, telefoneDoPassageiro } from "./rascunhoPuro.ts";
import { variantesTelefone } from "./telefone.ts";
import { supabaseAdmin } from "./supabaseAdmin.ts";
import { whatsappService, WhatsappServiceError } from "./whatsappService.ts";

export type ContextoDoAgente = {
  conversationId: string;
  telefone: string;
  /** id da mensagem do cliente que está sendo respondida (idempotência das gravações) */
  mensagemId: number;
  /** YYYY-MM-DD de hoje em São Luís */
  hoje: string;
  /** o que já foi gravado/alterado neste turno */
  escrita: { criou: boolean; alterou: boolean; cancelou: boolean; esperou: boolean };
  consultouReservas: boolean;
  transferiu: boolean;
  silencio: boolean;
  /** parar tudo: a conversa passou para atendimento humano durante o turno */
  parar: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: linhas do banco
  clienteCache?: { valor: any | null };
  // biome-ignore lint/suspicious/noExplicitAny: linhas do banco
  reservasCache?: any[];
};

type Ferramenta = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

const DATA = { type: "string", description: "Data no formato AAAA-MM-DD (use o calendário do prompt)." };
const DIRECAO = { type: "string", enum: ["ida", "volta"], description: "ida = São Luís → Pirapemas/Cantanhede; volta = o sentido contrário." };

export const FERRAMENTAS: Ferramenta[] = [
  {
    name: "consultar_viagem",
    description:
      "Consulta no app a viagem de uma data e direção: capacidade, passageiros e VAGAS DISPONÍVEIS agora. Use sempre que o cliente perguntar de vaga ou lotação e antes de oferecer reserva. Para saber se a van já saiu ou onde está, use andamento_da_viagem.",
    input_schema: { type: "object", properties: { data: DATA, direcao: DIRECAO }, required: ["data", "direcao"] },
  },
  {
    name: "andamento_da_viagem",
    description:
      "Estimativa do andamento pelo horário: confere se o cliente tem reserva e devolve a janela de embarque do lugar dele e a situação agora (ainda não saiu, em rota a caminho, em rota passando, passou do previsto). Também traz o contato do motorista. Use quando perguntarem se já saiu, se está chegando, onde estamos ou que horas passa num lugar.",
    input_schema: {
      type: "object",
      properties: {
        direcao: DIRECAO,
        lugar: { type: "string", description: "Cidade ou ponto que o cliente citou, se ele não tiver reserva ou falar de outro lugar." },
      },
    },
  },
  {
    name: "listar_pontos_e_precos",
    description:
      "Lista os pontos de embarque de uma direção com horário, preço da passagem (ou 'por bairro'), janela de embarque, e a tabela de preço da busca em casa por bairro. Use para responder valor, horário e onde embarcar.",
    input_schema: { type: "object", properties: { direcao: DIRECAO }, required: ["direcao"] },
  },
  {
    name: "calcular_valor",
    description:
      "Calcula o valor de um pedido comparando onde o cliente sobe e onde desce: tabela de trechos, senão preço do ponto ou do bairro, × quantidade. Use antes de falar um valor ao cliente; nunca faça a conta de cabeça. Se voltar TRECHO_SEM_VALOR, não diga valor: chame o atendente.",
    input_schema: {
      type: "object",
      properties: {
        direcao: DIRECAO,
        ponto: { type: "string", description: "Código ou nome do ponto de embarque (ex.: rodoviaria, busca)." },
        bairro: { type: "string", description: "Bairro, só para busca em casa." },
        endereco_embarque: { type: "string", description: "Rua ou cidade de onde ele sai, se disse." },
        desembarque: { type: "string", description: "Onde o cliente vai descer. Se não souber, pergunte antes." },
        quantidade: { type: "integer", description: "Número de passagens." },
      },
      required: ["direcao", "ponto", "desembarque", "quantidade"],
    },
  },
  {
    name: "ver_minhas_reservas",
    description:
      "Mostra as reservas ativas DESTE cliente (data, direção, ponto, quantidade, status, valor, pagamento) e se ele já está cadastrado. Use para 'minha reserva está confirmada?', 'já paguei?', cancelar/remarcar, ou antes de criar uma reserva para não duplicar.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "endereco_de_costume",
    description:
      "Devolve o endereço de costume DESTE cliente por sentido (ponto de embarque, bairro, rua/referência e desembarque que ele sempre usa — fixado pela equipe ou visto no histórico) e o sentido provável da próxima viagem. Use quando um cliente quiser passagem (principalmente se já viajou antes) para propor o pedido pronto em vez de perguntar tudo de novo. Não traz valor.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "onde_fica",
    description:
      "Diz onde fica um lugar de Pirapemas ou Cantanhede que o cliente citou para embarcar na Volta (rua, ponto de referência como bar, padaria, hospital, posto, 'casa de fulano', povoado): em qual cidade aparece, em quantas reservas e a rua que costuma vir junto. Use quando ele der só uma referência ou uma rua que existe nas duas cidades, para confirmar com ele. Não decide a cidade.",
    input_schema: {
      type: "object",
      properties: { lugar: { type: "string", description: "O endereço ou a referência como o cliente escreveu." } },
      required: ["lugar"],
    },
  },
  {
    name: "criar_reserva",
    description:
      "Cria a reserva do cliente no app. Só chame depois de: (1) ter todos os dados, (2) ter consultado a viagem (há vaga) e o valor, (3) ter mostrado o resumo ao cliente e ele ter dito sim (cliente_confirmou=true). O preço e a vaga são conferidos pelo sistema. Trajeto fora da área padrão vira 'pendente' para a equipe confirmar. Encomenda NÃO é criada aqui (use chamar_atendente).",
    input_schema: {
      type: "object",
      properties: {
        data: DATA,
        direcao: DIRECAO,
        ponto: { type: "string", description: "Código ou nome do ponto de embarque." },
        quantidade: { type: "integer" },
        nome_cliente: { type: "string", description: "Nome completo, obrigatório se o cliente ainda não está cadastrado (nunca use o nome do perfil do WhatsApp: pergunte)." },
        bairro: { type: "string", description: "Bairro (busca em casa)." },
        endereco_embarque: { type: "string", description: "Rua/ponto de referência onde buscar, ou detalhe do local de embarque." },
        desembarque: { type: "string", description: "Onde o cliente vai ficar/descer." },
        forma_pagamento: { type: "string", enum: ["dinheiro", "pix", "cartao"] },
        cliente_confirmou: { type: "boolean", description: "true só se o cliente confirmou o resumo com um sim claro nesta conversa." },
        telefone_passageiro: {
          type: "string",
          description: "Só se ele marca para OUTRA pessoa: o telefone do passageiro (do card '[contato compartilhado: …]' ou digitado).",
        },
        nome_passageiro: { type: "string", description: "Só se ele marca para OUTRA pessoa: o nome do passageiro." },
        cidade_confirmada: {
          type: "boolean",
          description: "Só depois de um CIDADE_A_CONFIRMAR: true se o cliente confirmou a cidade de embarque da Volta.",
        },
      },
      required: ["data", "direcao", "ponto", "quantidade", "desembarque", "cliente_confirmou"],
    },
  },
  {
    name: "remarcar_reserva",
    description:
      "Muda data, ponto de embarque ou local de desembarque de uma reserva DESTE cliente (use o reserva_id de ver_minhas_reservas). Só depois do 'sim' do cliente.",
    input_schema: {
      type: "object",
      properties: {
        reserva_id: { type: "string" },
        nova_data: DATA,
        novo_ponto: { type: "string", description: "Código ou nome do novo ponto de embarque." },
        novo_desembarque: { type: "string" },
        cliente_confirmou: { type: "boolean" },
      },
      required: ["reserva_id", "cliente_confirmou"],
    },
  },
  {
    name: "cancelar_reserva",
    description: "Cancela uma reserva DESTE cliente (use o reserva_id de ver_minhas_reservas). Só depois do 'sim' do cliente.",
    input_schema: {
      type: "object",
      properties: { reserva_id: { type: "string" }, cliente_confirmou: { type: "boolean" } },
      required: ["reserva_id", "cliente_confirmou"],
    },
  },
  {
    name: "entrar_na_lista_de_espera",
    description: "Coloca o cliente na lista de espera de uma viagem lotada (não ocupa vaga; a equipe avisa quando abrir).",
    input_schema: {
      type: "object",
      properties: {
        data: DATA,
        direcao: DIRECAO,
        quantidade: { type: "integer" },
        nome_cliente: { type: "string", description: "Se ainda não cadastrado." },
      },
      required: ["data", "direcao", "quantidade"],
    },
  },
  {
    name: "avisar_equipe",
    description:
      "Deixa um recado na aba Pendências para a equipe SEM tirar você da conversa (ex.: cliente pediu para ser avisado de desistência, informação que a equipe precisa conferir).",
    input_schema: {
      type: "object",
      properties: { assunto: { type: "string" }, detalhe: { type: "string" } },
      required: ["assunto", "detalhe"],
    },
  },
  {
    name: "chamar_atendente",
    description:
      "Passa a conversa para uma pessoa da equipe (você deixa de responder). Use para: encomenda/frete (reúna item, quem entrega e quem recebe, endereço — e NUNCA fale valor), reclamação, pedido de reembolso, negociação de preço, mais de 10 passagens, trajeto que você não sabe resolver, localização em tempo real da van que o app não mostra, ou quando o cliente pedir uma pessoa. Depois de chamar, avise o cliente em uma frase.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Em poucas palavras." },
        resumo_para_equipe: { type: "string", description: "O que já se sabe: quem é, o que quer, o que falta." },
      },
      required: ["motivo", "resumo_para_equipe"],
    },
  },
  {
    name: "nao_responder",
    description:
      "Use quando a última mensagem do cliente não pede resposta (só um 'ok', 'obrigado', 👍, uma figurinha ou o encerramento da conversa).",
    input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] },
  },
];

const semAcento = (s?: string | null) =>
  (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : null);

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// biome-ignore lint/suspicious/noExplicitAny: linhas do banco
type Linha = any;

async function clienteDaConversa(ctx: ContextoDoAgente): Promise<Linha | null> {
  if (!ctx.clienteCache) ctx.clienteCache = { valor: await whatsappService.identifyCustomer(ctx.telefone) };
  return ctx.clienteCache.valor;
}

async function reservasDoCliente(ctx: ContextoDoAgente, recarregar = false): Promise<Linha[]> {
  if (ctx.reservasCache && !recarregar) return ctx.reservasCache;
  const cliente = await clienteDaConversa(ctx);
  ctx.reservasCache = cliente ? ((await whatsappService.listCustomerReservations(cliente.id)) ?? []) : [];
  return ctx.reservasCache;
}

/** Acha o ponto por código ou nome (sem acento); devolve null se não existir naquela direção. */
export function acharPonto(pontos: Linha[], texto: unknown): Linha | null {
  const t = semAcento(String(texto ?? ""));
  if (!t) return null;
  return (
    pontos.find((p) => semAcento(p.code) === t) ??
    pontos.find((p) => semAcento(p.name) === t) ??
    pontos.find((p) => semAcento(p.name).includes(t) || t.includes(semAcento(p.name))) ??
    null
  );
}

const resumoDosPontos = (pontos: Linha[]) =>
  pontos.map((p) => ({ codigo: p.code, nome: p.name, horario: hhmm(p.base_time) }));

/**
 * Preço unitário de um ponto: tabela do ponto, ou do bairro na busca em casa. Em Outros, o
 * local citado pode ter preço próprio (aeroporto, issue #263) — nunca "retorno do aeroporto".
 */
async function precoUnitario(
  ponto: Linha,
  bairro: string | null,
  endereco: string | null = null,
): Promise<{ ok: true; preco: number } | { ok: false; erro: Record<string, unknown> }> {
  if (ponto.code === "outro") {
    const { data: locais } = await supabaseAdmin.from("boarding_spot_prices").select("local, price");
    const proprio = precoDoLocalDeOutros(endereco, locais ?? []);
    if (proprio != null) return { ok: true, preco: proprio };
  }
  if (ponto.price != null && Number(ponto.price) > 0) return { ok: true, preco: Number(ponto.price) };
  if (ponto.code === "busca") {
    if (!bairro && !endereco) {
      return { ok: false, erro: { codigo: "FALTA_BAIRRO", erro: "A busca em casa é cobrada por bairro: pergunte o bairro." } };
    }
    const { data } = await supabaseAdmin.from("neighborhood_pricing").select("neighborhood, price").order("neighborhood");
    let achado = bairro ? (bairroDaTabela(bairro, data ?? []) ?? bairroParecido(bairro, data ?? [])?.bairro ?? null) : null;
    if (!achado) {
      // condomínio/residencial fora da tabela: memória de endereços e internet (issue #270)
      const deduzido = await resolverBairro([bairro, endereco].filter(Boolean).join(" "));
      if (deduzido) achado = (data ?? []).find((b: Linha) => b.neighborhood === deduzido.bairro) ?? null;
    }
    if (!achado) {
      return {
        ok: false,
        erro: {
          codigo: "BAIRRO_NAO_ATENDIDO",
          erro: bairro
            ? `O bairro "${bairro}" não está na tabela de busca em casa. Se for um bairro da lista com outro nome, use o nome exato; senão chame o atendente.`
            : "Não deu para saber o bairro pelo endereço: pergunte o bairro.",
          bairros_da_tabela: (data ?? []).map((b: Linha) => b.neighborhood),
        },
      };
    }
    return { ok: true, preco: Number(achado.price) };
  }
  return {
    ok: false,
    erro: { codigo: "SEM_PRECO_NA_TABELA", erro: "Este ponto não tem preço na tabela do sistema. Chame o atendente para combinar o valor." },
  };
}

/** O valor por passagem deste pedido: compara onde sobe e onde desce e só então cai na tabela do ponto/bairro. */
export async function valorDoPedido(
  ponto: Linha,
  pedido: { bairro: string | null; endereco: string | null; desembarque: string },
): Promise<{ ok: true; preco: number; trecho?: string } | { ok: false; erro: Record<string, unknown> }> {
  const { data: trechos } = await supabaseAdmin.from("route_fares").select("origem, destino, price");
  const trecho = trechoDoPedido([ponto.name, ponto.code, pedido.bairro, pedido.endereco], pedido.desembarque, trechos ?? []);
  if (trecho) return { ok: true, preco: Number(trecho.price), trecho: `${trecho.origem} a ${trecho.destino}` };

  const cidade = await whatsappService.mencionaCidadeIntermediaria([pedido.desembarque, pedido.endereco, pedido.bairro]);
  if (cidade) {
    return {
      ok: false,
      erro: {
        codigo: "TRECHO_SEM_VALOR",
        erro: `Não há valor cadastrado para esse trecho (${cidade}). Não diga valor: chame o atendente.`,
      },
    };
  }
  return precoUnitario(ponto, pedido.bairro, pedido.endereco);
}

async function consultarViagem(args: Linha) {
  const data = String(args.data ?? "");
  const direcao = String(args.direcao ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || (direcao !== "ida" && direcao !== "volta")) {
    return { ok: false, erro: "informe data (AAAA-MM-DD) e direcao (ida ou volta)" };
  }
  const disp = await whatsappService.checkAvailability(data, direcao);
  const { data: viagem } = await supabaseAdmin
    .from("trips")
    .select("status, started_at, finished_at")
    .eq("trip_date", data)
    .eq("direction", direcao)
    .is("deleted_at", null)
    .maybeSingle();
  return {
    ok: true,
    data,
    direcao,
    viagem_cadastrada: !!disp.trip_id,
    capacidade: disp.capacity,
    passageiros_confirmados: disp.occupied,
    vagas_disponiveis: disp.available,
    passagens_extras_fora_das_vagas: disp.extras ?? 0,
    // a equipe quase nunca marca a saída no app: "agendada" não quer dizer que a van não saiu
    status_no_app: viagem?.started_at || viagem?.finished_at ? viagem.status : "sem_registro",
    saiu_as: viagem?.started_at ? fmtHora.format(new Date(viagem.started_at)) : null,
    chegou_as: viagem?.finished_at ? fmtHora.format(new Date(viagem.finished_at)) : null,
  };
}

async function andamentoDaViagem(args: Linha, ctx: ContextoDoAgente) {
  const agora = new Date();
  ctx.consultouReservas = true;
  const cliente = await clienteDaConversa(ctx);
  const reservas = cliente ? await reservasDoCliente(ctx, true) : [];
  const pedida = args.direcao === "ida" || args.direcao === "volta" ? args.direcao : null;
  const proximas = reservas
    .filter((r) => ["confirmada", "pendente"].includes(r.status) && (r.trip?.trip_date ?? "") >= ctx.hoje)
    .filter((r) => !pedida || r.trip?.direction === pedida)
    .sort((x, y) => String(x.trip?.trip_date).localeCompare(String(y.trip?.trip_date)));
  const reserva = proximas[0] ?? null;

  const { data: cfg } = await supabaseAdmin
    .from("settings")
    .select("key, value")
    .in("key", ["trip_schedule", "monday_adjustment", "driver_contact"]);
  const valor = (k: string) => cfg?.find((c: Linha) => c.key === k)?.value;
  const segunda = valor("monday_adjustment");
  const motorista = valor("driver_contact");

  const lugar = String(args.lugar ?? "").trim() || null;
  const direcao = reserva?.trip?.direction ?? pedida ?? (fmtHora.format(agora) < "11:00" ? "ida" : "volta");
  const estimativa = andamentoPeloHorario({
    cronograma: cronogramaValido(valor("trip_schedule")),
    direcao,
    data: reserva?.trip?.trip_date ?? ctx.hoje,
    agora,
    textos: reserva
      ? [reserva.pickup_detail, reserva.pickup_neighborhood, reserva.route_point?.name, reserva.route_point?.code, lugar]
      : [lugar],
    ajusteSegundaHoras: segunda?.active ? Number(segunda.hours) || 0 : 0,
  });
  return {
    ok: true,
    tem_reserva: !!reserva,
    reserva: reserva
      ? { data: reserva.trip?.trip_date, direcao: reserva.trip?.direction, ponto: reserva.route_point?.name ?? null, status: reserva.status }
      : null,
    direcao_suposta: !reserva && !pedida,
    ...estimativa,
    contato_do_motorista: motorista?.phone ? { nome: motorista.name ?? "motorista", telefone: motorista.phone } : null,
  };
}

async function listarPontosEPrecos(args: Linha) {
  const direcao = String(args.direcao ?? "");
  if (direcao !== "ida" && direcao !== "volta") return { ok: false, erro: "direcao deve ser ida ou volta" };
  const pontos = (await whatsappService.listRoutePoints(direcao)) ?? [];
  const { data: bairros } = await supabaseAdmin.from("neighborhood_pricing").select("neighborhood, price").order("neighborhood");
  const { data: cfg } = await supabaseAdmin.from("settings").select("key, value").in("key", ["monday_adjustment"]);
  const segunda = cfg?.find((c: Linha) => c.key === "monday_adjustment")?.value;
  return {
    ok: true,
    direcao,
    pontos: pontos
      .filter((p: Linha) => p.active !== false)
      .map((p: Linha) => ({
        codigo: p.code,
        nome: p.name,
        horario: hhmm(p.base_time),
        preco_por_passagem: p.price != null ? Number(p.price) : null,
        preco_depende_do_bairro: p.price == null && p.code === "busca",
        janela_de_embarque: p.boarding_window ?? null,
        pede_detalhe_do_local: !!p.requires_detail,
      })),
    busca_em_casa_por_bairro: direcao === "ida" ? (bairros ?? []).map((b: Linha) => ({ bairro: b.neighborhood, preco: Number(b.price) })) : undefined,
    ajuste_de_segunda_feira: segunda?.active ? `a ida sai ${segunda.hours} hora(s) mais cedo às segundas` : null,
  };
}

async function calcularValor(args: Linha) {
  const direcao = String(args.direcao ?? "");
  if (direcao !== "ida" && direcao !== "volta") return { ok: false, erro: "direcao deve ser ida ou volta" };
  const pontos = (await whatsappService.listRoutePoints(direcao)) ?? [];
  const ponto = acharPonto(pontos, args.ponto);
  if (!ponto) return { ok: false, codigo: "PONTO_NAO_EXISTE", erro: "Ponto de embarque desconhecido.", pontos_validos: resumoDosPontos(pontos) };
  const quantidade = Number(args.quantidade);
  if (!Number.isInteger(quantidade) || quantidade < 1) return { ok: false, erro: "quantidade deve ser um inteiro de 1 em diante" };
  const desembarque = String(args.desembarque ?? "").trim();
  if (!desembarque) return { ok: false, codigo: "FALTA_DESEMBARQUE", erro: "O valor depende de onde ele desce: pergunte antes de calcular." };
  const preco = await valorDoPedido(ponto, {
    bairro: String(args.bairro ?? "").trim() || null,
    endereco: String(args.endereco_embarque ?? "").trim() || null,
    desembarque,
  });
  if (!preco.ok) return { ok: false, ...preco.erro };
  return {
    ok: true,
    ponto: ponto.name,
    trecho: preco.trecho ?? null,
    preco_por_passagem: preco.preco,
    quantidade,
    total: calcularTotal(preco.preco, quantidade),
  };
}

async function verMinhasReservas(ctx: ContextoDoAgente) {
  ctx.consultouReservas = true;
  const cliente = await clienteDaConversa(ctx);
  if (!cliente) return { ok: true, cliente_cadastrado: false, reservas: [] };
  const reservas = await reservasDoCliente(ctx, true);
  const saida = [];
  for (const r of reservas.slice(0, 10)) {
    const pgtos = (await whatsappService.checkPaymentStatus(r.id).catch(() => [])) ?? [];
    saida.push({
      reserva_id: r.id,
      data: r.trip?.trip_date ?? null,
      direcao: r.trip?.direction ?? null,
      ponto: r.route_point?.name ?? null,
      quantidade: r.quantity,
      status: r.status,
      valor_total: r.total_price != null ? Number(r.total_price) : null,
      desembarque: r.dropoff_location ?? null,
      pagamento: pgtos[0] ? { forma: pgtos[0].method, status: pgtos[0].status, comprovante_recebido: !!pgtos[0].proof_received } : null,
    });
  }
  return { ok: true, cliente_cadastrado: true, nome_cadastrado: cliente.name, reservas: saida };
}

async function enderecoDeCostume(ctx: ContextoDoAgente) {
  const cliente = await clienteDaConversa(ctx);
  if (!cliente) return { ok: true, cliente_cadastrado: false, tem_endereco_de_costume: false };
  const { data, error } = await supabaseAdmin.rpc("rpc_endereco_de_costume", { p_customer_id: cliente.id });
  if (error || !data?.success) throw new Error(`rpc_endereco_de_costume: ${error?.message ?? data?.message}`);
  return costumeParaFerramenta(data);
}

async function criarReserva(args: Linha, ctx: ContextoDoAgente) {
  const valido = validarPedidoDeReserva(args, ctx.hoje);
  if (!valido.ok) return { ok: false, codigo: "PEDIDO_INCOMPLETO", problemas: valido.erros };
  const pedido: PedidoValidado = valido.pedido;

  const pontos = (await whatsappService.listRoutePoints(pedido.direcao)) ?? [];
  const ponto = acharPonto(pontos, pedido.ponto);
  if (!ponto) return { ok: false, codigo: "PONTO_NAO_EXISTE", erro: "Ponto de embarque desconhecido.", pontos_validos: resumoDosPontos(pontos) };

  // Volta: o lugar citado (rua, referência, casa) só é conhecido na outra cidade? confirma com o cliente (issue #274)
  if (pedido.direcao === "volta" && pedido.enderecoEmbarque && args.cidade_confirmada !== true) {
    const outra = lugarDeOutraCidade(await lugaresNasCidades(pedido.enderecoEmbarque), String(ponto.code));
    if (outra) {
      const junto = outra.junto ? ` (junto da ${outra.junto})` : "";
      return {
        ok: false,
        codigo: "CIDADE_A_CONFIRMAR",
        erro: `${outra.nome}, que conhecemos, fica em ${outra.cidade}${junto}. Pergunte ao cliente se o embarque é mesmo em ${ponto.name}; se ele confirmar, chame de novo com cidade_confirmada=true (senão troque o ponto).`,
      };
    }
  }

  // marcando para outra pessoa (issue #268): a reserva vai para o passageiro, não para quem conversa
  const telPassageiro = telefoneDoPassageiro(args.telefone_passageiro);
  const outro = !!telPassageiro && !variantesTelefone(ctx.telefone).includes(telPassageiro);
  const cliente = outro ? await whatsappService.identifyCustomer(telPassageiro as string) : await clienteDaConversa(ctx);
  const nome = cliente?.name ?? (outro ? String(args.nome_passageiro ?? "").trim() || null : pedido.nomeCliente);
  if (!nome) return { ok: false, codigo: "FALTA_NOME", erro: "Pergunte o nome completo do passageiro antes de reservar." };

  const preco = await valorDoPedido(ponto, {
    bairro: pedido.bairro,
    endereco: pedido.enderecoEmbarque,
    desembarque: pedido.desembarque,
  });
  if (!preco.ok) return { ok: false, ...preco.erro };

  const disp = await whatsappService.checkAvailability(pedido.data, pedido.direcao);
  if (disp.available != null && disp.available < pedido.quantidade) {
    return {
      ok: false,
      codigo: "SEM_VAGAS",
      erro: "Não há vagas suficientes nessa viagem.",
      vagas_disponiveis: Math.max(0, disp.available),
      sugestao: "Ofereça outra data ou a lista de espera (entrar_na_lista_de_espera).",
    };
  }

  // o bot é isento da checagem de duplicidade do banco (é idempotente por mensagem),
  // então a checagem do cliente com ele mesmo é feita aqui
  const existentes = outro
    ? (cliente ? ((await whatsappService.listCustomerReservations(cliente.id)) ?? []) : [])
    : await reservasDoCliente(ctx, true);
  const duplicada = existentes.find(
    (r) => r.trip?.trip_date === pedido.data && r.trip?.direction === pedido.direcao && ["confirmada", "pendente"].includes(r.status),
  );
  if (duplicada) {
    return {
      ok: false,
      codigo: "JA_TEM_RESERVA",
      erro: "O cliente já tem reserva ativa nessa viagem. Mostre a que existe e pergunte se quer remarcar, aumentar ou manter.",
      reserva_existente: { reserva_id: duplicada.id, quantidade: duplicada.quantity, status: duplicada.status, ponto: duplicada.route_point?.name ?? null },
    };
  }

  const cidadeFora = await whatsappService.mencionaCidadeIntermediaria([pedido.desembarque, pedido.enderecoEmbarque, pedido.bairro]);
  // "Outros" reúne locais de São Luís (BR, Posto Carone, aeroporto…): só cidade fora da área deixa pendente (#261)
  const fora = !!cidadeFora;
  const motivoPendente = fora
    ? `Trajeto fora da área padrão${cidadeFora ? ` (menciona "${cidadeFora}")` : ""} — aguardando confirmação manual.`
    : null;

  // o texto do desembarque que bate com um local cadastrado também vai como "área" (rota do motorista)
  const areas = await whatsappService.listDropoffAreas(pedido.direcao).catch(() => []);
  const dropoffArea = areaDoDesembarque(pedido.desembarque, areas);

  try {
    const r = await whatsappService.createReservation(ctx.conversationId, {
      tripDate: pedido.data,
      direction: pedido.direcao,
      customerName: nome,
      customerPhone: outro ? telPassageiro : ctx.telefone,
      routePointCode: ponto.code,
      quantity: pedido.quantidade,
      unitPrice: preco.preco,
      paymentMethod: pedido.formaPagamento,
      pickupNeighborhood: pedido.bairro,
      pickupDetail: pedido.enderecoEmbarque,
      dropoffLocation: pedido.desembarque,
      dropoffArea,
      status: fora ? "pendente" : "confirmada",
      pendingReason: motivoPendente,
      waMessageId: `cw-${ctx.mensagemId}-agente`,
    });
    ctx.escrita.criou = true;
    ctx.reservasCache = undefined;
    // nome completo dado pelo cliente completa o cadastro que tinha só um nome/apelido
    if (!outro && cliente && nomeDeveSerCompletado(cliente.name, pedido.nomeCliente)) {
      await whatsappService
        .completarNomeDoCliente(r.reservation_id, cliente.id, pedido.nomeCliente as string)
        .catch((e) => console.error("Falha ao completar o nome do cliente:", String(e).slice(0, 200)));
    }
    if (r.status === "pendente") {
      await whatsappService.enqueueAreaReviewAlert(r.reservation_id, {
        motivo: motivoPendente,
        cidade: cidadeFora,
        dropoff: pedido.desembarque,
        pickup_detail: pedido.enderecoEmbarque,
        telefone: ctx.telefone,
      });
    }
    const pix = pedido.formaPagamento === "pix" ? await whatsappService.getPix() : null;
    return {
      ok: true,
      situacao: r.status === "pendente" ? "pendente (fora da área padrão; a equipe confirma e avisa)" : "confirmada",
      data: pedido.data,
      direcao: pedido.direcao,
      ponto: ponto.name,
      quantidade: pedido.quantidade,
      preco_por_passagem: preco.preco,
      total: calcularTotal(preco.preco, pedido.quantidade),
      forma_pagamento: pedido.formaPagamento,
      chave_pix: pix ? { chave: pix.key, titular: pix.name ?? null } : null,
      lembrete: pix ? "Se pagar por Pix, o cliente envia o comprovante aqui mesmo." : null,
      simulado: getBotContext()?.shadow === true,
    };
  } catch (err) {
    if (err instanceof WhatsappServiceError && err.code === "RESERVATION_REJECTED") {
      return { ok: false, codigo: "RECUSADA_PELO_SISTEMA", erro: err.message };
    }
    throw err;
  }
}

async function acharReservaDoCliente(ctx: ContextoDoAgente, id: unknown): Promise<Linha | null> {
  const reservas = await reservasDoCliente(ctx, true);
  return reservas.find((r) => r.id === String(id ?? "")) ?? null;
}

async function remarcarReserva(args: Linha, ctx: ContextoDoAgente) {
  if (args.cliente_confirmou !== true) return { ok: false, codigo: "FALTA_CONFIRMACAO", erro: "O cliente ainda não confirmou a mudança." };
  const reserva = await acharReservaDoCliente(ctx, args.reserva_id);
  if (!reserva) return { ok: false, codigo: "RESERVA_NAO_E_DESTE_CLIENTE", erro: "Reserva não encontrada entre as reservas ativas deste cliente." };
  const novaData = String(args.nova_data ?? "").trim();
  const novoPonto = String(args.novo_ponto ?? "").trim();
  const novoDesembarque = String(args.novo_desembarque ?? "").trim();
  if (!novaData && !novoPonto && !novoDesembarque) return { ok: false, erro: "Diga o que mudar: nova_data, novo_ponto ou novo_desembarque." };
  if (novaData && (!/^\d{4}-\d{2}-\d{2}$/.test(novaData) || novaData < ctx.hoje)) return { ok: false, erro: "nova_data inválida ou já passou" };

  try {
    if (novaData || novoPonto) {
      const direcao = reserva.trip?.direction;
      const pontos = (await whatsappService.listRoutePoints(direcao)) ?? [];
      const ponto = novoPonto ? acharPonto(pontos, novoPonto) : acharPonto(pontos, reserva.route_point?.code);
      if (!ponto) return { ok: false, codigo: "PONTO_NAO_EXISTE", erro: "Ponto de embarque desconhecido.", pontos_validos: resumoDosPontos(pontos) };
      await whatsappService.moveReservation(ctx.conversationId, reserva.id, {
        tripDate: novaData || reserva.trip?.trip_date,
        direction: direcao,
        routePointCode: ponto.code,
      });
    }
    if (novoDesembarque) await whatsappService.setDropoffLocation(ctx.conversationId, reserva.id, novoDesembarque);
    ctx.escrita.alterou = true;
    ctx.reservasCache = undefined;
    return { ok: true, remarcada: true, simulado: getBotContext()?.shadow === true };
  } catch (err) {
    if (err instanceof WhatsappServiceError && err.code === "MOVE_REJECTED") return { ok: false, codigo: "SEM_VAGA_NO_DESTINO", erro: err.message };
    throw err;
  }
}

async function cancelarReserva(args: Linha, ctx: ContextoDoAgente) {
  if (args.cliente_confirmou !== true) return { ok: false, codigo: "FALTA_CONFIRMACAO", erro: "O cliente ainda não confirmou o cancelamento." };
  const reserva = await acharReservaDoCliente(ctx, args.reserva_id);
  if (!reserva) return { ok: false, codigo: "RESERVA_NAO_E_DESTE_CLIENTE", erro: "Reserva não encontrada entre as reservas ativas deste cliente." };
  await whatsappService.cancelReservation(ctx.conversationId, reserva.id);
  ctx.escrita.cancelou = true;
  ctx.reservasCache = undefined;
  return { ok: true, cancelada: true, simulado: getBotContext()?.shadow === true };
}

async function entrarNaListaDeEspera(args: Linha, ctx: ContextoDoAgente) {
  const data = String(args.data ?? "");
  const direcao = String(args.direcao ?? "");
  const quantidade = Number(args.quantidade);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data < ctx.hoje) return { ok: false, erro: "data inválida ou já passou" };
  if (direcao !== "ida" && direcao !== "volta") return { ok: false, erro: "direcao deve ser ida ou volta" };
  if (!Number.isInteger(quantidade) || quantidade < 1) return { ok: false, erro: "quantidade inválida" };
  const cliente = await clienteDaConversa(ctx);
  const nome = cliente?.name ?? String(args.nome_cliente ?? "").trim();
  if (!nome) return { ok: false, codigo: "FALTA_NOME", erro: "Cliente novo: pergunte o nome completo." };
  await whatsappService.createReservation(ctx.conversationId, {
    tripDate: data,
    direction: direcao,
    customerName: nome,
    customerPhone: ctx.telefone,
    routePointCode: null,
    quantity: quantidade,
    unitPrice: 0,
    status: "espera",
    waMessageId: `cw-${ctx.mensagemId}-espera`,
  });
  ctx.escrita.esperou = true;
  ctx.reservasCache = undefined;
  return { ok: true, na_lista_de_espera: true, simulado: getBotContext()?.shadow === true };
}

/** Executa uma ferramenta; erro inesperado vira resultado (o modelo explica ao cliente ou chama a equipe). */
export async function executarFerramenta(nome: string, args: Linha, ctx: ContextoDoAgente): Promise<unknown> {
  try {
    switch (nome) {
      case "consultar_viagem":
        return await consultarViagem(args);
      case "andamento_da_viagem":
        return await andamentoDaViagem(args, ctx);
      case "listar_pontos_e_precos":
        return await listarPontosEPrecos(args);
      case "calcular_valor":
        return await calcularValor(args);
      case "ver_minhas_reservas":
        return await verMinhasReservas(ctx);
      case "endereco_de_costume":
        return await enderecoDeCostume(ctx);
      case "onde_fica":
        return await ondeFica(args);
      case "criar_reserva":
        return await criarReserva(args, ctx);
      case "remarcar_reserva":
        return await remarcarReserva(args, ctx);
      case "cancelar_reserva":
        return await cancelarReserva(args, ctx);
      case "entrar_na_lista_de_espera":
        return await entrarNaListaDeEspera(args, ctx);
      case "avisar_equipe":
        await whatsappService.avisarEquipe(ctx.conversationId, `${String(args.assunto ?? "").trim()}: ${String(args.detalhe ?? "").trim()}`);
        return { ok: true, equipe_avisada: true };
      case "chamar_atendente":
        await whatsappService.transferToHuman(
          ctx.conversationId,
          `${String(args.motivo ?? "").trim()} — ${String(args.resumo_para_equipe ?? "").trim()}`.slice(0, 900),
        );
        ctx.transferiu = true;
        return { ok: true, transferido: true, proximo_passo: "Avise o cliente, em uma frase, que a equipe vai assumir." };
      case "nao_responder":
        ctx.silencio = true;
        return { ok: true };
      default:
        return { ok: false, erro: `ferramenta desconhecida: ${nome}` };
    }
  } catch (err) {
    if (err instanceof WhatsappServiceError && err.code === "HUMAN_MODE_ACTIVE") {
      ctx.parar = true;
      return { ok: false, codigo: "ATENDIMENTO_HUMANO", erro: "A conversa já está com a equipe." };
    }
    console.error(JSON.stringify({ evento: "bot_agente_ferramenta_erro", ferramenta: nome, erro: String(err).slice(0, 300) }));
    return { ok: false, codigo: "ERRO_NO_SISTEMA", erro: "Falha ao consultar/gravar no sistema. Não invente: chame o atendente se for preciso." };
  }
}

/**
 * Em que cidade(s) aparece cada lugar citado (rua, ponto de referência, casa de alguém,
 * povoado) e com o que ele anda junto. Base que aprende com as reservas (issue #274). Melhor esforço.
 */
export async function lugaresNasCidades(texto: string | null | undefined): Promise<LugarNasCidades[]> {
  if (!texto || String(texto).trim().length < 3) return [];
  const { data, error } = await supabaseAdmin.rpc("fn_lugares_no_texto", { p_texto: String(texto).slice(0, 300) });
  if (error) {
    console.log(JSON.stringify({ evento: "bot_aviso", aviso: "lugares_nao_consultados", erro: error.message.slice(0, 200) }));
    return [];
  }
  return (data ?? []) as LugarNasCidades[];
}

/** Ferramenta onde_fica: o que a base sabe sobre um lugar de Pirapemas/Cantanhede. */
async function ondeFica(args: Linha) {
  const lugares = await lugaresNasCidades(String(args.lugar ?? ""));
  if (!lugares.length) {
    return { ok: true, conhecido: false, dica: "Não conhecemos esse lugar: pergunte a cidade (Pirapemas ou Cantanhede) e a rua." };
  }
  return {
    ok: true,
    conhecido: true,
    lugares: lugares.map((l) => ({
      nome: l.nome,
      tipo: l.tipo,
      cidades: [l.em_pirapemas ? "Pirapemas" : null, l.em_cantanhede ? "Cantanhede" : null].filter(Boolean),
      reservas: { pirapemas: l.reservas_pirapemas, cantanhede: l.reservas_cantanhede },
      junto: { pirapemas: l.junto_pirapemas ?? null, cantanhede: l.junto_cantanhede ?? null },
    })),
    lembrete: "Use para CONFIRMAR com o cliente (ex.: 'É a choperia do Riba, na Lister Caldas, em Pirapemas?'); a cidade só vale quando ele confirmar.",
  };
}
