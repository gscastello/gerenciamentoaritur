// supabase/functions/_shared/lugaresDoPedido.ts
//
// Onde o passageiro SOBE e onde ele DESCE, pelo que foi escrito na conversa (issue #523) — regras PURAS.
// O leitor do Agendado às vezes deixa o endereço vazio (duvidou da cidade), copia o embarque para o
// desembarque ou perde o "para Pirapemas". Estas regras só COMPLETAM o que ficou vazio ou tiram o que é
// cópia; nunca trocam um lugar que o leitor achou por outro.

import { normalizarTexto } from "./grafia.ts";
import { ORDEM_DA_IDA, paradasCorrigidas, sentidoDoTrecho } from "./pedidoDoCliente.ts";

export type FalaDaConversa = { quem: string; texto: string };
type Parada = (typeof ORDEM_DA_IDA)[number];

const NOME_DO_DESTINO: Record<string, string> = {
  periz: "Periz",
  bacabeira: "Bacabeira",
  "santa rita": "Santa Rita",
  entroncamento: "Entroncamento",
  miranda: "Miranda do Norte",
  matoes: "Matões do Norte",
  "povoado sozinho": "Povoado Sozinho",
  palmeiral: "Palmeiral",
  cantanhede: "Cantanhede",
  campestre: "Campestre",
  pirapemas: "Pirapemas",
};

const n = (t: string) => ` ${paradasCorrigidas(normalizarTexto(t))} `;

// ---------------------------------------------------------------------------
// Destino escrito
// ---------------------------------------------------------------------------

const DESTINO = "(periz|bacabeira|santa rita|entroncamento|miranda|matoes|povoado sozinho|palmeiral|cantanhede|campestre|pirapemas)";
const RE_PARA = new RegExp(
  ` (?:para|pra|pro|ate|rumo a|com destino a|desce em|desco em|descer em|descendo em|ficar em|fico em|sao luis (?:a|x|ao)|slz (?:a|x|ao)) (?:o |a )?(?:cidade de |povoado )?${DESTINO}(?= )`,
  "g",
);
const RE_PARA_SAO_LUIS = / (?:para|pra|pro|ate|p|a|x|sentido|rumo a|ida) (?:a )?(?:sao luis|sao luiz|slz|s luis|luis)(?= )/;

/** Cidades do interior escritas como DESTINO ("para Pirapemas", "até Miranda", "de São Luís a Cantanhede"). */
export function destinosEscritos(textos: string[]): Parada[] {
  const achadas = new Set<Parada>();
  for (const t of textos) {
    for (const m of n(t).matchAll(RE_PARA)) achadas.add(m[1] as Parada);
  }
  return [...achadas];
}

/** Ida sem desembarque: a única cidade que o cliente escreveu como destino. */
export function desembarqueDaIdaEscrito(textosDoCliente: string[]): string | null {
  const d = destinosEscritos(textosDoCliente);
  return d.length === 1 ? NOME_DO_DESTINO[d[0]] : null;
}

/**
 * Volta que para no caminho ("até Miranda"): a única cidade escrita como destino, se fica depois da origem
 * no sentido da Volta e o cliente não falou em ir para São Luís.
 */
export function desembarqueDaVoltaNoCaminho(textosDoCliente: string[], origem: string | null): string | null {
  if (textosDoCliente.some((t) => RE_PARA_SAO_LUIS.test(n(t)))) return null;
  const d = destinosEscritos(textosDoCliente);
  if (d.length !== 1) return null;
  const de = (ORDEM_DA_IDA as readonly string[]).includes(origem ?? "") ? (origem as Parada) : "pirapemas";
  return sentidoDoTrecho(de, d[0]) === "volta" ? NOME_DO_DESTINO[d[0]] : null;
}

const LUGARES_DE_SAO_LUIS: [RegExp, string][] = [
  [/posto (?:do |da )?carone|carone/, "Posto Carone"],
  [/terminal (?:de integracao )?(?:do |no )?maracana/, "Terminal do Maracanã"],
  [/rodoviaria/, "Rodoviária"],
  [/aeroporto/, "Aeroporto"],
  [/retorno/, "Retorno das Vans"],
];
const RE_DESCE_EM =
  / (?:desco|desce|descer|descem|descendo|ficar|fico|fica|deixa|deixar|deixe|deixando|parar|ate)(?: (?:eu|la|ali|me|ela|ele|a gente|somente|so|mesmo))*(?: (?:n[ao]|em|[ao]|perto d[ao]|proximo [ao]|no posto d[ao]|frente d?[ao]|depois d[ao]))* ((?:posto|terminal|rodoviaria|aeroporto|retorno|carone)[a-z ]{0,28})/;

/**
 * Volta sem desembarque: o lugar conhecido de São Luís que o cliente disse que DESCE ("vou ficar na
 * rodoviária", "até o retorno"). Rodoviária de cidade do interior e "retorno" de viagem de volta não contam.
 */
export function desembarqueDaVoltaEscrito(textosDoCliente: string[]): string | null {
  const achados = new Set<string>();
  for (const t of textosDoCliente) {
    const texto = n(t);
    if (/ (?:cantanhede|miranda|matoes|santa rita|pirapemas) /.test(texto) && !RE_PARA_SAO_LUIS.test(texto)) continue;
    const m = texto.match(RE_DESCE_EM);
    if (!m) continue;
    const depois = m[1].trim();
    if (/^retorno (?:n[ao] |d[ao] |em )?(?:dia|segunda|terca|quarta|quinta|sexta|sabado|domingo|amanha|hoje|de volta|pra|para)/.test(depois)) continue;
    const l = LUGARES_DE_SAO_LUIS.find(([re]) => re.test(depois));
    if (l) achados.add(l[1]);
  }
  return achados.size === 1 ? [...achados][0] : null;
}

// ---------------------------------------------------------------------------
// Desembarque que é cópia do embarque (Volta)
// ---------------------------------------------------------------------------

const VAZIAS = new Set(
  "a o as os da de do das dos na no nas nos em e ao aos pra para sao luis slz casa bairro cidade rua r av avenida travessa trav proximo perto lado frente".split(" "),
);
const nucleo = (t: string) => normalizarTexto(t).split(" ").filter((p) => p.length >= 2 && !VAZIAS.has(p));

/** O desembarque é o mesmo lugar do embarque (copiado), na Volta? Lugar de São Luís no texto não conta. */
export function desembarqueCopiaDoEmbarque(
  desembarque: string | null | undefined,
  embarque: string | null | undefined,
  bairrosDeSaoLuis: string[] = [],
): boolean {
  const d = nucleo(String(desembarque ?? ""));
  const e = new Set(nucleo(String(embarque ?? "")));
  if (!d.length || !e.size) return false;
  const texto = ` ${normalizarTexto(String(desembarque ?? ""))} `;
  const soNoDesembarque = bairrosDeSaoLuis.some((b) => {
    const nb = normalizarTexto(b);
    return nb.length >= 5 && texto.includes(` ${nb} `) && !` ${normalizarTexto(String(embarque ?? ""))} `.includes(` ${nb} `);
  });
  if (soNoDesembarque) return false;
  const iguais = d.filter((p) => e.has(p)).length;
  return iguais / d.length >= 0.6 && (iguais >= 2 || d.length === 1);
}

// ---------------------------------------------------------------------------
// Endereço da Volta que o leitor deixou vazio
// ---------------------------------------------------------------------------

const RE_PERGUNTA_ENDERECO =
  / (?:(?:qual|quau|manda|mande|me passa|me diga|me diz|envie?|informe) (?:e )?(?:o |seu |a |sua |teu )?(?:endereco|localizacao|rua|local)|(?:onde|aonde)(?: [a-z]+){0,4} (?:buscar|buscamos|busco|pegar|pegamos|pego|embarca|embarque|vai estar|mora)|(?:te|lhe) (?:buscamos|busco|pegamos|pego) (?:onde|aonde)) /;
const RE_LUGAR =
  / (?:rua|r|av|avenida|travessa|trav|beco|praca|estrada|povoado|casa|perto|pertinho|proximo|prox|frente|enfrente|atras|lado|bairro|alto|escola|igreja|hospital|posto|mercado|mercadinho|mercantil|mercearia|comercio|comercial|bar|farmacia|entrada|depois|antes|conjunto|condominio|fazenda|vila|centro|delegacia|quebra|esquina|quadra|provisoria|lava|oficina|deposito|pousada|hotel|clinica|chacara|sitio|loja|padaria|escritorio|cemiterio|campo|ginasio|forum|banco|choperia) /;
const RE_NAO_E_ENDERECO =
  /^ (?:ok|okay|sim|nao|isso|certo|ta|ta bom|ta bem|tudo bem|tudo certo|obrigad[oa]|muito obrigad[oa]|blz|beleza|bom dia|boa tarde|boa noite|oi|ola|por favor|amanha|hoje|obg|vlw) $/;
const RE_SAO_LUIS = / (?:rodoviaria|retorno|carone|aeroporto|terminal|sao luis|slz) /;
const RE_MORO_EM =
  /\b(?:moro|eu moro|estou|t[oô]|vou estar|vou esperar|espero|te espero|aguardo|me pega|me pegar|pode me pegar|pode pegar|me busca|me buscar|buscar|pegar|passa|passar)\s+(?:aqui\s+|aq\s+|ali\s+|l[aá]\s+|mesmo\s+)*((?:n[ao]s?|em|perto|pr[oó]ximo|em frente|atr[aá]s|ao lado|do lado)\s.+)$/i;
const RE_VOU_FICAR = /\bvou ficar\s+(?:aqui\s+|aq\s+|ali\s+)*((?:n[ao]s?|em|perto|pr[oó]ximo|em frente)\s.+)$/i;
const RE_NA_CASA_DE =
  /^\s*(?:[ée]\s+)?(?:aqui\s+)?(n[ao]s?\s+(?:casa|mercearia|com[eé]rcio|mercantil|bar|loja|padaria|praça|rua|travessa|avenida)\b.+)$/i;
const RE_EQUIPE_BUSCAR =
  /\b(?:buscar|busco|buscamos|pegar|pego|pegamos)\s+(?:aqui\s+|a[ií]\s+|ali\s+|l[aá]\s+)*(n[ao]s?\s.+?|em\s.+?)(?:\s*,?\s*(?:certo|ok|n[eé]|viu|isso))?\s*\??$/i;
const RE_EQUIPE_CERTO = /^((?:rua|r\.|av\.?|avenida|travessa|trav\.?|beco|praça|estrada|povoado)\s.+?)\s*,?\s*(?:certo|ok|n[eé]|isso)\s*\??$/i;

const limpo = (t: string) => t.replace(/\s+/g, " ").replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "").trim();
/** tira "na ", "no ", "em " do começo, menos de "em frente" */
const semPreposicao = (t: string) => limpo(t).replace(/^(?:n[ao]s?\s+(?:n[ao]s?\s+)?|em\s+(?!frente))/i, "");
const semAudio = (t: string) => t.replace(/^\[áudio:\s*([\s\S]*?)\]$/i, "$1");

function serveDeEndereco(linha: string, respondendo: boolean): boolean {
  const t = n(linha);
  if (linha.includes("?") || linha.startsWith("[") || /https?:/i.test(linha)) return false;
  if (t.trim().length < 3 || t.length > 160 || RE_NAO_E_ENDERECO.test(t)) return false;
  if (RE_LUGAR.test(t)) return true;
  // resposta curta a "Qual a rua?": "José Lamar"
  return respondendo && t.trim().split(" ").length <= 5 && /^[ a-z]+$/.test(t) &&
    !/ (?:passagem|passagens|vaga|vagas|amanha|hoje|pessoa|pessoas|horas|obrigad[oa]|sim|nao|vou|quero|bom|boa|ok|certo|isso|oi|ola|pirapemas|cantanhede) /.test(t);
}

export type EnderecoDito = { endereco: string; como: "resposta" | "equipe" | "dito" };

/**
 * O endereço de embarque da Volta, quando a leitura o deixou vazio: a resposta do cliente a "Qual o endereço
 * pra lhe buscar?", o lugar que a equipe repetiu ("Buscar na casa do…, certo") ou o que o cliente disse ("moro
 * na…", "vou ficar aqui na…"). Lugar de São Luís é desembarque e não entra.
 */
export function enderecoDaVoltaDito(falas: FalaDaConversa[], bairrosDeSaoLuis: string[] = []): EnderecoDito | null {
  const emSaoLuis = (t: string) => {
    const x = n(t);
    return RE_SAO_LUIS.test(x) || bairrosDeSaoLuis.some((b) => {
      const nb = normalizarTexto(b);
      return nb.length >= 5 && x.includes(` ${nb} `);
    });
  };
  let respondendo = false;
  let pegouResposta = false;
  let respostas: string[] = [];
  let daEquipe: string | null = null;
  const ditos: string[] = [];
  for (const f of falas) {
    if (f.quem === "equipe") {
      if (RE_PERGUNTA_ENDERECO.test(n(f.texto))) {
        respondendo = true;
        pegouResposta = false;
        continue;
      }
      if (pegouResposta) respondendo = false;
      const t = f.texto.trim();
      const m = t.match(RE_EQUIPE_BUSCAR) ?? t.match(RE_EQUIPE_CERTO);
      if (m && !emSaoLuis(m[1]) && n(m[1]).trim().split(" ").length >= 2 && RE_LUGAR.test(n(m[1]))) daEquipe = semPreposicao(m[1]);
      continue;
    }
    if (f.quem !== "cliente") continue;
    for (const linhaBruta of semAudio(f.texto).split(/\n+/)) {
      const linha = limpo(linhaBruta);
      if (!linha || linhaBruta.includes("?")) continue;
      // "Para São Luís vou ficar na praça": o pedaço depois do verbo é que não pode ser de São Luís
      const dito = linha.match(RE_MORO_EM) ?? linha.match(RE_VOU_FICAR) ?? linha.match(RE_NA_CASA_DE);
      const pedaco = dito ? dito[1].replace(/\s+(?:o |e )?meu nome [ée]?.*$/i, "") : linha;
      if (emSaoLuis(pedaco)) continue;
      if (respondendo && serveDeEndereco(pedaco, !pegouResposta)) {
        if (!pegouResposta) respostas = [];
        pegouResposta = true;
        respostas.push(semPreposicao(pedaco));
      } else if (dito && RE_LUGAR.test(n(pedaco))) {
        ditos.push(semPreposicao(pedaco));
      }
    }
  }
  const juntar = (l: string[]) => [...new Set(l.map(limpo).filter(Boolean))].slice(0, 3).join(", ").slice(0, 160);
  if (respostas.length) return { endereco: juntar([...respostas, ...ditos]), como: "resposta" };
  if (daEquipe) {
    // "Vou ficar na provisória, rua da paz" → "Pra lhe buscar na provisória certo?": vale o que o cliente escreveu, mais completo
    const palavras = nucleo(daEquipe);
    const completo = ditos.find((d) => palavras.every((p) => nucleo(d).includes(p)));
    return { endereco: juntar([completo ?? daEquipe]), como: "equipe" };
  }
  if (ditos.length) return { endereco: juntar(ditos), como: "dito" };
  return null;
}

// ---------------------------------------------------------------------------
// Tudo junto, no pedido lido
// ---------------------------------------------------------------------------

export type PedidoComLugares = {
  tipo?: string;
  direcao?: string | null;
  ponto?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  desembarque?: string | null;
  cidade_dita?: string | null;
};

/** "Em casa (bairro)" é desembarque de São Luís: na Ida não diz nada. */
const GENERICO_DA_IDA = /^em casa( |$)|^sao luis$/;

/** Completa (no próprio pedido) o embarque e o desembarque escritos. Devolve o que mudou, para as notas. */
export function completarLugares(
  p: PedidoComLugares,
  falas: FalaDaConversa[],
  ctx: { pontos: { ida: string[]; volta: string[] }; bairros: string[]; sentidos: (string | null)[] },
): string[] {
  if ((p.tipo ?? "passagem") === "encomenda") return [];
  const ponto = String(p.ponto ?? "").toLowerCase();
  const direcao = p.direcao === "ida" || p.direcao === "volta" ? p.direcao : ctx.pontos.ida.includes(ponto) ? "ida" : ctx.pontos.volta.includes(ponto) || p.cidade_dita ? "volta" : null;
  const doCliente = falas.filter((f) => f.quem === "cliente").map((f) => semAudio(f.texto));
  const vazio = (t: string | null | undefined) => !String(t ?? "").trim();
  const feito: string[] = [];

  if (direcao === "ida" && (vazio(p.desembarque) || GENERICO_DA_IDA.test(normalizarTexto(p.desembarque)))) {
    const d = desembarqueDaIdaEscrito(doCliente);
    if (d) {
      p.desembarque = d;
      feito.push(`Desce em ${d}, escrito pelo cliente.`);
    }
  }
  if (direcao !== "volta") return feito;

  if (!vazio(p.desembarque) && desembarqueCopiaDoEmbarque(p.desembarque, p.endereco, ctx.bairros)) {
    feito.push(`"${p.desembarque}" é o embarque, não o desembarque.`);
    p.desembarque = null;
  }
  // com Ida na mesma leitura, o "vou ficar" pode ser da Ida
  if (ctx.sentidos.some((s) => s !== "volta")) return feito;
  const semLugar = vazio(p.desembarque) || /^sao luis$/.test(normalizarTexto(p.desembarque));
  if (semLugar) {
    const d = desembarqueDaVoltaNoCaminho(doCliente, normalizarTexto(p.cidade_dita ?? ponto) || null) ?? desembarqueDaVoltaEscrito(doCliente);
    if (d) {
      p.desembarque = d;
      feito.push(`Desce em ${d}, escrito pelo cliente.`);
    }
  }
  return feito;
}

/**
 * Reserva da Volta pronta, sem endereço: o que o cliente ou a equipe escreveu. Vem DEPOIS de decidida a cidade:
 * o lugar escrito aqui nunca decide Pirapemas ou Cantanhede (issue #523, caso bedd50d3).
 */
export function enderecoQueFaltou(
  falas: FalaDaConversa[],
  ctx: { direcao: string; bairros: string[]; sentidos: (string | null)[]; temCostume: boolean; desembarque: string | null },
): { endereco: string; desembarqueEraEmbarque: boolean } | null {
  if (ctx.direcao !== "volta" || ctx.sentidos.some((s) => s === "ida")) return null;
  const e = enderecoDaVoltaDito(falas, ctx.bairros);
  // sem pergunta nem confirmação da equipe, o costume do passageiro vale mais que uma frase solta
  if (!e || (e.como === "dito" && ctx.temCostume)) return null;
  return { endereco: e.endereco, desembarqueEraEmbarque: desembarqueCopiaDoEmbarque(ctx.desembarque, e.endereco, ctx.bairros) };
}
