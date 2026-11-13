// supabase/functions/_shared/comprovantePuro.ts
//
// Comprovante Pix mandado no WhatsApp (issue #363). Módulo PURO: o que se pede
// ao modelo, a conferência do que ele leu e a decisão. A baixa só acontece quando
// TUDO bate: é comprovante, quem recebeu é a empresa, a data é recente e o valor
// é exatamente o de reserva(s) do cliente que ainda não estão pagas. Qualquer
// dúvida vira pendência para a equipe — nunca baixa por aproximação. O banco
// (rpc_baixa_por_comprovante) confere valor e comprovante repetido de novo.

import { normalizarTexto } from "./grafia.ts";

export type LeituraDoComprovante = {
  eh_comprovante: boolean;
  valor: number | null;
  data: string | null; // YYYY-MM-DD
  pagador: string | null;
  recebedor: string | null;
  chave_recebedor: string | null;
  instituicao: string | null;
  txid: string | null;
};

export type ReservaParaBaixa = {
  id: string;
  data: string; // YYYY-MM-DD da viagem
  direcao: "ida" | "volta";
  total: number;
  pago: boolean;
  status: string;
};

export type DecisaoDoComprovante =
  | { tipo: "nao_e_comprovante" }
  | { tipo: "baixa"; reservas: ReservaParaBaixa[] }
  | { tipo: "pendencia"; motivo: string };

export const FERRAMENTA_DO_COMPROVANTE = {
  name: "registrar_comprovante",
  description: "Registra o que está escrito no comprovante de Pix/transferência da imagem.",
  input_schema: {
    type: "object",
    properties: {
      eh_comprovante: { type: "boolean", description: "true só se a imagem é um comprovante de Pix ou transferência CONCLUÍDA." },
      valor: { type: "number", description: "Valor transferido, em reais (ex.: 160)." },
      data: { type: "string", description: "Data da transferência, AAAA-MM-DD." },
      pagador: { type: "string", description: "Nome de quem pagou (origem)." },
      recebedor: { type: "string", description: "Nome de quem recebeu (destino)." },
      chave_recebedor: { type: "string", description: "Chave Pix ou documento do destino, como aparece (pode estar mascarado)." },
      instituicao: { type: "string", description: "Banco/instituição do destino." },
      txid: { type: "string", description: "ID da transação / autenticação (E2E), se aparecer." },
    },
    required: ["eh_comprovante"],
  },
} as const;

export function instrucoesDoComprovante(hoje: string): string {
  return `Você lê imagens que clientes mandam no WhatsApp de uma empresa de vans e registra, chamando registrar_comprovante, se é um comprovante de Pix/transferência e o que está escrito nele.
- Só o que está ESCRITO. Não invente: campo que não aparece fica vazio.
- Foto de pessoa, documento, bagagem, print de conversa, Pix agendado ou não concluído: eh_comprovante=false.
- Números brasileiros: "1.234,56" é 1234.56. Data em AAAA-MM-DD; hoje é ${hoje}.`;
}

const texto = (v: unknown, max = 120): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[R$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Confere e limpa a leitura bruta do modelo. */
export function normalizarComprovante(b: Record<string, unknown> | null | undefined, hoje: string): LeituraDoComprovante {
  const x = b ?? {};
  const v = numero(x.valor);
  const valor = v != null && v > 0 && v < 100000 ? Math.round(v * 100) / 100 : null;
  const d = String(x.data ?? "").trim();
  let data: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const t = Date.parse(`${d}T12:00:00Z`);
    const dias = (t - Date.parse(`${hoje}T12:00:00Z`)) / 86400000;
    if (!Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d && dias <= 1 && dias >= -400) data = d;
  }
  return {
    eh_comprovante: x.eh_comprovante === true,
    valor,
    data,
    pagador: texto(x.pagador),
    recebedor: texto(x.recebedor),
    chave_recebedor: texto(x.chave_recebedor, 80),
    instituicao: texto(x.instituicao, 80),
    txid: texto(x.txid, 64)?.replace(/\s/g, "") || null,
  };
}

// palavras que não identificam a empresa ("A O Castelo Transporte e Turismo" → "castelo")
const GENERICAS = new Set(["a", "o", "e", "de", "da", "do", "das", "dos", "ltda", "me", "mei", "eireli", "sa", "transporte", "transportes", "turismo", "viagens", "servicos"]);

/** Palavras que identificam a empresa no nome do recebedor. */
export function palavrasDaEmpresa(nome: string | null | undefined): string[] {
  return normalizarTexto(String(nome ?? "")).split(/\s+/).filter((p) => p.length >= 3 && !GENERICAS.has(p));
}

const digitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

/** Quem recebeu é a empresa? Pelo nome (palavra própria, ex.: "castelo") ou pela chave Pix. */
export function recebedorEhAEmpresa(l: LeituraDoComprovante, pix: { key?: string | null; name?: string | null }): boolean {
  const nome = ` ${normalizarTexto(l.recebedor ?? "")} `;
  const palavras = palavrasDaEmpresa(pix.name);
  if (palavras.length && palavras.every((p) => nome.includes(` ${p} `))) return true;
  const chave = digitos(pix.key);
  const lida = digitos(l.chave_recebedor);
  // a chave inteira; ou o final dela quando o banco mascara o começo (***.012388)
  return chave.length >= 8 && lida.length >= 6 && (lida === chave || chave.endsWith(lida) || lida.endsWith(chave));
}

/**
 * Quais reservas o valor paga: uma com o valor exato (a viagem mais próxima, se
 * houver empate — o cliente costuma pagar a próxima), ou as próximas N em ordem
 * de data cuja soma é exatamente o valor (Ida + Volta). Sem par exato → nenhuma.
 */
export function reservasDoValor(valor: number, reservas: ReservaParaBaixa[], hoje: string): ReservaParaBaixa[] {
  const abertas = reservas
    .filter((r) => !r.pago && ["confirmada", "pendente", "embarcado"].includes(r.status) && r.total > 0)
    .sort((a, b) => a.data.localeCompare(b.data) || (a.direcao === "ida" ? -1 : 1));
  const igual = (n: number) => Math.abs(n - valor) < 0.01;
  const futuras = abertas.filter((r) => r.data >= hoje);
  const uma = futuras.find((r) => igual(r.total)) ?? abertas.find((r) => igual(r.total));
  if (uma) return [uma];
  let soma = 0;
  const juntas: ReservaParaBaixa[] = [];
  for (const r of abertas) {
    soma += r.total;
    juntas.push(r);
    if (igual(soma)) return juntas;
    if (soma > valor) break;
  }
  return [];
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

export function decidirComprovante(
  l: LeituraDoComprovante,
  ctx: { hoje: string; pix: { key?: string | null; name?: string | null }; reservas: ReservaParaBaixa[] | null },
): DecisaoDoComprovante {
  if (!l.eh_comprovante) return { tipo: "nao_e_comprovante" };
  if (l.valor == null) return { tipo: "pendencia", motivo: "Comprovante sem valor legível." };
  if (!recebedorEhAEmpresa(l, ctx.pix)) {
    return { tipo: "pendencia", motivo: `Comprovante de ${brl(l.valor)} para ${l.recebedor ?? "recebedor que não deu para ler"}: confira se foi para a empresa.` };
  }
  if (!l.data) return { tipo: "pendencia", motivo: `Comprovante de ${brl(l.valor)} sem data legível.` };
  const dias = (Date.parse(`${ctx.hoje}T12:00:00Z`) - Date.parse(`${l.data}T12:00:00Z`)) / 86400000;
  if (dias > 10) return { tipo: "pendencia", motivo: `Comprovante antigo (${l.data}) de ${brl(l.valor)}: pode ser de outra viagem.` };
  if (!ctx.reservas) return { tipo: "pendencia", motivo: `Comprovante de ${brl(l.valor)} de um número sem cadastro.` };
  const reservas = reservasDoValor(l.valor, ctx.reservas, ctx.hoje);
  if (!reservas.length) {
    return { tipo: "pendencia", motivo: `Comprovante de ${brl(l.valor)} não bate com nenhuma reserva em aberto do cliente.` };
  }
  return { tipo: "baixa", reservas };
}

/** Linha da nota privada para a equipe no Chatwoot. */
export function notaDaBaixa(l: LeituraDoComprovante, reservas: ReservaParaBaixa[]): string {
  const viagens = reservas.map((r) => `${r.direcao === "ida" ? "Ida" : "Volta"} ${r.data.slice(8, 10)}/${r.data.slice(5, 7)}`).join(", ");
  return `🧾 Comprovante conferido: ${brl(l.valor ?? 0)}${l.pagador ? ` de ${l.pagador}` : ""}. Marquei como pago: ${viagens}.`;
}
