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
};

/**
 * "Uma de Ida para Cantanhede e outra de volta" e a leitura trouxe DUAS viagens de dias
 * diferentes no MESMO sentido (o cliente colou o mesmo formulário duas vezes): a segunda é
 * a outra viagem, com embarque e desembarque trocados (issue #401). Só com exatamente duas
 * passagens; senão devolve a mesma lista.
 */
export function segundaViagemEhAOutra<P extends PedidoDoPar>(pedidos: P[], textos: string[]): P[] {
  if (pedidos.length !== 2 || !falouDasDuasViagens(textos)) return pedidos;
  const [a, b] = [...pedidos].sort((x, y) => String(x.data ?? "").localeCompare(String(y.data ?? "")));
  const sentido = a.direcao;
  if ((a.tipo ?? "passagem") === "encomenda" || (b.tipo ?? "passagem") === "encomenda") return pedidos;
  if (!a.data || !b.data || a.data === b.data || (sentido !== "ida" && sentido !== "volta") || b.direcao !== sentido) return pedidos;
  const outro = sentido === "ida" ? "volta" : "ida";
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

export function sentidoEscrito(textos: string[]): "ida" | "volta" | null {
  const achados: ("ida" | "volta")[] = [];
  for (const t of textos) {
    const n = ` ${normalizarTexto(t)} `;
    // "sou de Pirapemas" não diz o sentido: só "saindo de…" ou "de X pra Y"
    if (
      / (pra|para|p|ate|ir pra|ir para) (sao luis|slz) /.test(n) ||
      / (saindo de|sair de|saio de|vindo de|venho de) (pirapemas|cantanhede) /.test(n) ||
      / de (pirapemas|cantanhede) (pra|para|a|ate) /.test(n)
    ) {
      achados.push("volta");
    }
    if (
      / (pra|para|p|ate|ir pra|ir para) (pirapemas|cantanhede) /.test(n) ||
      / (saindo de|sair de|saio de) (sao luis|slz) /.test(n) ||
      / de (sao luis|slz) (pra|para|a|ate) /.test(n)
    ) {
      achados.push("ida");
    }
  }
  return unico(achados);
}

// ---------------------------------------------------------------------------
// Dia
// ---------------------------------------------------------------------------

// formas aceitas (com os erros comuns); "quarto", "quinto" e "Domingos" (nome) NÃO são dia
const SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sesta: 5, sabado: 6, sabdo: 6, sabadu: 6,
};

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
    else if (/ (amanha|amnh|amh|amanhan) /.test(n)) out.push(somar(base, 1));
    if (/ (hoje|hj) /.test(n)) out.push(base);
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
export function pontoEscrito(textos: string[], pontos: string[]): string | null {
  const achados: string[] = [];
  for (const t of textos) {
    // pergunta ("Desce na rodoviária ou na casa?") e fala de onde DESCE não dizem onde ele embarca (issue #401)
    if (t.includes("?")) continue;
    const n = ` ${normalizarTexto(t)} `;
    if (/ (desco|desce|descer|desembarco|desembarque|me deixa|deixar|deixa) /.test(n)) continue;
    if (/ (rodoviaria|rodovaria|rodoviria|rodov|terminal) /.test(n)) achados.push("rodoviaria");
    // "parada das vans" é o Retorno das Vans, não a rodoviária (dono, 11/11 — issue #333)
    if (/ retorno | (parada|ponto) das? vans? /.test(n)) achados.push("retorno");
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
  ctx: { hoje: string; pontosIda: string[]; bairros: { neighborhood: string }[]; pedidosLidos: number },
): { pedido: P; completados: string[]; avisos: string[] } {
  const textos = mensagens.map((m) => m.texto);
  const pedido = { ...p };
  const completados: string[] = [];
  const avisos: string[] = [];
  if (pedido.tipo === "encomenda") return { pedido, completados, avisos };

  const sentido = sentidoEscrito(textos);
  if (!pedido.direcao && sentido) {
    pedido.direcao = sentido;
    completados.push(`sentido ${sentido}`);
  } else if (pedido.direcao && sentido && pedido.direcao !== sentido && ctx.pedidosLidos === 1) {
    avisos.push(`o cliente escreveu ${sentido === "volta" ? "Volta (pra São Luís)" : "Ida (saindo de São Luís)"}`);
  }

  const datas = datasEscritas(mensagens).filter((d) => d >= ctx.hoje);
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
  },
): string[] {
  if (r.type === "encomenda") return [];
  const textos = mensagens.map((m) => m.texto);
  const naoBate: string[] = [];

  const datas = [...new Set([...datasEscritas(mensagens), ...(ctx.datasConfirmadas ?? [])])]
    .filter((d) => d >= ctx.hoje)
    .sort();
  if (datas.length && !datas.includes(r.trip_date)) {
    naoBate.push(`o cliente escreveu o dia ${datas.map(ddmm).join(" ou ")} e a reserva ficou para ${ddmm(r.trip_date)}`);
  }

  const sentido = sentidoEscrito(textos);
  if (sentido && ctx.pedidosLidos === 1 && sentido !== r.direction) {
    naoBate.push(`o cliente escreveu ${sentido === "volta" ? "Volta (pra São Luís)" : "Ida (saindo de São Luís)"} e a reserva ficou na ${r.direction === "volta" ? "Volta" : "Ida"}`);
  }
  // vários pedidos: viagem no sentido que o cliente NÃO pediu (e sem falar em volta) não entra calada (issue #351)
  if (sentido && ctx.pedidosLidos > 1 && sentido !== r.direction && !falouDasDuasViagens(textos)) {
    naoBate.push(`o cliente só pediu a ${sentido === "volta" ? "Volta" : "Ida"}; a ${r.direction === "volta" ? "Volta" : "Ida"} não foi pedida`);
  }

  const q = quantidadeEscrita(textos);
  if (q != null && ctx.pedidosLidos === 1 && (r.quantity ?? 1) !== q) {
    naoBate.push(`o cliente escreveu ${q} passagem(ns) e a reserva ficou com ${r.quantity ?? 1}`);
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
