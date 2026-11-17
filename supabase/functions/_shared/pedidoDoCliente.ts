// supabase/functions/_shared/pedidoDoCliente.ts
//
// O que o CLIENTE escreveu sobre a reserva (issue #303) — regras PURAS, sem rede.
// A IA lê a conversa e preenche a ficha do pedido; aqui o código relê TODAS as
// mensagens do cliente e confere cada informação que a reserva precisa: sentido,
// dia, quantidade, ponto de embarque, bairro e cidade da Volta.
//   - Campo que a IA deixou vazio e o cliente escreveu (uma resposta só): completa.
//   - Campo que contradiz o que o cliente escreveu: aviso para conferir. Não troca
//     sozinho: ida e volta têm dias diferentes, duas pessoas viram dois pedidos.
// Nunca decide preço nem vaga.

import { normalizarTexto } from "./grafia.ts";

export type MensagemDoCliente = { texto: string; em: string };

const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" });
const diaDe = (iso: string) => fmtDia.format(new Date(iso));
const somar = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo

const unico = <T>(valores: T[]): T | null => {
  const s = [...new Set(valores)];
  return s.length === 1 ? s[0] : null;
};

// ---------------------------------------------------------------------------
// Sentido
// ---------------------------------------------------------------------------

/** "pra São Luís", "de Pirapemas pra…" = volta; "pra Pirapemas", "saindo de São Luís" = ida. Os dois = null. */
/** O cliente falou das duas viagens ("ida e volta", "e volto domingo", "a volta é…")? */
export function falouDasDuasViagens(textos: string[]): boolean {
  // "e retorno segunda-feira", "retorno no domingo" é a outra viagem; "no retorno" sozinho é o ponto (issue #401)
  return textos.some((t) =>
    / (ida e volta|volta|voltar|volto|voltando|vou e volto|regresso|retornar|retornando|retorno pra|retorno para|e retorno) /.test(` ${normalizarTexto(t)} `) ||
    / retorno (no|na|dia|em|segunda|terca|quarta|quinta|sexta|sabado|domingo|amanha) /.test(` ${normalizarTexto(t)} `)
  );
}

type PedidoDoPar = {
  tipo?: string | null;
  data?: string | null;
  direcao?: string | null;
  ponto?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  desembarque?: string | null;
  cidade_dita?: string | null;
  duvida?: string | null;
  quantidade?: number | null;
};

const GENERICAS = new Set([
  "rua", "avenida", "av", "casa", "condominio", "residencial", "conjunto", "bloco", "apartamento", "apto", "ap", "perto",
  "proximo", "numero", "lado", "frente", "esquina", "travessa", "estrada", "bairro", "centro", "sao", "luis",
]);
/** Palavras que dizem o lugar (sem "rua", "casa", "condomínio"…). */
const nucleoDoLugar = (t: string | null | undefined) =>
  normalizarTexto(t ?? "")
    .split(" ")
    .filter((p) => p.length >= 3 && !GENERICAS.has(p) && !/^\d+$/.test(p));

/** `x` é o mesmo lugar que `y` (60% das palavras de `x` estão em `y`)? */
function mesmoLugar(x: string | null | undefined, y: string | null | undefined): boolean {
  const px = nucleoDoLugar(x);
  if (!px.length) return false;
  const py = new Set(nucleoDoLugar(y));
  return px.filter((p) => py.has(p)).length / px.length >= 0.6;
}

/**
 * O embarque lido é a resposta do cliente a uma pergunta da equipe sobre a VOLTA ("Na volta, onde
 * lhe busco?" → "lá na Lister Caldas")? Olha a última mensagem da equipe antes da resposta.
 */
export function embarqueRespondeuAVolta(endereco: string | null | undefined, falas: { quem: string; texto: string }[]): boolean {
  if (!nucleoDoLugar(endereco).length) return false;
  for (let i = falas.length - 1; i >= 0; i--) {
    const f = falas[i];
    if (f.quem !== "cliente" || !mesmoLugar(f.texto, endereco)) continue;
    for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
      if (falas[j].quem !== "equipe") continue;
      return / (volta|voltar|retorno) /.test(` ${normalizarTexto(falas[j].texto)} `) && falas[j].texto.includes("?");
    }
    return false;
  }
  return false;
}

const cidadeDoInterior = (t: string | null | undefined): "pirapemas" | "cantanhede" | null => {
  const n = normalizarTexto(t ?? "");
  const p = n.includes("pirapemas") || n.includes("campestre");
  const c = n.includes("cantanhede");
  return p === c ? null : p ? "pirapemas" : "cantanhede";
};

/**
 * O sentido que o cliente escreveu na(s) mensagem(ns) que citam o DIA da viagem ("Volta na terça
 * feira de Cantanhede pro Marsil") vale para a viagem daquele dia (issue #415). Lida no sentido
 * contrário, ela vira: Volta sai da cidade dita (ou da que aparece no embarque lido) e o endereço
 * que era só o nome da cidade sai; Ida perde a cidade da Volta. Sem sentido único no dia, não mexe.
 */
export function pedidosPeloSentidoDoDia<P extends PedidoDoPar>(pedidos: P[], mensagens: MensagemDoCliente[]): P[] {
  let mudou = false;
  const out = pedidos.map((p) => {
    if ((p.tipo ?? "passagem") === "encomenda" || !p.data || (p.direcao !== "ida" && p.direcao !== "volta")) return p;
    // só mensagens que citam UM dia: "segunda pra ir e terça pra volta" não decide nenhum dos dois
    const doDia = mensagens.filter((m) => {
      const ds = datasEscritas([m]);
      return ds.length === 1 && ds[0] === p.data;
    });
    const sentido = sentidoEscrito(doDia.map((m) => m.texto));
    if (!sentido || sentido === p.direcao) return p;
    mudou = true;
    const origem = doDia.map((m) => origemEscrita(m.texto)).find(Boolean) ?? null;
    const aviso = `O cliente escreveu ${sentido === "volta" ? "Volta" : "Ida"} para ${p.data.split("-").reverse().slice(0, 2).join("/")}: ficou na ${sentido === "volta" ? "Volta" : "Ida"}.`;
    if (sentido === "volta") {
      const cidade = (origem?.de === "pirapemas" || origem?.de === "cantanhede" ? origem.de : null) ?? cidadeDoInterior(p.endereco) ??
        cidadeDoInterior(p.desembarque);
      const soACidade = !!p.endereco && cidadeDoInterior(p.endereco) !== null && normalizarTexto(p.endereco).split(" ").length <= 2;
      return {
        ...p,
        direcao: "volta",
        ponto: null,
        bairro: null,
        cidade_dita: cidade,
        endereco: soACidade ? null : (p.endereco ?? null),
        duvida: [p.duvida, aviso].filter(Boolean).join(" "),
      };
    }
    return { ...p, direcao: "ida", ponto: null, cidade_dita: null, duvida: [p.duvida, aviso].filter(Boolean).join(" ") };
  });
  return mudou ? out : pedidos;
}

/**
 * As falas do pedido daquele DIA (issue #419): a conversa em blocos (mensagens com menos de 15 min
 * entre uma e outra); bloco que cita só OUTROS dias é de outro pedido e sai. "De Pirapemas a São
 * Luís… para hoje à tarde" de ontem não diz o sentido do pedido de amanhã.
 */
export function falasDoDia<F extends { texto: string; em: string }>(falas: F[], dia: string | null | undefined): F[] {
  if (!dia) return falas;
  const blocos: F[][] = [];
  for (const f of falas) {
    const ultimo = blocos.at(-1);
    const anterior = ultimo?.at(-1);
    if (ultimo && anterior && Date.parse(f.em) - Date.parse(anterior.em) < 15 * 60 * 1000) ultimo.push(f);
    else blocos.push([f]);
  }
  return blocos
    .filter((b) => {
      const ds = datasEscritas(b);
      return !ds.length || ds.includes(dia);
    })
    .flat();
}

/**
 * Pedido de um dia que JÁ PASSOU não é o pedido atual (issue #419): a conversa em blocos (menos de
 * 15 min entre as mensagens); bloco cujos dias escritos são todos antes de `hoje` vai para o
 * histórico. "Para hoje à tarde… De Pirapemas a São Luís" de ontem não entra no pedido de amanhã.
 * A marca do Agendado (`manter`) nunca sai.
 */
export function semPedidosPassados<F extends { texto: string; em: string; id?: number }>(
  falas: F[],
  hoje: string,
  manter?: number,
): { atuais: F[]; passadas: F[] } {
  const blocos: F[][] = [];
  for (const f of falas) {
    const ultimo = blocos.at(-1);
    const anterior = ultimo?.at(-1);
    if (ultimo && anterior && Date.parse(f.em) - Date.parse(anterior.em) < 15 * 60 * 1000) ultimo.push(f);
    else blocos.push([f]);
  }
  const atuais: F[] = [];
  const passadas: F[] = [];
  for (const b of blocos) {
    const ds = datasEscritas(b);
    const passado = ds.length > 0 && ds.every((d) => d < hoje) && !b.some((f) => manter != null && f.id === manter);
    (passado ? passadas : atuais).push(...b);
  }
  return { atuais, passadas };
}

/** "Gostaria de agendar de novo!", "marca novamente", "reserva outra vez" (issue #419). */
export function pediuDeNovo(textos: string[]): boolean {
  return textos.some((t) =>
    / (agend|marc|reserv|remarc)\w* (de novo|novamente|outra vez|denovo) /.test(` ${normalizarTexto(t)} `) ||
    / (de novo|novamente|denovo) (a|minha|aquela)? ?(passagem|reserva|vaga) /.test(` ${normalizarTexto(t)} `)
  );
}

/** O sentido que o cliente escreveu nas mensagens que citam SÓ aquele dia (null = não escreveu ou os dois). */
export function sentidoDoDiaEscrito(mensagens: MensagemDoCliente[], data: string | null | undefined): "ida" | "volta" | null {
  if (!data) return null;
  const doDia = mensagens.filter((m) => {
    const ds = datasEscritas([m]);
    return ds.length === 1 && ds[0] === data;
  });
  const t = doDia.map((m) => m.texto);
  // "vou voltar segunda-feira com vocês para São Luís" (o rótulo pega "volta", não "voltar")
  const voltar = t.some((x) => / (voltar|volto|voltando|retornar|retorno pra|retorno para) /.test(` ${normalizarTexto(x)} `));
  return sentidoEscrito(t) ?? (voltar ? "volta" : null);
}

/**
 * "Uma passagem na segunda pra ir e na terça pra volta" e a leitura trouxe só UMA viagem
 * (issue #415): monta a outra com o dia que o cliente escreveu depois. A Volta sai da cidade
 * para onde a Ida vai e desce no endereço de São Luís da Ida (embarque a confirmar); a Ida
 * busca no endereço de São Luís onde a Volta desce e desce na cidade de onde a Volta sai.
 * Só com um pedido lido, os dois sentidos falados e UM dia a mais escrito depois do lido.
 */
export function outraViagemDoPar<P extends PedidoDoPar>(pedidos: P[], mensagens: MensagemDoCliente[], hoje: string): P[] {
  if (pedidos.length !== 1) return pedidos;
  const [p] = pedidos;
  const textos = mensagens.map((m) => m.texto);
  if ((p.tipo ?? "passagem") === "encomenda" || !p.data || (p.direcao !== "ida" && p.direcao !== "volta")) return pedidos;
  if (!falouDasDuasViagens(textos)) return pedidos;
  const depois = datasEscritas(mensagens).filter((d) => d >= hoje && d > (p.data as string));
  if (depois.length !== 1) return pedidos;
  const ddmm = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  const deSaoLuis = [p.endereco, p.bairro].filter(Boolean).join(", ") || null;
  const outra: P = p.direcao === "ida"
    ? {
      ...p,
      data: depois[0],
      direcao: "volta",
      ponto: null,
      bairro: null,
      cidade_dita: cidadeDoInterior(p.desembarque),
      endereco: null,
      desembarque: deSaoLuis,
      duvida: `Volta de ${ddmm(depois[0])} pedida junto com a Ida de ${ddmm(p.data)}: sai da cidade da Ida e desce no endereço de São Luís; embarque a confirmar.`,
    }
    : {
      ...p,
      data: depois[0],
      direcao: "ida",
      ponto: null,
      cidade_dita: null,
      endereco: p.desembarque ?? null,
      bairro: null,
      desembarque: cidadeDoInterior(p.cidade_dita ?? p.endereco) === "pirapemas" ? "Pirapemas" : cidadeDoInterior(p.cidade_dita ?? p.endereco) === "cantanhede" ? "Cantanhede" : null,
      duvida: `Ida de ${ddmm(depois[0])} pedida junto com a Volta de ${ddmm(p.data)}: busca onde a Volta desce; confira o embarque.`,
    };
  return [p, outra];
}

/**
 * "Uma de Ida para Cantanhede e outra de volta" e a leitura trouxe DUAS viagens de dias
 * diferentes no MESMO sentido (o cliente colou o mesmo formulário duas vezes): a segunda é
 * a outra viagem, com embarque e desembarque trocados (issue #401). Só com exatamente duas
 * passagens; senão devolve a mesma lista.
 */
export function segundaViagemEhAOutra<P extends PedidoDoPar>(
  pedidos: P[],
  textos: string[],
  /** a conversa (cliente e equipe): "Na volta, onde lhe busco?" → a resposta é o embarque da Volta */
  falas: { quem: string; texto: string }[] = [],
): P[] {
  if (pedidos.length !== 2 || !falouDasDuasViagens(textos)) return pedidos;
  let [a, b] = [...pedidos].sort((x, y) => String(x.data ?? "").localeCompare(String(y.data ?? "")));
  const sentido = a.direcao;
  if ((a.tipo ?? "passagem") === "encomenda" || (b.tipo ?? "passagem") === "encomenda") return pedidos;
  if (!a.data || !b.data || (sentido !== "ida" && sentido !== "volta") || b.direcao !== sentido) return pedidos;
  const outro = sentido === "ida" ? "volta" : "ida";
  // a leitura já montou a viagem de VOLTA certa (desce onde a outra embarca), só com o rótulo
  // errado: "Na volta, onde lhe busco?" → "Lister Caldas" (issue #419). Troca só o sentido.
  const desceOndeAOutraSobe = (x: P, y: P) => mesmoLugar(x.desembarque, [y.endereco, y.bairro].filter(Boolean).join(" "));
  // o embarque respondeu à pergunta da equipe sobre a volta ("Na volta, onde lhe busco?")
  const respondeuAVolta = (x: P) => sentido === "ida" && embarqueRespondeuAVolta(x.endereco, falas);
  const voltaPelaResposta = respondeuAVolta(b) !== respondeuAVolta(a) ? (respondeuAVolta(b) ? b : a) : null;
  const jaDeVolta = voltaPelaResposta ?? (desceOndeAOutraSobe(b, a) && !desceOndeAOutraSobe(a, b))
    ? b
    : a.data === b.data && desceOndeAOutraSobe(a, b) && !desceOndeAOutraSobe(b, a)
    ? a
    : null;
  if (jaDeVolta) {
    if (jaDeVolta === a) [a, b] = [b, a];
    const paraVolta = outro === "volta";
    const cidade = cidadeDoInterior(b.endereco) ?? cidadeDoInterior(a.desembarque);
    const virada: P = {
      ...b,
      direcao: outro,
      ponto: paraVolta ? null : b.ponto ?? null,
      bairro: paraVolta ? null : b.bairro ?? null,
      cidade_dita: paraVolta ? (b.cidade_dita ?? cidade) : null,
      duvida: [b.duvida, `O cliente pediu ida e volta e a viagem de ${b.data!.split("-").reverse().slice(0, 2).join("/")} desce onde a outra embarca: é a ${paraVolta ? "Volta" : "Ida"}. Confira.`]
        .filter(Boolean)
        .join(" "),
    };
    return pedidos.map((p) => (p === b ? virada : p));
  }
  if (a.data === b.data) return pedidos;
  const deSaoLuis = [b.endereco, b.bairro].filter(Boolean).join(", ") || null;
  const virada: P = {
    ...b,
    direcao: outro,
    ponto: null,
    bairro: null,
    // Ida → Volta: sobe onde a Ida descia e desce no endereço de São Luís; Volta → Ida: o contrário
    endereco: b.desembarque ?? null,
    desembarque: outro === "volta" ? deSaoLuis : (b.endereco ?? null),
    cidade_dita: outro === "volta" ? (b.cidade_dita ?? null) : null,
    duvida: [b.duvida, `O cliente pediu ida e volta e as duas viagens vieram no mesmo sentido: a de ${b.data.split("-").reverse().slice(0, 2).join("/")} ficou na ${outro === "volta" ? "Volta" : "Ida"}, com embarque e desembarque trocados. Confira.`]
      .filter(Boolean)
      .join(" "),
  };
  return pedidos.map((p) => (p === b ? virada : p));
}

/**
 * O SENTIDO SAI DA ORDEM DAS PARADAS (dono, 14/11 — issues #406 e #407). A Ida sai de São Luís e
 * vai até Pirapemas; a Volta sai de Pirapemas e vai até São Luís, pelo mesmo caminho:
 *   São Luís → Bacabeira → Santa Rita → Entroncamento → Miranda → Matões → Cantanhede → Campestre → Pirapemas
 * Destino DEPOIS da origem nessa ordem = Ida; destino ANTES = Volta. "De Cantanhede pra Pirapemas" é
 * Ida (a Volta já passou por Cantanhede vinda de Pirapemas); "de Pirapemas pra Cantanhede" é Volta.
 * Só a origem: São Luís = Ida; Pirapemas/Cantanhede = Volta (o mais comum). Vale sobre o destino
 * sozinho ("pra Cantanhede" de quem sai de Pirapemas não é Ida).
 */
export const ORDEM_DA_IDA = ["sao luis", "bacabeira", "santa rita", "entroncamento", "miranda", "matoes", "cantanhede", "campestre", "pirapemas"] as const;
type Parada = (typeof ORDEM_DA_IDA)[number];

const NOME_DA_PARADA: Record<Parada, string> = {
  "sao luis": "São Luís",
  bacabeira: "Bacabeira",
  "santa rita": "Santa Rita",
  entroncamento: "Entroncamento",
  miranda: "Miranda do Norte",
  matoes: "Matões do Norte",
  cantanhede: "Cantanhede",
  campestre: "Campestre",
  pirapemas: "Pirapemas",
};

const PARADA = "(sao luis|slz|bacabeira|santa rita|entroncamento|miranda(?: do norte)?|matoes(?: do norte)?|cantanhede|campestre|pirapemas)";
// "pra", "pro", "para", "p/", "até" (issue #415: "de Cantanhede pro Marsil")
const PARA = "(?:pra|pro|para|p|a|ate|ir pra|ir pro|ir para)";
const RE_DE_PARA = new RegExp(` (?:de|saindo de|sair de|saio de|vindo de|venho de|daqui de) ${PARADA} ${PARA} ${PARADA} `);
/** origem do interior ou São Luís com destino QUALQUER (fora da rota: condomínio, bairro, casa de alguém) */
const RE_DE_PARA_LUGAR = new RegExp(` (?:de|saindo de|sair de|saio de|vindo de|venho de|daqui de) ${PARADA} ${PARA} [a-z]`);
const RE_PAR_COM_BARRA = new RegExp(` ${PARADA} qbarraq ${PARADA} `);
const RE_SO_ORIGEM = new RegExp(` (de|saindo de|sair de|saio de|vindo de|venho de|daqui de) ${PARADA} `);

function parada(t: string): Parada | null {
  const n = t.replace(/ do norte$/, "");
  if (n === "slz") return "sao luis";
  return (ORDEM_DA_IDA as readonly string[]).includes(n) ? (n as Parada) : null;
}

export type OrigemDoTrecho = {
  sentido: "ida" | "volta";
  /** de onde sai (parada da rota) */
  de: Parada;
  /** para onde vai, se disse */
  para: Parada | null;
};

/** O sentido do trecho pela ordem das paradas (null = mesma parada). */
export function sentidoDoTrecho(de: Parada, para: Parada): "ida" | "volta" | null {
  const a = ORDEM_DA_IDA.indexOf(de);
  const b = ORDEM_DA_IDA.indexOf(para);
  return a === b ? null : a < b ? "ida" : "volta";
}

/** Origem escrita numa frase: "de Cantanhede pra Pirapemas", "saindo de São Luís". "Sou de Pirapemas" sozinho não conta. */
export function origemEscrita(texto: string): OrigemDoTrecho | null {
  const n = ` ${normalizarTexto(texto)} `;
  // "Pirapemas/ São Luís", "São Luís x Cantanhede", "Cantanhede → São Luís": origem/destino (issue #419)
  const barra = ` ${normalizarTexto(String(texto ?? "").replace(/\s*(?:\/|->|→|\bx\b)\s*/gi, " qbarraq "))} `.match(RE_PAR_COM_BARRA);
  if (barra) {
    const de = parada(barra[1]);
    const para = parada(barra[2]);
    const sentido = de && para ? sentidoDoTrecho(de, para) : null;
    if (de && para && sentido) return { sentido, de, para };
  }
  const trecho = n.match(RE_DE_PARA);
  if (trecho) {
    const de = parada(trecho[1]);
    const para = parada(trecho[2]);
    const sentido = de && para ? sentidoDoTrecho(de, para) : null;
    if (de && para && sentido) return { sentido, de, para };
  }
  // "de Cantanhede pro Marsil": destino fora da rota = o lado de São Luís (issue #415)
  const lugar = n.match(RE_DE_PARA_LUGAR);
  if (lugar) {
    const de = parada(lugar[1]);
    if (de === "sao luis") return { sentido: "ida", de, para: null };
    if (de === "pirapemas" || de === "cantanhede") return { sentido: "volta", de, para: null };
  }
  // só a origem: precisa de "saindo/vindo de" ("de Pirapemas" sozinho pode ser "sou de Pirapemas")
  const so = n.match(RE_SO_ORIGEM);
  if (so && so[1] !== "de") {
    const de = parada(so[2]);
    if (de === "sao luis") return { sentido: "ida", de, para: null };
    if (de === "pirapemas" || de === "cantanhede") return { sentido: "volta", de, para: null };
  }
  return null;
}

const RE_IR_PARA_SAO_LUIS = / (ir|vou|vamos|indo) (em|pra|pro|para|a|ate|no|na) (sao luis|slz|s luis|sao luiz) /;
const RE_IR_PARA_O_INTERIOR = / (ir|vou|vamos|indo) (em|pra|pro|para|a|ate) (pirapemas|cantanhede) /;

export function sentidoEscrito(textos: string[]): "ida" | "volta" | null {
  const achados: ("ida" | "volta")[] = [];
  for (const t of textos) {
    const origem = origemEscrita(t);
    if (origem) {
      achados.push(origem.sentido);
      continue;
    }
    const n = ` ${normalizarTexto(t)} `;
    // "uma vaga para ir em S.Luís" é ir PARA São Luís = Volta; "pra ir pra Pirapemas" = Ida (issue #419)
    if (RE_IR_PARA_SAO_LUIS.test(n)) {
      achados.push("volta");
      continue;
    }
    if (RE_IR_PARA_O_INTERIOR.test(n)) {
      achados.push("ida");
      continue;
    }
    // "Volta na terça…", "a ida é segunda": o rótulo escrito diz o sentido (issue #415); os dois = nenhum
    const rotuloVolta = / volta /.test(n);
    const rotuloIda = / (ida|pra ir|para ir) /.test(n);
    if (rotuloVolta !== rotuloIda) {
      achados.push(rotuloVolta ? "volta" : "ida");
      continue;
    }
    // sem origem dita, o destino diz o sentido
    if (/ (pra|pro|para|p|ate|ir pra|ir pro|ir para) (sao luis|slz|s luis|sao luiz) /.test(n)) achados.push("volta");
    if (/ (pra|pro|para|p|ate|ir pra|ir pro|ir para) (pirapemas|cantanhede) /.test(n)) achados.push("ida");
  }
  return unico(achados);
}

const RESPOSTA_DE_SIM = /^(sim|isso|certo|exato|correto|isso mesmo|e isso|pode ser|ok|blz|beleza|s)\b/;

/**
 * O trecho pedido: o que o CLIENTE escreveu, ou o que a EQUIPE disse e ele confirmou logo
 * depois ("De pirapemas pra Cantanhede, certo?" → "Isso"). Vale o mais recente; sentidos
 * diferentes = null.
 */
export function origemDoPedido(falas: { quem: string; texto: string }[]): OrigemDoTrecho | null {
  const achadas: OrigemDoTrecho[] = [];
  for (let i = 0; i < falas.length; i++) {
    const m = falas[i];
    const origem = origemEscrita(m.texto);
    if (!origem) continue;
    if (m.quem === "cliente") {
      achadas.push(origem);
      continue;
    }
    if (m.quem !== "equipe") continue;
    for (let k = i + 1; k < falas.length && k <= i + 3; k++) {
      const r = falas[k];
      if (r.quem === "equipe") break;
      if (r.quem !== "cliente") continue;
      if (RESPOSTA_DE_SIM.test(normalizarTexto(r.texto))) achadas.push(origem);
      break;
    }
  }
  if (new Set(achadas.map((a) => a.sentido)).size !== 1) return null;
  return achadas.at(-1) ?? null;
}

/** Cidade de embarque da Volta (o ponto): Campestre vai no ponto Pirapemas; outra cidade do caminho, no Cantanhede (#326). */
export function pontoDaVoltaPelaOrigem(de: Parada): "pirapemas" | "cantanhede" | null {
  if (de === "pirapemas" || de === "campestre") return "pirapemas";
  if (de === "sao luis") return null;
  return "cantanhede";
}

const temANome = (texto: string | null | undefined, p: Parada) => normalizarTexto(texto ?? "").includes(p === "sao luis" ? "sao luis" : p);

/**
 * O pedido segue o trecho dito (issue #407): sentido pela ordem das paradas, embarque na cidade de
 * onde sai e desembarque na de destino. Volta: o ponto é a cidade (Campestre = Pirapemas; outras do
 * caminho = Cantanhede, com a cidade no endereço) e o bairro de São Luís lido por engano sai. Ida
 * saindo de uma cidade do interior ("de Cantanhede pra Pirapemas"): ponto Outros com a cidade.
 */
export function pedidosPelaOrigem<P extends PedidoDoPar>(pedidos: P[], origem: OrigemDoTrecho | null): P[] {
  if (!origem) return pedidos;
  // várias viagens (Ida e Volta, dois dias): o trecho dito vale para a do DIA em que foi escrito
  // (pedidosPeloSentidoDoDia), não para todas — "De Pirapemas a São Luís… dia 15" não vira a Ida
  // do dia 14 em Volta (issue #419)
  const viagens = new Set(pedidos.filter((p) => (p.tipo ?? "passagem") !== "encomenda").map((p) => `${p.data}|${p.direcao}`));
  if (viagens.size > 1) return pedidos;
  let mudou = false;
  const destino = origem.para ? NOME_DA_PARADA[origem.para] : null;
  const nomeDe = NOME_DA_PARADA[origem.de];
  const out = pedidos.map((p) => {
    if ((p.tipo ?? "passagem") === "encomenda") return p;
    const naCidade = (end: string | null | undefined) => (temANome(end, origem.de) ? (end ?? null) : [nomeDe, end].filter(Boolean).join(", "));
    let novo: P | null = null;
    if (origem.sentido === "volta") {
      const ponto = pontoDaVoltaPelaOrigem(origem.de);
      const doCaminho = origem.de !== "pirapemas" && origem.de !== "cantanhede";
      if (p.direcao !== "volta" || p.bairro || (ponto && cidadeDaVoltaTexto(p.cidade_dita) !== ponto)) {
        novo = {
          ...p,
          direcao: "volta",
          ponto: null,
          bairro: null,
          cidade_dita: ponto,
          endereco: doCaminho ? naCidade(p.endereco) : (p.endereco ?? null),
          desembarque: p.desembarque || destino,
        };
      }
    } else if (origem.de === "sao luis") {
      if (p.direcao !== "ida") {
        novo = { ...p, direcao: "ida", ponto: null, cidade_dita: null, desembarque: p.desembarque || destino };
      }
    } else if (p.direcao !== "ida" || p.ponto !== "outro" || p.bairro) {
      // Ida que sobe numa cidade do interior: ponto Outros, com a cidade no endereço
      novo = { ...p, direcao: "ida", ponto: "outro", bairro: null, cidade_dita: null, endereco: naCidade(p.endereco), desembarque: p.desembarque || destino };
    }
    if (!novo) return p;
    mudou = true;
    const trecho = `${nomeDe}${destino ? ` para ${destino}` : ""}`;
    return {
      ...novo,
      duvida: [p.duvida, `Trecho ${trecho}: é a ${origem.sentido === "ida" ? "Ida" : "Volta"} (pela ordem das paradas).`].filter(Boolean).join(" "),
    };
  });
  return mudou ? out : pedidos;
}

const RE_CIDADE_DO_INTERIOR = /(?:^| )(pirapemas|pirapema|piraprmas|cantanhede|catanhede|cantanhed|cantanedi)(?: |$)/;
/** Antes da cidade, na mesma linha: é o destino ("vou pra", "fico em", "destino") ou o nome de uma rua/residencial. */
const RE_CIDADE_E_DESTINO = / (pra|pro|para|p|ate|destino|vou|vamos|ir|ficar|fico|fica|desco|descer|deixar|chegar|chego|volto|voltar|sou|natural|morava|familia|mae|pai) /;
const RE_NOME_DE_RUA = / (residencial|conjunto|condominio|vila|rua|avenida|av|travessa|tv|bairro|loteamento) $/;
const RE_CAMPO_DE_DESTINO = / (ficar|fica|fico|desembarque|desembarcar|destino|desce|descer|deixar|vai ficar) /;
const RE_MARCA_DE_ENDERECO = / (rua|r|avenida|av|travessa|tv|praca|povoado|endereco|centro|bairro|perto|proximo|px|prox|casa|esquina|numero) /;

/**
 * A cidade do interior escrita como o lugar do ENDEREÇO do cliente (issue #419): "Rua Newton
 * Belo 233 - Centro / Pirapemas (px ao hospital)", "Endereço Rua do Bacuri" + "Cantanhede".
 * Só vale com uma marca de endereço na mesma linha, na linha de cima ou na mensagem anterior
 * (cidade sozinha), e NUNCA como destino ("vou pra Pirapemas", "fico em Cantanhede") nem como
 * nome de rua/residencial ("Residencial Pirapemas"). As duas cidades = null.
 */
export function cidadeDoEnderecoEscrito(textos: string[]): { cidade: "pirapemas" | "cantanhede"; linha: string } | null {
  const achadas = new Map<string, string>();
  for (let i = 0; i < textos.length; i++) {
    const linhas = String(textos[i] ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
    for (let k = 0; k < linhas.length; k++) {
      const n = ` ${normalizarTexto(linhas[k])} `;
      const m = n.match(RE_CIDADE_DO_INTERIOR);
      if (!m) continue;
      const antes = ` ${n.slice(0, m.index! + 1).trim()} `;
      if (RE_CIDADE_E_DESTINO.test(antes) || RE_NOME_DE_RUA.test(antes)) continue;
      // formulário: a resposta de "Onde você vai ficar? (Cidade, Rua…)" é o DESTINO (issue #419)
      if (linhas.slice(Math.max(0, k - 3), k).some((l) => RE_CAMPO_DE_DESTINO.test(` ${normalizarTexto(l)} `))) continue;
      const cidade = m[1].startsWith("pira") ? "pirapemas" : "cantanhede";
      const soACidade = normalizarTexto(linhas[k]).split(" ").length <= 2;
      let linha: string | null = null;
      const acima = k > 0 ? linhas[k - 1] : null;
      const acimaEhEndereco = !!acima && RE_MARCA_DE_ENDERECO.test(` ${normalizarTexto(acima)} `) && !RE_CIDADE_E_DESTINO.test(` ${normalizarTexto(acima)} `);
      if (acimaEhEndereco) linha = `${acima} — ${linhas[k]}`;
      else if (RE_MARCA_DE_ENDERECO.test(n) && !soACidade) linha = linhas[k];
      else if (soACidade && linhas.length === 1 && i > 0) {
        const anterior = String(textos[i - 1] ?? "").trim();
        if (RE_MARCA_DE_ENDERECO.test(` ${normalizarTexto(anterior)} `) && !RE_CIDADE_DO_INTERIOR.test(normalizarTexto(anterior))) {
          linha = `${anterior} — ${linhas[k]}`;
        }
      }
      if (linha) achadas.set(cidade, linha);
    }
  }
  if (achadas.size !== 1) return null;
  const [[cidade, linha]] = [...achadas];
  return { cidade: cidade as "pirapemas" | "cantanhede", linha: linha.replace(/^endere[cç]o:?\s*/i, "").slice(0, 200) };
}

/**
 * Ida com busca em casa, mas o endereço é de Pirapemas/Cantanhede: não existe busca em casa em
 * São Luís num endereço do interior — é a Volta saindo de lá (issue #419). O que foi lido como
 * embarque em São Luís, quando o leitor pôs a cidade como destino, é onde o cliente DESCE.
 */
export function voltaPeloEnderecoDoInterior<P extends PedidoDoPar>(
  p: P,
  achado: { cidade: "pirapemas" | "cantanhede"; linha: string },
  porQue: string,
): P {
  const destinoEraACidade = !p.desembarque || cidadeDoInterior(p.desembarque) === achado.cidade;
  const lidoEhOEndereco = mesmoLugar(p.endereco, achado.linha) || cidadeDoInterior(p.endereco) === achado.cidade;
  const desceEmSaoLuis = lidoEhOEndereco ? null : [p.endereco, p.bairro].filter(Boolean).join(", ") || null;
  return {
    ...p,
    direcao: "volta",
    ponto: null,
    bairro: null,
    cidade_dita: achado.cidade,
    endereco: lidoEhOEndereco ? (p.endereco ?? achado.linha) : achado.linha,
    desembarque: destinoEraACidade ? desceEmSaoLuis : (p.desembarque ?? null),
    duvida: [p.duvida, `${porQue}: é a Volta saindo de ${achado.cidade === "pirapemas" ? "Pirapemas" : "Cantanhede"}, não busca em casa em São Luís.`]
      .filter(Boolean)
      .join(" "),
  };
}

function cidadeDaVoltaTexto(v: string | null | undefined): string | null {
  const n = normalizarTexto(v ?? "");
  return n.includes("pirapemas") ? "pirapemas" : n.includes("cantanhede") ? "cantanhede" : null;
}

// ---------------------------------------------------------------------------
// Dia
// ---------------------------------------------------------------------------

// formas aceitas (com os erros comuns); "quarto", "quinto" e "Domingos" (nome) NÃO são dia
const SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sesta: 5, sabado: 6, sabdo: 6, sabadu: 6,
};

// Mensagem sobre encomenda é outro pedido: o dia dela não é o da passagem ("pra pegar hoje a
// encomenda" de manhã não é o dia das passagens pedidas à tarde — issue #451).
const FALA_DE_ENCOMENDA = /\b(encomendas?|pacotes?|mercadorias?)\b/;

/** As mensagens do pedido de passagem, sem as que falam de encomenda (issue #451). */
export function semFalaDeEncomenda(mensagens: MensagemDoCliente[]): MensagemDoCliente[] {
  return mensagens.filter((m) => !FALA_DE_ENCOMENDA.test(normalizarTexto(String(m.texto ?? "").toLowerCase())));
}

/**
 * Datas que o cliente escreveu, contadas do DIA DE CADA MENSAGEM: hoje, amanhã
 * ("amnh", "amh"), depois de amanhã, dia da semana ("sexta", "sesta"), "dia 14", "14/11".
 */
export function datasEscritas(mensagens: MensagemDoCliente[]): string[] {
  const out: string[] = [];
  for (const m of mensagens) {
    const base = diaDe(m.em);
    const cru = String(m.texto ?? "").toLowerCase();
    for (const [, d, mes] of cru.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)) {
      const dia = Number(d), mm = Number(mes);
      if (dia >= 1 && dia <= 31 && mm >= 1 && mm <= 12) {
        let ano = Number(base.slice(0, 4));
        if (mm < Number(base.slice(5, 7)) - 6) ano += 1; // dezembro → janeiro
        out.push(`${ano}-${String(mm).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
      }
    }
    const n = ` ${normalizarTexto(cru)} `;
    if (/ depois de (amanha|amnh|amh) /.test(n)) out.push(somar(base, 2));
    // "pra manhã", "para a manhã" = amanhã (erro de escrita comum); "de manhã" é o turno, não o dia (issue #419)
    else if (/ (amanha|amnh|amh|amanhan) /.test(n) || / (pra|pro|para|p) (a )?manha /.test(n)) out.push(somar(base, 1));
    // "agora à tarde", "essa tarde", "hoje à tarde" = hoje
    if (/ (hoje|hj|agora a tarde|agora de tarde|agora tarde|essa tarde|esta tarde|nessa tarde|agora pela manha) /.test(n)) out.push(base);
    for (const [, d] of n.matchAll(/ dia (\d{1,2}) /g)) {
      const dia = Number(d);
      if (dia < 1 || dia > 31) continue;
      let [ano, mm] = [Number(base.slice(0, 4)), Number(base.slice(5, 7))];
      if (dia < Number(base.slice(8, 10))) {
        mm += 1;
        if (mm > 12) [ano, mm] = [ano + 1, 1];
      }
      out.push(`${ano}-${String(mm).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
    }
    for (const palavra of n.trim().split(" ")) {
      const alvo = SEMANA[palavra];
      if (alvo == null) continue;
      let falta = (alvo - diaDaSemana(base) + 7) % 7;
      if (falta === 0) falta = 7; // "sexta" dito numa sexta é a próxima; o mesmo dia é "hoje"
      out.push(somar(base, falta));
    }
  }
  return [...new Set(out)].sort();
}

// ---------------------------------------------------------------------------
// Quantidade
// ---------------------------------------------------------------------------

const NUMERO: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

/** "duas passagens", "3 pessoas", "uma vaga". Números diferentes = null. */
export function quantidadeEscrita(textos: string[]): number | null {
  const achados: number[] = [];
  for (const t of textos) {
    const n = ` ${normalizarTexto(t)} `;
    // "um lugar perto do posto" não é quantidade: só passagem, pessoa, vaga, passageiro, adulto
    for (const [, q] of n.matchAll(/ (\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez) (passagens?|pessoas?|vagas?|passageiros?|adultos?) /g)) {
      const v = /^\d+$/.test(q) ? Number(q) : NUMERO[q];
      if (v >= 1 && v <= 31) achados.push(v);
    }
  }
  return unico(achados);
}

// ---------------------------------------------------------------------------
// Ponto de embarque (Ida) e bairro
// ---------------------------------------------------------------------------

/** rodoviária, retorno, buscar em casa, Outros (aeroporto, BR, Posto Carone). Vários = null. */
const RE_RETORNO_E_VIAGEM =
  / (e retorno|retorno (no|na|dia|em|segunda|terca|quarta|quinta|sexta|sabado|domingo|amanha|depois|semana|de manha|a tarde|pra|para)) /;

export function pontoEscrito(textos: string[], pontos: string[]): string | null {
  const achados: string[] = [];
  for (const t of textos) {
    // pergunta ("Desce na rodoviária ou na casa?") e fala de onde DESCE não dizem onde ele embarca (issue #401)
    if (t.includes("?")) continue;
    const n = ` ${normalizarTexto(t)} `;
    if (/ (desco|desce|descer|desembarco|desembarque|me deixa|deixar|deixa) /.test(n)) continue;
    // "De Pirapemas a São Luís! Ficaremos no retorno": indo PARA São Luís, o ponto é onde desce (issue #419)
    if (origemEscrita(t)?.sentido === "volta" || RE_IR_PARA_SAO_LUIS.test(n)) continue;
    if (/ (rodoviaria|rodovaria|rodoviria|rodov|terminal) /.test(n)) achados.push("rodoviaria");
    // "parada das vans" é o Retorno das Vans, não a rodoviária (dono, 11/11 — issue #333)
    // "e retorno segunda-feira de manhã" é a viagem de volta, não o ponto Retorno (issue #419)
    const retornoEhViagem = RE_RETORNO_E_VIAGEM.test(n);
    if ((!retornoEhViagem && / retorno /.test(n)) || / (parada|ponto) das? vans? /.test(n)) achados.push("retorno");
    else if (/ (aeroporto|posto carone|carone|br) /.test(n)) achados.push("outro");
    // "estou em casa" no meio da conversa não é pedido de busca: só com buscar/pegar ou numa resposta curta
    const curta = n.trim().split(" ").length <= 5;
    if (/ (buscar|busca|pegar|pega|me pega|apanhar)( (em|na|la))? (casa|minha casa) /.test(n) || (curta && / em casa /.test(n))) {
      achados.push("busca");
    }
  }
  const ponto = unico(achados);
  return ponto && pontos.includes(ponto) ? ponto : null;
}

/**
 * Bairro da tabela que o cliente escreveu. Nome de duas palavras ou mais vale em
 * qualquer frase; de uma palavra só ("Turu"), só numa resposta curta — "rua do Turu"
 * não é o bairro Turu. Bairros diferentes = null.
 */
export function bairroEscrito<T extends { neighborhood: string }>(textos: string[], tabela: T[]): T | null {
  const achados: T[] = [];
  for (const t of textos) {
    const n = ` ${normalizarTexto(t)} `;
    const curta = n.trim().split(" ").length <= 4;
    let melhor: T | null = null;
    for (const b of tabela) {
      const nome = normalizarTexto(b.neighborhood);
      if (!nome || !n.includes(` ${nome} `)) continue;
      if (nome.split(" ").length < 2 && !curta) continue;
      if (!melhor || nome.length > normalizarTexto(melhor.neighborhood).length) melhor = b;
    }
    if (melhor) achados.push(melhor);
  }
  const nomes = [...new Set(achados.map((b) => b.neighborhood))];
  return nomes.length === 1 ? achados[0] : null;
}

// ---------------------------------------------------------------------------
// Conferência do pedido
// ---------------------------------------------------------------------------

export type CamposDoPedido = {
  tipo?: string | null;
  data?: string | null;
  direcao?: string | null;
  ponto?: string | null;
  bairro?: string | null;
  quantidade?: number | null;
  duvida?: string | null;
};

/**
 * Completa o que a IA deixou vazio com o que o cliente escreveu e avisa o que não
 * bate. `pedidosNoSentido`: quantos pedidos a IA leu (dois passageiros = dois pedidos;
 * a quantidade dita vale para o total, então só completa quando há um pedido só).
 */
export function conferirPeloCliente<P extends CamposDoPedido>(
  p: P,
  mensagens: MensagemDoCliente[],
  ctx: {
    hoje: string;
    pontosIda: string[];
    bairros: { neighborhood: string }[];
    pedidosLidos: number;
    /** origem do trecho (escrita ou confirmada com a equipe): decide o sentido (issues #406 e #407) */
    origem?: OrigemDoTrecho | null;
    /** sentido escrito pela equipe na marca do Agendado (issue #420): vence o do cliente */
    sentidoDaEquipe?: "ida" | "volta" | null;
  },
): { pedido: P; completados: string[]; avisos: string[] } {
  const textos = mensagens.map((m) => m.texto);
  const pedido = { ...p };
  const completados: string[] = [];
  const avisos: string[] = [];
  if (pedido.tipo === "encomenda") return { pedido, completados, avisos };

  // só o que foi escrito no pedido daquele dia: o trecho de ontem era de outra viagem (issue #419)
  const sentido = ctx.sentidoDaEquipe ?? ctx.origem?.sentido ?? sentidoEscrito(falasDoDia(mensagens, p.data).map((m) => m.texto));
  if (!pedido.direcao && sentido) {
    pedido.direcao = sentido;
    completados.push(`sentido ${sentido}`);
  } else if (pedido.direcao && sentido && pedido.direcao !== sentido && ctx.pedidosLidos === 1) {
    avisos.push(`o cliente escreveu ${sentido === "volta" ? "Volta (pra São Luís)" : "Ida (saindo de São Luís)"}`);
  }

  const datas = datasEscritas(semFalaDeEncomenda(mensagens)).filter((d) => d >= ctx.hoje);
  if (!pedido.data && datas.length === 1) {
    pedido.data = datas[0];
    completados.push(`dia ${datas[0].split("-").reverse().slice(0, 2).join("/")}`);
  } else if (pedido.data && datas.length && !datas.includes(pedido.data)) {
    avisos.push(`o cliente escreveu o dia ${datas.map((d) => d.split("-").reverse().slice(0, 2).join("/")).join(" ou ")}`);
  }

  const q = quantidadeEscrita(textos);
  if (q != null && ctx.pedidosLidos === 1) {
    if (!pedido.quantidade) {
      pedido.quantidade = q;
      completados.push(`${q} passagem(ns)`);
    } else if (pedido.quantidade !== q) {
      avisos.push(`o cliente escreveu ${q} passagem(ns)`);
    }
  }

  if ((pedido.direcao ?? "") === "ida") {
    const ponto = pontoEscrito(textos, ctx.pontosIda);
    if (!pedido.ponto && ponto) {
      pedido.ponto = ponto;
      completados.push(`ponto ${ponto}`);
    } else if (pedido.ponto && ponto && pedido.ponto !== ponto && ctx.pedidosLidos === 1) {
      avisos.push(`o cliente escreveu o embarque ${ponto}`);
    }
    const bairro = bairroEscrito(textos, ctx.bairros);
    if (bairro && (pedido.ponto === "busca" || !pedido.ponto)) {
      if (!pedido.bairro) {
        pedido.bairro = bairro.neighborhood;
        completados.push(`bairro ${bairro.neighborhood}`);
      } else if (normalizarTexto(pedido.bairro) !== normalizarTexto(bairro.neighborhood) && ctx.pedidosLidos === 1) {
        avisos.push(`o cliente escreveu o bairro ${bairro.neighborhood}`);
      }
    }
  }

  const notas = [
    completados.length ? `Completado pelo que o cliente escreveu: ${completados.join(", ")}.` : "",
    avisos.length ? `Conferir: ${avisos.join("; ")}.` : "",
  ].filter(Boolean).join(" ");
  if (notas) pedido.duvida = [pedido.duvida, notas].filter(Boolean).join(" ").slice(0, 400);
  return { pedido, completados, avisos };
}

// ---------------------------------------------------------------------------
// Conferência final (issue #309)
// ---------------------------------------------------------------------------

const ddmm = (d: string) => d.split("-").reverse().slice(0, 2).join("/");

/**
 * A ÚLTIMA trava, com a reserva PRONTA (depois de todas as regras que mexem nela:
 * troca de dia, bairro, cidade, costume): ainda bate com o que o cliente escreveu?
 * Devolve o que não bate; vazio = pode gravar. Pega o erro de qualquer regra,
 * inclusive das que ainda vão ser criadas. Só compara o que o cliente escreveu de
 * forma clara; o que ele não escreveu não conta contra.
 */
export function conferenciaFinal(
  r: { type?: string | null; trip_date: string; direction: string; quantity?: number | null; route_point_code?: string | null },
  mensagens: MensagemDoCliente[],
  ctx: {
    hoje: string;
    pedidosLidos: number;
    cidadeEscrita?: string | null;
    /** datas de perguntas da equipe que o cliente confirmou ("A ida é sábado, certo?" → "Isso") — issue #335 */
    datasConfirmadas?: string[];
    /** origem do trecho: decide o sentido; "pra Cantanhede" de quem sai de Pirapemas não contradiz (issues #406 e #407) */
    origem?: OrigemDoTrecho | null;
    /** sentido escrito pela equipe na marca do Agendado (issue #420): vence o do cliente */
    sentidoDaEquipe?: "ida" | "volta" | null;
  },
): string[] {
  if (r.type === "encomenda") return [];
  const textos = mensagens.map((m) => m.texto);
  if (ctx.origem?.sentido === "volta") ctx = { ...ctx, cidadeEscrita: pontoDaVoltaPelaOrigem(ctx.origem.de) };
  const naoBate: string[] = [];

  const datas = [...new Set([...datasEscritas(semFalaDeEncomenda(mensagens)), ...(ctx.datasConfirmadas ?? [])])]
    .filter((d) => d >= ctx.hoje)
    .sort();
  if (datas.length && !datas.includes(r.trip_date)) {
    naoBate.push(`o cliente escreveu o dia ${datas.map(ddmm).join(" ou ")} e a reserva ficou para ${ddmm(r.trip_date)}`);
  }

  const sentido = ctx.sentidoDaEquipe ?? ctx.origem?.sentido ?? sentidoEscrito(falasDoDia(mensagens, r.trip_date).map((m) => m.texto));
  if (sentido && ctx.pedidosLidos === 1 && sentido !== r.direction) {
    naoBate.push(`o cliente escreveu ${sentido === "volta" ? "Volta (pra São Luís)" : "Ida (saindo de São Luís)"} e a reserva ficou na ${r.direction === "volta" ? "Volta" : "Ida"}`);
  }
  // vários pedidos: viagem no sentido que o cliente NÃO pediu (e sem falar em volta) não entra calada (issue #351)
  // só valem as mensagens sem dia ou com o dia DESTA viagem ("de Pirapemas a São Luís… dia 15" é da do dia 15)
  const doDia = mensagens.filter((m) => {
    const ds = datasEscritas([m]);
    return !ds.length || ds.includes(r.trip_date);
  });
  const sentidoDoDia = ctx.sentidoDaEquipe ?? sentidoEscrito(doDia.map((m) => m.texto));
  if (sentidoDoDia && ctx.pedidosLidos > 1 && sentidoDoDia !== r.direction && !falouDasDuasViagens(textos)) {
    naoBate.push(`o cliente só pediu a ${sentidoDoDia === "volta" ? "Volta" : "Ida"}; a ${r.direction === "volta" ? "Volta" : "Ida"} não foi pedida`);
  }

  const q = quantidadeEscrita(textos);
  if (q != null && ctx.pedidosLidos === 1 && (r.quantity ?? 1) !== q) {
    naoBate.push(`o cliente escreveu ${q} passagem(ns) e a reserva ficou com ${r.quantity ?? 1}`);
  }

  // "Aguardo vcs no retorno": o Retorno das Vans é em São Luís — não é Volta (issue #419)
  if (r.direction === "volta" && pontoEscrito(falasDoDia(mensagens, r.trip_date).map((m) => m.texto), ["retorno"]) === "retorno") {
    naoBate.push("o cliente vai esperar no Retorno (São Luís) e a reserva ficou na Volta");
  }
  if (r.direction === "volta" && ctx.cidadeEscrita && r.route_point_code && r.route_point_code !== ctx.cidadeEscrita) {
    naoBate.push(`o cliente escreveu ${ctx.cidadeEscrita} e a Volta ficou saindo de ${r.route_point_code}`);
  }
  return naoBate;
}

// ---------------------------------------------------------------------------
// Pergunta da equipe → resposta do cliente (issue #320)
// ---------------------------------------------------------------------------

/** Mensagem do pedido com quem escreveu (cliente ou equipe). */
export type FalaDoPedido = { quem: string; texto: string; em: string };

const com = (t: string) => ` ${normalizarTexto(t)} `;
const PERGUNTA_DE_EMBARQUE =
  / (busc\w*|peg\w*|embarc\w*|aonde|onde (voce|vc|tu|a senhora|o senhor) (esta|ta|fica|mora|vai estar)|de onde) /;
const PERGUNTA_DE_DESEMBARQUE = / (desc\w*|desembarc\w*|deix\w*|destino|pra onde|para onde) /;
const FALA_DE_DESEMBARQUE = / (desco|desce|descer|deixa|deixar|me deixe|destino|vou pra|vou para) /;
const SEM_SENTIDO = new Set(["a", "o", "as", "os", "da", "de", "do", "das", "dos", "na", "no", "nas", "nos", "em", "e", "pra", "para"]);
const nucleoDe = (t: string) =>
  normalizarTexto(t)
    .split(" ")
    .filter((p) => p && !SEM_SENTIDO.has(p))
    .join(" ");

/**
 * Sobre o que era a última pergunta da equipe antes da mensagem `i` do cliente:
 * embarque ("Te buscamos aonde?") ou desembarque ("Desce onde?"). Olha até 3 mensagens
 * da equipe em 30 min; confirmação sem assunto ("Na usina certo?") passa para a anterior.
 */
export function assuntoDaResposta(conversa: FalaDoPedido[], i: number): "embarque" | "desembarque" | null {
  let vistas = 0;
  const quando = Date.parse(conversa[i]?.em ?? "");
  for (let j = i - 1; j >= 0 && vistas < 3; j--) {
    const m = conversa[j];
    if (m.quem !== "equipe") continue;
    vistas++;
    if (Number.isFinite(quando) && quando - Date.parse(m.em) > 30 * 60 * 1000) break;
    if (!m.texto.includes("?")) continue;
    const t = com(m.texto);
    if (PERGUNTA_DE_DESEMBARQUE.test(t)) return "desembarque";
    if (PERGUNTA_DE_EMBARQUE.test(t)) return "embarque";
  }
  return null;
}

/**
 * O desembarque que o leitor gravou saiu de uma resposta do cliente a uma pergunta
 * sobre o EMBARQUE (e ele não falou em descer)? Então é embarque (issue #320).
 */
export function desembarqueEraEmbarque(desembarque: string | null | undefined, conversa: FalaDoPedido[]): boolean {
  const palavras = nucleoDe(String(desembarque ?? "")).split(" ").filter((p) => p.length >= 3);
  if (!palavras.length) return false;
  for (let i = conversa.length - 1; i >= 0; i--) {
    const m = conversa[i];
    if (m.quem !== "cliente") continue;
    const ditas = new Set(normalizarTexto(m.texto).split(" "));
    const iguais = palavras.filter((p) => ditas.has(p)).length;
    if (iguais / palavras.length < 0.6) continue;
    if (FALA_DE_DESEMBARQUE.test(com(m.texto))) return false;
    return assuntoDaResposta(conversa, i) === "embarque";
  }
  return false;
}

/**
 * Sugestões da equipe que o cliente recusou: "Na usina, certo?" → "Não". Devolve o
 * núcleo da sugestão ("usina"). "Sim"/"isso" confirma e não entra.
 */
export function sugestoesRecusadas(conversa: FalaDoPedido[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < conversa.length; i++) {
    const m = conversa[i];
    if (m.quem !== "equipe") continue;
    const s = m.texto.trim().match(/^(.{3,60}?)[,\s]*(certo|né|ne|correto|confere|isso|ok|é isso)\s*\?+\s*$/i);
    if (!s) continue;
    const nucleo = nucleoDe(s[1]);
    if (nucleo.length < 3) continue;
    for (let k = i + 1; k < conversa.length && k <= i + 4; k++) {
      const r = conversa[k];
      if (r.quem === "equipe") break;
      if (r.quem !== "cliente") continue;
      const t = normalizarTexto(r.texto);
      if (/^(sim|isso|certo|exato|correto|e sim|isso mesmo|ok)\b/.test(t)) break;
      if (/^(nao|n)\b/.test(t)) {
        out.push(nucleo);
        break;
      }
    }
  }
  return [...new Set(out)];
}

/** Tira do embarque os trechos (separados por vírgula) que são uma sugestão recusada. */
export function semSugestoesRecusadas(endereco: string, recusadas: string[]): { texto: string; tirou: string[] } {
  const tirou: string[] = [];
  const partes = endereco.split(/\s*,\s*/).filter((p) => {
    const n = nucleoDe(p);
    const recusada = recusadas.find((r) => n === r);
    if (recusada) tirou.push(p.trim());
    return !recusada;
  });
  return { texto: partes.join(", ").trim(), tirou };
}

// ---------------------------------------------------------------------------
// Datas confirmadas e dia sem pedido (issue #335)
// ---------------------------------------------------------------------------

const RESPOSTA_SIM = /^(sim|isso|certo|exato|correto|isso mesmo|e isso|pode ser|pode|ok|blz|beleza|s)\b/;

/**
 * Datas de uma pergunta da equipe que o cliente confirmou: "A ida será no sábado,
 * certo?" → "Isso" vale como se ele tivesse escrito "sábado". Conta do dia da pergunta.
 */
export function datasConfirmadas(falas: FalaDoPedido[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < falas.length; i++) {
    const m = falas[i];
    if (m.quem !== "equipe" || !m.texto.includes("?")) continue;
    const ds = datasEscritas([{ texto: m.texto, em: m.em }]);
    if (!ds.length) continue;
    for (let k = i + 1; k < falas.length && k <= i + 3; k++) {
      const r = falas[k];
      if (r.quem === "equipe") break;
      if (r.quem !== "cliente") continue;
      if (RESPOSTA_SIM.test(normalizarTexto(r.texto))) out.push(...ds);
      break;
    }
  }
  return [...new Set(out)].sort();
}

/**
 * Dias que o cliente pediu (escreveu ou confirmou) e que não viraram pedido lido nem
 * reserva: a leitura deixou um pedido de fora (issue #335).
 */
export function datasSemPedido(
  datasDoCliente: string[],
  datasDosPedidos: (string | null | undefined)[],
  datasJaReservadas: string[],
  hoje: string,
): string[] {
  const cobertas = new Set([...datasDosPedidos.filter(Boolean) as string[], ...datasJaReservadas]);
  return [...new Set(datasDoCliente)].filter((d) => d >= hoje && !cobertas.has(d)).sort();
}
