// supabase/functions/_shared/ladoDaRota.ts
//
// O LUGAR DIZ O SENTIDO (dono, 15/11 — issue #426) — regras PURAS, sem rede, para TODOS os
// atendimentos (Agendado, revisor, bot atendente, Assistente):
//   - embarque em São Luís (Retorno das Vans, Rodoviária, aeroporto, trecho da BR, bairro) só existe na Ida;
//   - embarque em Pirapemas/Cantanhede ou numa cidade do caminho, saindo para São Luís, só na Volta;
//   - o desembarque, o contrário.
// Entre duas cidades do interior vale a ordem das paradas (de Cantanhede pra Pirapemas é Ida).
// Embarque/desembarque que não combinam com o sentido nunca são lançados calados.

import { normalizarTexto, semLogradouros } from "./grafia.ts";
import { ORDEM_DA_IDA, sentidoDoTrecho } from "./pedidoDoCliente.ts";

export type Lado = "sao_luis" | "interior";
type Parada = (typeof ORDEM_DA_IDA)[number];

const PARADAS_DO_INTERIOR: [RegExp, Parada][] = [
  [/ (pirapemas|pirapema) /, "pirapemas"],
  [/ (cantanhede|catanhede|cantanhed) /, "cantanhede"],
  [/ campestre /, "campestre"],
  [/ matoes /, "matoes"],
  [/ miranda /, "miranda"],
  [/ entroncamento /, "entroncamento"],
  [/ santa rita /, "santa rita"],
  [/ bacabeira /, "bacabeira"],
];
/** "Residencial Pirapemas" (São Luís), "Vila Miranda": nome de lugar, não a cidade */
const ANTES_DE_NOME = / (residencial|conjunto|condominio|vila|loteamento|bairro|jardim|parque) $/;
/** bairros de uma palavra que existem em todo lugar */
const BAIRROS_GENERICOS = new Set(["centro", "vila", "bairro", "cidade", "alto", "conjunto", "residencial"]);

/** As paradas do interior escritas no texto (fora de nome de rua e de residencial). */
function paradasNoTexto(texto: string | null | undefined): Set<Parada> {
  const t = ` ${normalizarTexto(semLogradouros(texto))} `;
  const achadas = new Set<Parada>();
  for (const [re, parada] of PARADAS_DO_INTERIOR) {
    const m = t.match(re);
    if (!m) continue;
    const antes = ` ${t.slice(0, m.index! + 1).trim()} `;
    if (ANTES_DE_NOME.test(antes)) continue;
    achadas.add(parada);
  }
  return achadas;
}

/** A parada do interior escrita no texto; null = nenhuma ou mais de uma. */
export function paradaDoInterior(texto: string | null | undefined): Parada | null {
  const achadas = paradasNoTexto(texto);
  return achadas.size === 1 ? [...achadas][0] : null;
}

/**
 * De que lado da rota é o lugar escrito: São Luís ou interior. null = não dá para dizer (nada
 * reconhecido, ou sinais dos dois lados). Só pelo texto; a base de lugares entra em `ladoPelaBase`.
 */
export function ladoEscrito(
  texto: string | null | undefined,
  ctx: { bairros?: { neighborhood: string }[]; locaisDeOutros?: string[] } = {},
): Lado | null {
  if (!texto || !String(texto).trim()) return null;
  const t = ` ${normalizarTexto(semLogradouros(texto))} `;
  const interior = paradasNoTexto(texto).size > 0;
  // "rodoviária" escrita não decide: Cantanhede e Miranda também têm (o ponto Rodoviária da Ida vem pelo código)
  let saoLuis = / (sao luis|slz|s luis|sao luiz|aeroporto|retorno) /.test(t);
  if (!saoLuis && ctx.locaisDeOutros?.length) {
    saoLuis = ctx.locaisDeOutros.some((l) => {
      const n = normalizarTexto(l);
      return n.length >= 3 && t.includes(` ${n} `);
    });
  }
  if (!saoLuis && ctx.bairros?.length) {
    saoLuis = ctx.bairros.some((b) => {
      const n = normalizarTexto(b.neighborhood);
      if (!n || BAIRROS_GENERICOS.has(n)) return false;
      // "Estrada da Maioba", "Cohab Anil" são bairros: compara com o texto inteiro, com logradouro
      if (n.split(" ").length >= 2) return ` ${normalizarTexto(texto)} `.includes(` ${n} `);
      return n.length >= 5 && t.trim() === n; // uma palavra só: o texto inteiro é o bairro
    });
  }
  if (saoLuis === interior) return null;
  return saoLuis ? "sao_luis" : "interior";
}

/** O que a base de lugares diz (cidade_lugares forte = interior; memória de São Luís = São Luís). */
export function ladoPelaBase(p: { interiorForte: boolean; saoLuisNaMemoria: boolean }): Lado | null {
  if (p.interiorForte === p.saoLuisNaMemoria) return null;
  return p.interiorForte ? "interior" : "sao_luis";
}

export type ViagemParaConferir = {
  direction: string;
  route_point_code?: string | null;
  pickup_detail?: string | null;
  pickup_neighborhood?: string | null;
  dropoff_location?: string | null;
  type?: string | null;
};

const PONTOS_DE_SAO_LUIS = new Set(["busca", "rodoviaria", "retorno"]);
const PONTOS_DO_INTERIOR = new Set(["pirapemas", "cantanhede"]);

/**
 * Embarque e desembarque combinam com o sentido? Devolve o motivo do que NÃO combina (para a
 * pendência / a pergunta ao passageiro), ou null. `ladoDoEmbarque`/`ladoDoDesembarque` podem vir
 * já resolvidos pela base de lugares; senão sai do texto.
 */
export function lugaresContraOSentido(
  r: ViagemParaConferir,
  ctx: {
    bairros?: { neighborhood: string }[];
    locaisDeOutros?: string[];
    ladoDoEmbarque?: Lado | null;
    ladoDoDesembarque?: Lado | null;
  } = {},
): string | null {
  if ((r.type ?? "passagem") === "encomenda") return null;
  const ponto = String(r.route_point_code ?? "");
  const textoEmbarque = [r.pickup_detail, r.direction === "ida" ? r.pickup_neighborhood : null].filter(Boolean).join(", ");
  // o ponto já diz o lado: busca/rodoviária/retorno = São Luís; pirapemas/cantanhede = interior
  const ladoDoPonto: Lado | null = PONTOS_DE_SAO_LUIS.has(ponto) ? "sao_luis" : PONTOS_DO_INTERIOR.has(ponto) ? "interior" : null;
  // o bairro da tabela (Ida) é um sinal à parte: "Pirâmide" + "Cantanhede" no texto = os dois lados, não decide
  const ladoDoBairro = r.direction === "ida" && r.pickup_neighborhood ? ladoEscrito(r.pickup_neighborhood, ctx) : null;
  const ladoDoTexto = ladoEscrito(r.pickup_detail, ctx);
  const embarque = ctx.ladoDoEmbarque ??
    (ladoDoBairro && ladoDoTexto && ladoDoBairro !== ladoDoTexto ? null : ladoDoTexto ?? ladoDoBairro);
  const desembarque = ctx.ladoDoDesembarque ?? ladoEscrito(r.dropoff_location, ctx);
  const deOnde = paradaDoInterior(textoEmbarque) ?? (PONTOS_DO_INTERIOR.has(ponto) ? (ponto as Parada) : null);
  const paraOnde = paradaDoInterior(r.dropoff_location);

  if (r.direction === "ida") {
    if (ladoDoPonto === "interior") return `o ponto ${ponto} é embarque da Volta, e a reserva está na Ida`;
    if (embarque === "interior") {
      // Ida que sobe no interior só vale indo mais adiante na rota (Cantanhede → Pirapemas)
      if (deOnde && paraOnde && sentidoDoTrecho(deOnde, paraOnde) === "ida") return null;
      return `o embarque (${textoEmbarque}) é no interior, e na Ida o passageiro embarca em São Luís`;
    }
    if (desembarque === "sao_luis") return `o desembarque (${r.dropoff_location}) é em São Luís, e na Ida o passageiro desce no interior`;
    return null;
  }
  if (r.direction === "volta") {
    if (ladoDoPonto === "sao_luis") return `o ponto ${ponto} é embarque da Ida (São Luís), e a reserva está na Volta`;
    if (embarque === "sao_luis") return `o embarque (${textoEmbarque}) é em São Luís, e na Volta o passageiro embarca no interior`;
    if (desembarque === "interior") {
      // Volta que desce no interior só vale voltando na rota (Pirapemas → Cantanhede/Miranda)
      if (deOnde && paraOnde && sentidoDoTrecho(deOnde, paraOnde) === "volta") return null;
      return `o desembarque (${r.dropoff_location}) é no interior, e na Volta o passageiro desce em São Luís`;
    }
    return null;
  }
  return null;
}

/** A linha de raciocínio, para os prompts (leitor, atendente, revisor, Assistente). */
export const REGRA_DO_LUGAR =
  "O LUGAR DIZ O SENTIDO: embarque em São Luís (Retorno das Vans, Rodoviária, aeroporto, trecho da BR, qualquer bairro de São Luís) só existe na IDA; embarque em Pirapemas, Cantanhede ou numa cidade do caminho, indo para São Luís, só na VOLTA. O desembarque é o contrário (Ida desce no interior; Volta desce em São Luís). Entre duas cidades do interior vale a ordem das paradas (de Cantanhede pra Pirapemas é Ida). Se o embarque ou o desembarque que o cliente disse não combinam com o sentido, NÃO marque: pergunte ao cliente.";
