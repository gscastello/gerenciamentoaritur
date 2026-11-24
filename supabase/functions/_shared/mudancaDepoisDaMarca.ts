// supabase/functions/_shared/mudancaDepoisDaMarca.ts
//
// A reserva mudou DEPOIS do "Agendado ☑️" e depois de uma nova mensagem do cliente (issue #504, caso
// 8bfa7860: Rodoviária no Agendado, "É no retorno viu" depois, o revisor trocou). Quem mudou — o
// cliente (mudou de ideia) ou o bot (leu errado)? O bot decide sozinho pelo que o CLIENTE escreveu:
//
//   - antes da marca ele escreveu o valor que o bot gravou e depois escreveu o novo → MUDOU DE IDEIA:
//     o certo na hora do Agendado era o de antes;
//   - antes da marca ele já tinha escrito o valor que ficou no fim → ERRO DE LEITURA: o certo era o de agora;
//   - "na verdade", "mudei", "agora é" → mudou de ideia; "eu disse", "tá errado", "não é" → erro de leitura;
//   - sem prova no texto → INCERTO (fica para conferir; nunca chuta).
//
// Módulo PURO (sem rede): recebe os textos e os valores; quem busca no banco é o avaliar-bot.

import { normalizarTexto } from "./grafia.ts";
import {
  cidadeDoEnderecoEscrito,
  datasEscritas,
  type MensagemDoCliente,
  pontoEscrito,
  quantidadeEscrita,
  sentidoEscrito,
} from "./pedidoDoCliente.ts";

export type CampoDaReserva = "dia" | "sentido" | "ponto" | "quantidade";

export type QuemMudou = "mudou_de_ideia" | "erro_de_leitura" | "incerto";

/** O que o cliente escreveu sobre um campo, nas mensagens dadas (null = não escreveu ou escreveu dois valores). */
export function escritoPeloCliente(
  campo: CampoDaReserva,
  mensagens: MensagemDoCliente[],
  ctx: { direcao: "ida" | "volta"; pontosIda: string[] },
): string | number | null {
  const textos = mensagens.map((m) => m.texto);
  if (campo === "quantidade") return quantidadeEscrita(textos);
  if (campo === "sentido") return sentidoEscrito(textos);
  if (campo === "dia") {
    const dias = datasEscritas(mensagens);
    return dias.length === 1 ? dias[0] : null;
  }
  // ponto: na Ida, o lugar de São Luís; na Volta, a cidade do endereço (Pirapemas ou Cantanhede)
  return ctx.direcao === "ida" ? pontoEscrito(textos, ctx.pontosIda) : (cidadeDoEnderecoEscrito(textos)?.cidade ?? null);
}

const RE_MUDOU = / (na verdade|mudei|mudou|mudar|mudanca|troca|troquei|trocar|agora (e|vai ser|sera|vou)|vou (de|pelo|pela) outr|prefiro|melhor (no|na|pra|para|o|a)|nao vou mais|desisti d) /;
const RE_ERRO = / (errad\w*|eu disse|eu falei|falei que|eu tinha dito|ja tinha (dito|falado)|nao e (no|na|o|a|pra|para)|nao foi (isso|o que)|nao pedi|voce anotou|vc anotou) /;

/**
 * Quem mudou o campo depois da marca. `antes` é o que estava na reserva na hora do Agendado, `depois` o que
 * ficou; `antesDaMarca` são as mensagens do cliente até a marca e `depoisDaMarca` as que vieram depois, até a
 * mudança. Comparação de texto sem acento e sem caixa.
 */
export function quemMudou(c: {
  campo: CampoDaReserva;
  antes: string | number | null;
  depois: string | number | null;
  antesDaMarca: MensagemDoCliente[];
  depoisDaMarca: MensagemDoCliente[];
  direcao: "ida" | "volta";
  pontosIda: string[];
}): QuemMudou {
  const igual = (a: unknown, b: unknown) => a != null && b != null && normalizarTexto(String(a)) === normalizarTexto(String(b));
  const ctx = { direcao: c.direcao, pontosIda: c.pontosIda };
  const escritoAntes = escritoPeloCliente(c.campo, c.antesDaMarca, ctx);
  const escritoDepois = escritoPeloCliente(c.campo, c.depoisDaMarca, ctx);
  // antes da marca ele já tinha escrito o valor que ficou: o bot leu errado
  if (igual(escritoAntes, c.depois) && !igual(escritoAntes, c.antes)) return "erro_de_leitura";
  // escreveu um valor antes e o outro depois: mudou de ideia
  if (igual(escritoAntes, c.antes) && igual(escritoDepois, c.depois)) return "mudou_de_ideia";
  // sem o valor escrito dos dois lados, as palavras dele dizem
  const n = ` ${normalizarTexto(c.depoisDaMarca.map((m) => m.texto).join(" "))} `;
  const erro = RE_ERRO.test(n);
  const mudou = RE_MUDOU.test(n);
  if (erro && !mudou) return "erro_de_leitura";
  // "mudou de ideia" só com o valor novo escrito depois: sem isso, a mudança pode ser de outro campo
  if (mudou && !erro && igual(escritoDepois, c.depois)) return "mudou_de_ideia";
  return "incerto";
}

export type MudancaDoCampo = {
  reservation_id: string;
  campo: CampoDaReserva;
  antes: string | number | null;
  depois: string | number | null;
  quem: QuemMudou;
};

const CAMPO_DO_CASO: Record<CampoDaReserva, string> = {
  dia: "trip_date",
  sentido: "direction",
  ponto: "route_point_code",
  quantidade: "quantity",
};

/**
 * O esperado da hora do Agendado: onde o CLIENTE mudou de ideia depois, volta o valor de antes; erro de
 * leitura fica como está (o de agora é o certo); incerto não mexe e volta na lista `incertos`.
 */
export function esperadoNaHoraDaMarca<T extends { reservation_id?: string } & Record<string, unknown>>(
  esperado: T[],
  mudancas: MudancaDoCampo[],
): { esperado: T[]; ajustes: string[]; incertos: string[] } {
  const ajustes: string[] = [];
  const incertos: string[] = [];
  const saida = esperado.map((e) => {
    const novo: Record<string, unknown> = { ...e };
    for (const m of mudancas.filter((x) => x.reservation_id === e.reservation_id)) {
      const chave = CAMPO_DO_CASO[m.campo];
      if (m.quem === "mudou_de_ideia") {
        novo[chave] = m.antes;
        ajustes.push(`${m.campo}: ${m.depois} → ${m.antes} (o cliente mudou depois do Agendado)`);
      } else if (m.quem === "incerto") {
        incertos.push(`${m.campo}: ${m.antes} → ${m.depois}`);
      }
    }
    return novo as T;
  });
  return { esperado: saida, ajustes, incertos };
}
