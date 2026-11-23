// supabase/functions/_shared/sentinelaPura.ts
//
// Sentinela de pedido sem reserva (issue #461) — regras PURAS, sem rede.
//
// A sentinela simula o Agendado numa conversa com pedido de vaga ("se a equipe marcasse agora, o
// que seria lançado?"). O que sair para uma viagem próxima, que ainda não saiu, e sem reserva é um
// passageiro que pode ficar para trás. Antes de avisar, confere a conversa: a equipe disse que está
// lotado, ou o cliente disse que era só consulta / desistiu? Então não é pedido vivo.

import { ehMarcaDeAgendado, viagemDeHojeJaSaiu } from "./rascunhoPuro.ts";

/** Viagem lida pela simulação (formato de `simularAgendado().planejadas`). */
export type ViagemLida = {
  type?: string | null;
  trip_date?: string | null;
  direction?: string | null;
  quantity?: number | null;
  route_point_code?: string | null;
  pickup_neighborhood?: string | null;
};

export type PedidoSemReserva = { data: string; direcao: "ida" | "volta"; quantidade: number; tipo: string };

const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** As viagens pedidas de hoje até `dias` adiante que ainda não saíram. */
export function pedidosSemReserva(
  planejadas: ViagemLida[],
  ctx: { hoje: string; horaAgora: string; dias?: number },
): PedidoSemReserva[] {
  const limite = somarDias(ctx.hoje, ctx.dias ?? 3);
  const out: PedidoSemReserva[] = [];
  for (const p of planejadas ?? []) {
    const data = String(p.trip_date ?? "");
    const direcao = p.direction === "volta" ? "volta" : p.direction === "ida" ? "ida" : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !direcao) continue;
    if (data < ctx.hoje || data > limite) continue;
    if (data === ctx.hoje && viagemDeHojeJaSaiu(direcao, ctx.horaAgora)) continue;
    out.push({ data, direcao, quantidade: Math.max(1, Number(p.quantity ?? 1) || 1), tipo: p.type === "encomenda" ? "encomenda" : "passagem" });
  }
  return out;
}

const norm = (t: string) =>
  ` ${String(t ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;

const RE_PEDIDO_DE_VAGA = / (vagas?|passage[mn]s?|reserv\w*|agend\w*|guard\w*|marc\w*|viaj\w*|ir) /;
const RE_LOTADO = / (nao temos (mais )?vaga|nao tem (mais )?vaga|sem vaga|lotad[oa]|saiu lotad|ja esta lotad|nao ha (mais )?vaga|so (na|no|pra|para) (segunda|terca|quarta|quinta|sexta|sabado|domingo)) /;
const RE_SO_CONSULTA = / (era so (pra|para) (confirmar|saber|perguntar)|so (pra|para) (saber|confirmar)|so perguntando|so uma pergunta|desisti|nao vou mais|nao vou poder|vou nao|deixa (pra|para) (la|outra|depois)|cancela|cancelar|desmarca) /;

/**
 * A conversa já encerrou o pedido? Olha só o que veio DEPOIS do último pedido do cliente: a equipe
 * disse que está lotado, ou o cliente disse que era só consulta / desistiu. Devolve o motivo ou null.
 */
export function pedidoEncerrado(falas: { quem: string; texto: string; em: string }[]): string | null {
  const ordenadas = [...(falas ?? [])].sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
  // a partir da última fala do cliente que pede algo (ou da primeira, se nenhuma "pede")
  let inicio = 0;
  ordenadas.forEach((f, i) => {
    // palavra inteira OU começo de palavra ("passagens", "agendadas", "marcar"): antes só a exata valia e
    // o pedido novo depois de um "lotado" passava batido (issue #482)
    if (f.quem === "cliente" && RE_PEDIDO_DE_VAGA.test(norm(f.texto))) inicio = i;
  });
  for (const f of ordenadas.slice(inicio)) {
    const t = norm(f.texto);
    if (f.quem === "equipe" && RE_LOTADO.test(t)) return "a equipe disse que não há vaga";
    if (f.quem === "cliente" && RE_SO_CONSULTA.test(t)) return "o cliente disse que era só consulta ou desistiu";
  }
  return null;
}

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
function quando(data: string, hoje: string): string {
  const ddmm = `${data.slice(8, 10)}/${data.slice(5, 7)}`;
  if (data === hoje) return `hoje (${ddmm})`;
  if (data === somarDias(hoje, 1)) return `amanhã (${ddmm})`;
  return `${SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()]} (${ddmm})`;
}

/** "Ida de amanhã (19/11), 2 passagens; Volta de sexta (21/11)". */
export function resumoDosPedidos(pedidos: PedidoSemReserva[], hoje: string): string {
  return pedidos
    .map((p) => {
      const o = p.tipo === "encomenda" ? "Encomenda" : p.direcao === "ida" ? "Ida" : "Volta";
      const q = p.tipo !== "encomenda" && p.quantidade > 1 ? `, ${p.quantidade} passagens` : "";
      return `${o} de ${quando(p.data, hoje)}${q}`;
    })
    .join("; ");
}

/**
 * Nota privada no Chatwoot: só a equipe vê. Sem "agendado" nem ☑️/✅ (a nota não pode virar marca).
 */
export function notaDaSentinela(pedidos: PedidoSemReserva[], hoje: string, semDia: string | null = null): string {
  if (!pedidos.length && semDia) {
    return [
      "⚠️ PEDIDO SEM RESERVA: o cliente pediu para reservar e o dia (ou o sentido) não ficou claro.",
      `"${semDia}"`,
      "Pergunte o dia ao cliente e lance pela Agenda.",
    ].join("\n");
  }
  return [
    "⚠️ PEDIDO SEM RESERVA: o cliente pediu e ainda não está na Agenda.",
    resumoDosPedidos(pedidos, hoje) + ".",
    "Lance pela Agenda, ou responda o cliente se não houver vaga.",
  ].join("\n");
}

const RE_PEDIU_RESERVA =
  / (deix[ae] (ja )?(agendad[oa]|marcad[oa]|reservad[oa]|uma vaga|minha vaga|a vaga|uma passagem)|marc[ae] (pra|para|uma|minha|a)|reserv[ae] (pra|para|uma|minha)|guard[ae] (uma|minha|a) vaga|agend[ae] (pra|para|uma|minha|a)|quero (uma passagem|reservar|agendar|marcar)|vou querer (uma|a) (vaga|passagem)) /;

/**
 * Pedido de reserva com todas as letras DEPOIS do último "Agendado ☑️" (issue #461): "deixa
 * agendada já a volta pra mim", "marca uma vaga". Quando a simulação não achou o dia (ou o sentido),
 * é a equipe que pergunta — mas o pedido não pode morrer no "Ok". Pergunta ("tem passagem?") não
 * conta. Devolve o trecho do cliente, ou null.
 */
export function pedidoDeReservaSemDia(falas: { quem: string; texto: string; em: string }[]): string | null {
  const ordenadas = [...(falas ?? [])].sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
  let inicio = 0;
  ordenadas.forEach((f, i) => {
    if (f.quem === "equipe" && ehMarcaDeAgendado(f.texto)) inicio = i + 1;
  });
  for (const f of ordenadas.slice(inicio)) {
    if (f.quem === "cliente" && RE_PEDIU_RESERVA.test(norm(f.texto))) return String(f.texto).replace(/\s+/g, " ").trim().slice(0, 160);
  }
  return null;
}

const RE_ONDE_EMBARCA =
  / (rua|av|avenida|travessa|tv|praca|povoado|bairro|casa|condominio|residencial|perto|proximo|prox|frente|esquina|numero|quadra|bloco|apartamento|rodoviaria|retorno|posto|aguardo|espero|estarei) /;

/**
 * O pedido é de verdade (issue #467)? A equipe marcou "Agendado ☑️", ou o cliente pediu para
 * reservar com todas as letras ("deixa agendada", "marca uma vaga") ou escreveu onde embarca sem
 * ser em forma de pergunta ("aqui na rua da torre, casa azul"). Pergunta solta ("tem vaga amanhã?
 * qual o valor?") não é pedido: a sentinela não avisa.
 */
export function clienteConcretizou(falas: { quem: string; texto: string; em: string }[]): boolean {
  // Só é chamada quando a simulação achou viagem SEM reserva: a equipe ter marcado "Agendado ☑️" já
  // é o pedido confirmado (o Agendado que não lançou — issue #469). Por isso não corta na marca.
  return (falas ?? []).some((f) => {
    if (f.quem === "equipe") return ehMarcaDeAgendado(f.texto);
    if (f.quem !== "cliente") return false;
    const t = norm(f.texto);
    if (RE_PEDIU_RESERVA.test(t)) return true;
    return !String(f.texto).includes("?") && RE_ONDE_EMBARCA.test(t);
  });
}
