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
    const n = ` ${normalizarTexto(t)} `;
    if (/ (rodoviaria|rodovaria|rodoviria|rodov|terminal) /.test(n)) achados.push("rodoviaria");
    if (/ retorno /.test(n)) achados.push("retorno");
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
