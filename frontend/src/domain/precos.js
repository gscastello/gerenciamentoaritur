// Precificação. Pontos de embarque têm valor fixo (padrão R$60). O ponto
// "Buscar em Casa" varia por bairro: tabela de R$80 e tabela de R$90.
// Bairro não reconhecido => null (a UI encaminha para atendente confirmar).

import { fmtBRL, normalizar } from "./format.js";

export const VALOR_PONTO_PADRAO = 60;
export const VALOR_BUSCA_PADRAO = 80;

const BAIRROS_80 = [
  "Centro",
  "Apicum",
  "Camboa",
  "Madre Deus",
  "Lira",
  "Vila Passos",
  "Diamante",
  "Coréia",
  "Goiabal",
  "Areinha",
  "Fabril",
  "Monte Castelo",
  "Alemanha",
  "Apeadouro",
  "Belira",
  "Barreto",
  "Fátima",
  "Bairro de Fátima",
  "Liberdade",
  "João Paulo",
  "Caratatiua",
  "Sacavém",
  "Outeiro da Cruz",
  "Jordoa",
  "Filipinho",
  "Coroado",
  "Vila Ivar Saldanha",
  "Vila Palmeira",
  "Anil",
  "Cruzeiro do Anil",
  "Aurora",
  "Parque Aurora",
  "Sítio Leal",
  "Redenção",
  "Ipase",
  "Maranhão Novo",
  "Rio Anil",
  "Cohab Anil I",
  "Cohab Anil II",
  "Cohab Anil III",
  "Cohab Anil IV",
  "Bequimão",
  "Angelim",
  "Cohafuma",
  "Cohama",
  "Vinhais",
  "Recanto dos Vinhais",
  "Planalto Vinhais I",
  "Planalto Vinhais II",
  "Turu",
  "Planalto Turu",
  "Planalto Turu II",
  "Planalto Turu III",
  "Jardim Atlântico",
  "Recanto do Turu",
  "Vivendas do Turu",
  "Chácara Brasil",
  "Parque Shalon",
  "Parque Athenas",
  "Parque Atlântico",
  "Parque Universitário",
  "Parque Timbiras",
  "Parque dos Nobres",
  "Parque Pindorama",
  "Parque Amazonas",
  "Parque Vitória",
  "Planalto Anil",
  "Planalto Aurora",
  "Cohatrac I",
  "Cohatrac II",
  "Cohatrac III",
  "Cohatrac IV",
  "Cohatrac V",
  "Forquilha",
  "Pão de Açúcar",
  "Jardim América",
  "Jardim Alvorada",
  "Jardim São Cristóvão",
  "IPEM São Cristóvão",
  "São Bernardo",
  "São Cristóvão",
  "Tirirical",
  "João de Deus",
  "Vila Janaína",
  "Cidade Operária",
  "Cidade Olímpica",
  "Santa Efigênia",
  "Santa Clara",
  "Santa Bárbara",
  "Vila Isabel Cafeteira",
  "Vila Brasil",
  "Vila Cascavel",
  "Vila Apaco",
  "Vila América",
  "Novo Angelim",
  "Jardim das Margaridas",
  "Parque dos Sabiás",
  "Recanto dos Nobres",
  "Recanto dos Pássaros",
  "Recanto dos Signos",
];

const BAIRROS_90 = [
  "Sol e Mar",
  "Vila Luizão",
  "Divinéia",
  "Alto do Turu",
  "Ipem Turu",
  "Anjo da Guarda",
  "Alto da Esperança",
  "Bonfim",
  "Cajueiro",
  "Cidade Nova",
  "Fumacê",
  "Gancharia",
  "Gapara",
  "Itaqui",
  "Jambeiro",
  "Mauro Fecury I",
  "Mauro Fecury II",
  "Piancó",
  "Porto Grande",
  "Sá Viana",
  "São Raimundo",
  "Tamancão",
  "Vila Ariri",
  "Vila Bacanga",
  "Vila Collier",
  "Vila Embratel",
  "Vila Isabel",
  "Vila Maranhão",
  "Vila Nova",
  "Vila São Luís",
  "Vila Tiradentes",
];

const SET_80 = new Set(BAIRROS_80.map(normalizar));
const SET_90 = new Set(BAIRROS_90.map(normalizar));

/**
 * @returns {number|null|undefined}
 *  80 ou 90  -> bairro reconhecido
 *  null      -> texto informado mas não reconhecido (encaminhar p/ atendente)
 *  undefined -> nada informado
 */
export function precoBairro(bairro) {
  const n = normalizar(bairro);
  if (!n) return undefined;
  if (SET_80.has(n)) return 80;
  if (SET_90.has(n)) return 90;
  return null;
}

/** Valor unitário da passagem para um ponto + (opcional) bairro. */
export function valorUnitario({ ponto, bairro } = {}) {
  if (ponto?.campo === "bairro") {
    const p = precoBairro(bairro);
    return p > 0 ? p : VALOR_BUSCA_PADRAO;
  }
  return ponto?.valor ?? VALOR_PONTO_PADRAO;
}

/** Total de uma reserva. */
export function valorTotal({ ponto, bairro, quantidade } = {}) {
  return valorUnitario({ ponto, bairro }) * (Number(quantidade) || 1);
}

export const _tabelas = { BAIRROS_80, BAIRROS_90 };

/** "Busca em casa em Maiobinha: R$ 80,00" ou "Pirapemas a Miranda: R$ 30,00". */
export function descreverSugestaoDePreco({ tipo, origem, destino, price }) {
  const lugar = tipo === "trecho" ? `${origem} a ${destino}` : `Busca em casa em ${origem}`;
  return `${lugar}: ${fmtBRL(price)}`;
}

const palavras = (s) =>
  normalizar(s)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Preço próprio de um local da categoria Outros (issue #263): o embarque DENTRO do
 * aeroporto custa diferente. Compara palavras inteiras, sem acento; o nome mais
 * longo vence. Texto que fala em "retorno" NUNCA conta: "retorno do aeroporto" é o
 * ponto Retorno, não o aeroporto (regra do dono). Mesma regra do bot
 * (supabase/functions/_shared/agentePuro.ts). Sem correspondência: null.
 * @param {string} texto local citado pelo cliente
 * @param {{local: string, price: number|string}[]} locais
 * @returns {number|null}
 */
export function precoDoLocalDeOutros(texto, locais = []) {
  const t = ` ${palavras(texto)} `;
  if (!t.trim() || t.includes(" retorno ")) return null;
  let melhor = null;
  for (const l of locais) {
    const nome = palavras(l.local);
    if (
      nome &&
      t.includes(` ${nome} `) &&
      (!melhor || nome.length > palavras(melhor.local).length)
    ) {
      melhor = l;
    }
  }
  const preco = melhor ? Number(melhor.price) : Number.NaN;
  return Number.isFinite(preco) && preco > 0 ? preco : null;
}

/**
 * Preço da VOLTA (issue #349, regra do dono): na Ida o valor é o do lugar onde buscamos;
 * na Volta, o do lugar onde DEIXAMOS o cliente em São Luís, com a mesma tabela da Ida.
 * Mesma regra do bot (`comoCobrarAVolta` em supabase/functions/_shared/agentePuro.ts).
 *  - Rodoviária / Retorno → preço desses pontos da Ida;
 *  - BR, aeroporto, beira da estrada → Outros (local com preço próprio ou o de Outros);
 *  - em casa (ou um bairro escrito no local) → preço do bairro da tabela;
 *  - cidade do caminho ou desembarque vago → preco null (fica o valor do ponto da Volta).
 * @param {{ area?: string, texto?: string, valorDoPontoDaIda: (code: string) => number|null|undefined,
 *   nomesDeBairros: string[], precoBairro: (nome: string) => number|null|undefined,
 *   precoLocalOutros?: (texto: string) => number|null }} p
 * @returns {{ preco: number|null, bairro: string|null, bairroNaoReconhecido: boolean }}
 */
export function precoDaVolta({
  area,
  texto,
  valorDoPontoDaIda,
  nomesDeBairros,
  precoBairro,
  precoLocalOutros,
}) {
  const t = ` ${palavras(texto)} `;
  const nada = { preco: null, bairro: null, bairroNaoReconhecido: false };
  const doPonto = (code) => {
    const v = Number(valorDoPontoDaIda(code));
    return v > 0 ? { ...nada, preco: v } : nada;
  };
  if (area === "rodoviaria" || (!area && t.includes(" rodoviaria "))) return doPonto("rodoviaria");
  if (area === "retorno" || (!area && t.includes(" retorno "))) return doPonto("retorno");
  if (area === "br" || (!area && / (aeroporto|br|beira da estrada) /.test(t))) {
    const proprio = precoLocalOutros?.(texto ?? "") ?? null;
    return proprio != null ? { ...nada, preco: proprio } : doPonto("outro");
  }
  if (area && area !== "casa") return nada; // cidade do caminho: trecho/ponto
  // bairro da tabela escrito no local (o nome mais longo vence)
  let bairro = null;
  for (const nome of nomesDeBairros ?? []) {
    const n = palavras(nome);
    if (n && t.includes(` ${n} `) && (!bairro || n.length > palavras(bairro).length)) bairro = nome;
  }
  if (bairro) {
    const v = Number(precoBairro(bairro));
    return { preco: v > 0 ? v : null, bairro, bairroNaoReconhecido: !(v > 0) };
  }
  return { ...nada, bairroNaoReconhecido: area === "casa" && !!t.trim() };
}
