// Precificação. Pontos de embarque têm valor fixo (padrão R$60). O ponto
// "Buscar em Casa" varia por bairro: tabela de R$80 e tabela de R$90.
// Bairro não reconhecido => null (a UI encaminha para atendente confirmar).

import { normalizar } from "./format.js";

export const VALOR_PONTO_PADRAO = 60;
export const VALOR_BUSCA_PADRAO = 80;

const BAIRROS_80 = [
  "Centro", "Apicum", "Camboa", "Madre Deus", "Lira", "Vila Passos", "Diamante",
  "Coréia", "Goiabal", "Areinha", "Fabril", "Monte Castelo", "Alemanha", "Apeadouro",
  "Belira", "Barreto", "Fátima", "Bairro de Fátima", "Liberdade", "João Paulo",
  "Caratatiua", "Sacavém", "Outeiro da Cruz", "Jordoa", "Filipinho", "Coroado",
  "Vila Ivar Saldanha", "Vila Palmeira", "Anil", "Cruzeiro do Anil", "Aurora",
  "Parque Aurora", "Sítio Leal", "Redenção", "Ipase", "Maranhão Novo", "Rio Anil",
  "Cohab Anil I", "Cohab Anil II", "Cohab Anil III", "Cohab Anil IV", "Bequimão",
  "Angelim", "Cohafuma", "Cohama", "Vinhais", "Recanto dos Vinhais",
  "Planalto Vinhais I", "Planalto Vinhais II", "Turu", "Planalto Turu",
  "Planalto Turu II", "Planalto Turu III", "Jardim Atlântico", "Recanto do Turu",
  "Vivendas do Turu", "Chácara Brasil", "Parque Shalon", "Parque Athenas",
  "Parque Atlântico", "Parque Universitário", "Parque Timbiras", "Parque dos Nobres",
  "Parque Pindorama", "Parque Amazonas", "Parque Vitória", "Planalto Anil",
  "Planalto Aurora", "Cohatrac I", "Cohatrac II", "Cohatrac III", "Cohatrac IV",
  "Cohatrac V", "Forquilha", "Pão de Açúcar", "Jardim América", "Jardim Alvorada",
  "Jardim São Cristóvão", "IPEM São Cristóvão", "São Bernardo", "São Cristóvão",
  "Tirirical", "João de Deus", "Vila Janaína", "Cidade Operária", "Cidade Olímpica",
  "Santa Efigênia", "Santa Clara", "Santa Bárbara", "Vila Isabel Cafeteira",
  "Vila Brasil", "Vila Cascavel", "Vila Apaco", "Vila América", "Novo Angelim",
  "Jardim das Margaridas", "Parque dos Sabiás", "Recanto dos Nobres",
  "Recanto dos Pássaros", "Recanto dos Signos",
];

const BAIRROS_90 = [
  "Sol e Mar", "Vila Luizão", "Divinéia", "Alto do Turu", "Ipem Turu",
  "Anjo da Guarda", "Alto da Esperança", "Bonfim", "Cajueiro", "Cidade Nova",
  "Fumacê", "Gancharia", "Gapara", "Itaqui", "Jambeiro", "Mauro Fecury I",
  "Mauro Fecury II", "Piancó", "Porto Grande", "Sá Viana", "São Raimundo",
  "Tamancão", "Vila Ariri", "Vila Bacanga", "Vila Collier", "Vila Embratel",
  "Vila Isabel", "Vila Maranhão", "Vila Nova", "Vila São Luís", "Vila Tiradentes",
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
