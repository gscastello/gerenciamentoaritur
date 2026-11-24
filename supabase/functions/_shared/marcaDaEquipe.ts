// supabase/functions/_shared/marcaDaEquipe.ts
//
// "Agendado ☑️ seg Ida Estiva 2P" (issue #420) — regras PURAS, sem rede.
// O que a EQUIPE escreve junto da marca é a verdade e vence a leitura do bot: dia, sentido,
// quantidade, ponto/local, bairro e cidade da Volta. A marca sozinha ("Agendado ☑️") continua
// funcionando como antes (nada aqui muda o pedido).

import { cidadeDaVolta, localDeOutros, type PedidoExtraido } from "./rascunhoPuro.ts";
import { bairroEscrito, datasEscritas, pontoEscrito, sentidoEscrito } from "./pedidoDoCliente.ts";
import { normalizarTexto } from "./grafia.ts";

export type DadosDaMarca = {
  data?: string;
  direcao?: "ida" | "volta";
  quantidade?: number;
  ponto?: string;
  bairro?: string;
  cidade?: "pirapemas" | "cantanhede";
  local?: string;
};

/** O texto da marca sem a palavra "agendado" e sem o ☑️. */
function semAMarca(texto: string): string {
  return String(texto ?? "")
    .replace(/agendad[oa]s?/gi, " ")
    .replace(/[☑✅✔️]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lê os dados que a equipe escreveu na marca. `em` = quando a marca foi escrita (para "amanhã",
 * "seg"). Só devolve o que está escrito; nada escrito = objeto vazio.
 */
export function dadosDaMarca(
  texto: string,
  em: string,
  ctx: { pontosIda: string[]; bairros: { neighborhood: string }[]; locaisDeOutros: string[] },
): DadosDaMarca {
  const resto = semAMarca(texto);
  if (!resto) return {};
  // abreviações da equipe: "seg", "ter", "qua", "qui", "sex", "sab", "dom"
  const ABREV: Record<string, string> = {
    seg: "segunda", ter: "terca", qua: "quarta", qui: "quinta", sex: "sexta", sab: "sabado", dom: "domingo",
  };
  const n = normalizarTexto(resto)
    .split(" ")
    .map((p) => ABREV[p] ?? p)
    .join(" ");
  const out: DadosDaMarca = {};
  // o texto original guarda "17/11" (a normalização tira a barra); o normalizado traz "seg" → segunda
  const datas = datasEscritas([{ texto: `${resto} ${n}`, em }]);
  if (datas.length === 1) out.data = datas[0];
  const sentido = sentidoEscrito([n]);
  if (sentido) out.direcao = sentido;
  const q = n.match(/(?:^| )(\d{1,2}) ?(?:p|pax|passage(?:m|ns)|pessoas?|vagas?)(?: |$)/);
  if (q && Number(q[1]) >= 1 && Number(q[1]) <= 31) out.quantidade = Number(q[1]);
  const local = localDeOutros([n], ctx.locaisDeOutros);
  if (local) {
    out.ponto = "outro";
    out.local = local;
  } else {
    const ponto = pontoEscrito([n], ctx.pontosIda);
    if (ponto) out.ponto = ponto;
  }
  const bairro = bairroEscrito([n], ctx.bairros);
  if (bairro && !local) out.bairro = bairro.neighborhood;
  const cidade = cidadeDaVolta(n);
  if (cidade) out.cidade = cidade;
  return out;
}

/**
 * Aplica os dados da marca aos pedidos lidos (issue #420). A equipe vence: com um pedido só, o que
 * ela escreveu substitui o lido; com vários, vale para o pedido daquele dia/sentido. Sem pedido
 * lido e com dia + sentido na marca, monta o pedido pela marca (o embarque fica a confirmar).
 */
export function aplicarDadosDaMarca<P extends PedidoExtraido>(pedidos: P[], d: DadosDaMarca): P[] {
  if (!Object.keys(d).length) return pedidos;
  const aviso = "Dados escritos pela equipe na marca do Agendado.";
  const aplicar = (p: P): P => {
    const novo: P = { ...p };
    if (d.data) novo.data = d.data;
    if (d.direcao) novo.direcao = d.direcao;
    if (d.quantidade) novo.quantidade = d.quantidade;
    const direcao = novo.direcao;
    if (d.ponto === "outro" && d.local) {
      novo.ponto = "outro";
      novo.bairro = null;
      novo.endereco = `${d.local} (BR)`;
    } else if (d.ponto && direcao !== "volta") {
      novo.ponto = d.ponto;
      if (d.ponto !== "busca") novo.bairro = null;
    }
    if (d.bairro && direcao !== "volta") {
      novo.bairro = d.bairro;
      novo.ponto = "busca";
    }
    if (d.cidade && direcao === "volta") novo.cidade_dita = d.cidade;
    novo.duvida = [p.duvida, aviso].filter(Boolean).join(" ");
    return novo;
  };
  if (!pedidos.length) {
    if (!d.data || !d.direcao) return pedidos;
    return [aplicar({ tipo: "passagem", data: d.data, direcao: d.direcao, quantidade: d.quantidade ?? 1 } as P)];
  }
  if (pedidos.length === 1) return [aplicar(pedidos[0])];
  // vários pedidos: a marca vale para o do dia/sentido que ela cita
  const alvo = pedidos.findIndex((p) =>
    (!d.data || p.data === d.data) && (!d.direcao || p.direcao === d.direcao)
  );
  if (alvo === -1) return pedidos;
  return pedidos.map((p, i) => (i === alvo ? aplicar(p) : p));
}
