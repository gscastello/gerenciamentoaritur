// supabase/functions/_shared/aprendizado.ts
//
// Regras PURAS do aprendizado do modo sombra (sem Deno.env, sem rede): máscara
// de dados pessoais, montagem das conversas para o modelo, validação das
// lições devolvidas e o bloco de texto que entra nos prompts do bot.
// A parte com I/O fica em aprendizadoRun.ts / botLicoes.ts.

export type TipoLicao =
  | "linguagem_cliente"
  | "estilo_atendente"
  | "fluxo_agendamento"
  | "situacao"
  | "fato"
  | "negocio";
export const TIPOS_DE_LICAO: TipoLicao[] = [
  "linguagem_cliente",
  "estilo_atendente",
  "fluxo_agendamento",
  "situacao",
  "fato",
  "negocio",
];

export type Observacao = {
  chatwoot_conversation_id: number;
  author: "cliente" | "equipe" | "bot" | "bot_rascunho";
  content: string;
  created_at: string;
};

export type LicaoProposta = { kind: TipoLicao; title: string; content: string };

export type LicaoGuardada = {
  id: string;
  kind: TipoLicao;
  title: string;
  content: string;
  evidence_count?: number;
};

const ROTULO_AUTOR: Record<Observacao["author"], string> = {
  cliente: "CLIENTE",
  equipe: "ATENDENTE",
  bot: "BOT (enviada)",
  bot_rascunho: "BOT (rascunho, não enviado)",
};

/** Esconde telefone, e-mail e link antes de qualquer texto sair do banco. */
export function mascararDados(texto: string): string {
  return String(texto ?? "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, (m) => (m.replace(/\D/g, "").length >= 8 ? "[telefone]" : m));
}

/** Conversas em texto corrido, mascaradas, no limite de tamanho do modelo. */
export function montarTranscricoes(
  observacoes: Observacao[],
  { maxConversas = 40, maxCharsPorConversa = 3500 } = {},
): { conversa: number; texto: string }[] {
  const porConversa = new Map<number, Observacao[]>();
  for (const o of observacoes) {
    const lista = porConversa.get(o.chatwoot_conversation_id) ?? [];
    lista.push(o);
    porConversa.set(o.chatwoot_conversation_id, lista);
  }
  const saida: { conversa: number; texto: string }[] = [];
  for (const [conversa, lista] of porConversa) {
    lista.sort((a, b) => a.created_at.localeCompare(b.created_at));
    let texto = "";
    for (const o of lista) {
      const linha = `${ROTULO_AUTOR[o.author]}: ${mascararDados(o.content).replace(/\s+/g, " ").trim()}\n`;
      if (texto.length + linha.length > maxCharsPorConversa) break;
      texto += linha;
    }
    if (texto.trim()) saida.push({ conversa, texto: texto.trimEnd() });
    if (saida.length >= maxConversas) break;
  }
  return saida;
}

/**
 * Fato e negócio valem só aprovados; linguagem/estilo/fluxo entram valendo e
 * pedem revisão. Resposta por situação também, a menos que cite número
 * (valor, horário, prazo) — aí é informação e espera o dono aprovar.
 */
export function statusInicial(kind: TipoLicao, content = ""): "ativa" | "proposta" {
  if (kind === "fato" || kind === "negocio") return "proposta";
  if (kind === "situacao" && /\d/.test(content)) return "proposta";
  return "ativa";
}

export function normalizarTitulo(t: string): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const RE_TELEFONE_RESTANTE = /\d[\d\s().-]{6,}\d/;

/**
 * Filtra o que o modelo devolveu: tipo conhecido, tamanhos do banco, sem dados
 * pessoais, sem repetir título já existente nem duplicar dentro do lote.
 */
export function validarLicoesNovas(
  brutas: unknown,
  existentes: { kind: string; title: string }[] = [],
): LicaoProposta[] {
  if (!Array.isArray(brutas)) return [];
  const vistos = new Set(existentes.map((e) => `${e.kind}|${normalizarTitulo(e.title)}`));
  const saida: LicaoProposta[] = [];
  for (const b of brutas) {
    const kind = String((b as { kind?: unknown })?.kind ?? "") as TipoLicao;
    const title = String((b as { title?: unknown })?.title ?? "").trim();
    const content = String((b as { content?: unknown })?.content ?? "").trim();
    if (!TIPOS_DE_LICAO.includes(kind)) continue;
    if (title.length < 3 || title.length > 120) continue;
    if (content.length < 10 || content.length > 800) continue;
    const texto = `${title} ${content}`;
    if (/\[(telefone|email|link)\]/.test(texto) || RE_TELEFONE_RESTANTE.test(texto)) continue;
    const chave = `${kind}|${normalizarTitulo(title)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ kind, title, content });
  }
  return saida;
}

/** Atualização só vale com texto novo, no tamanho do banco e sem dado pessoal. */
export function conteudoAtualizadoValido(content: unknown): string | null {
  const t = String(content ?? "").trim();
  if (t.length < 10 || t.length > 800) return null;
  if (/\[(telefone|email|link)\]/.test(t) || RE_TELEFONE_RESTANTE.test(t)) return null;
  return t;
}

const TITULO_DO_BLOCO: Record<TipoLicao, string> = {
  linguagem_cliente: "COMO OS CLIENTES COSTUMAM ESCREVER",
  estilo_atendente: "COMO O ATENDENTE COSTUMA RESPONDER",
  fluxo_agendamento: "COMO O ATENDENTE AGENDA AS PASSAGENS",
  situacao: "O QUE RESPONDER EM CADA SITUAÇÃO (jeito do atendente)",
  fato: "INFORMAÇÕES DITAS PELO ATENDENTE (aprovadas pelo dono)",
  negocio: "COMO A EMPRESA FUNCIONA (aprovado pelo dono)",
};

/**
 * Bloco de texto para os prompts do bot, com as lições dos tipos pedidos.
 * Mais vistas primeiro; corta no limite para não inflar o prompt.
 */
export function blocoDeLicoes(
  licoes: LicaoGuardada[],
  tipos: TipoLicao[],
  { max = 12, maxChars = 2200 } = {},
): string {
  const linhas: string[] = [];
  let total = 0;
  for (const tipo of tipos) {
    const doTipo = licoes
      .filter((l) => l.kind === tipo)
      .sort((a, b) => (b.evidence_count ?? 1) - (a.evidence_count ?? 1))
      .slice(0, max);
    if (doTipo.length === 0) continue;
    const cabecalho = `${TITULO_DO_BLOCO[tipo]}:`;
    const corpo: string[] = [];
    for (const l of doTipo) {
      const linha = `- ${l.title}: ${l.content}`;
      if (total + linha.length > maxChars) break;
      total += linha.length;
      corpo.push(linha);
    }
    if (corpo.length) linhas.push(cabecalho, ...corpo, "");
  }
  return linhas.join("\n").trim();
}

export type NotaDeCliente = { customerId: string; notes: string };

/**
 * O que o modelo devolveu sobre clientes recorrentes: só para clientes que
 * estavam nas conversas lidas (o modelo fala "conversa N"), texto no tamanho
 * do banco e sem telefone, e-mail ou link.
 */
export function validarNotasDeClientes(
  brutas: unknown,
  clientePorConversa: Map<number, string>,
): NotaDeCliente[] {
  if (!Array.isArray(brutas)) return [];
  const feitos = new Set<string>();
  const saida: NotaDeCliente[] = [];
  for (const b of brutas) {
    const n = Number((b as { conversa?: unknown })?.conversa);
    const customerId = clientePorConversa.get(n);
    const notes = conteudoAtualizadoValido((b as { resumo?: unknown })?.resumo);
    if (!customerId || !notes || feitos.has(customerId)) continue;
    feitos.add(customerId);
    saida.push({ customerId, notes });
  }
  return saida;
}

/** Bloco do prompt com o que se sabe do cliente que está falando agora. */
export function blocoDoCliente(notes: string | null | undefined): string {
  const t = String(notes ?? "").trim();
  if (!t) return "";
  return `SOBRE ESTE CLIENTE (anotado de conversas anteriores; serve só para personalizar e lembrar — confirme com ele, nunca presuma):
${t}`;
}
