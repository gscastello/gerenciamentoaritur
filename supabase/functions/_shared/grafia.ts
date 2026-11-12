// supabase/functions/_shared/grafia.ts
//
// Erros de escrita dos clientes (issue #276): "amnh", "hj", "sesta", "Pirapema",
// "Catanhede", "listre caldas", "cohatrc". Módulo PURO (sem rede, sem Deno.env).
//
// Regra única, também usada no banco (fn_distancia_grafia, migração 78):
//   - compara palavra por palavra, ignorando "da/de/do/das/dos" e acentos;
//   - cada palavra aceita um erro pequeno (letra trocada, faltando, sobrando ou
//     duas letras invertidas) conforme o tamanho: até 3 letras tem de ser igual
//     ("Bia" ≠ "Lia", "Cruz" ≠ "Luz"), de 4 a 8 letras 1 erro, 9+ letras 2 erros;
//   - no total, no máximo 2 erros.
// Erro de escrita só ajuda a RECONHECER: nunca decide preço, vaga ou cidade sozinho.

/** Minúsculas, sem acento, só letras/números separados por espaço. */
export function normalizarTexto(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distância de edição com troca de letras vizinhas (Damerau, versão OSA). */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => {
    const linha = new Array<number>(m + 1).fill(0);
    linha[0] = i;
    return linha;
  });
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[n][m];
}

/** Quantos erros uma palavra do tamanho da certa aceita. */
export function tolerancia(tamanho: number): number {
  if (tamanho <= 3) return 0;
  if (tamanho <= 8) return 1;
  return 2;
}

/** A palavra escrita é a certa com um erro pequeno? (igual também conta) */
export function palavraParecida(escrita: string, certa: string): boolean {
  return distancia(escrita, certa) <= tolerancia(certa.length);
}

const PARTICULAS = new Set(["da", "de", "do", "das", "dos"]);

function palavrasSemParticulas(s: string): string[] {
  return normalizarTexto(s)
    .split(" ")
    .filter((p) => p && !PARTICULAS.has(p));
}

/**
 * Quantos erros separam o que foi escrito do nome certo, ou null se não é o mesmo
 * nome ("beira rio" × "Beira do Rio" = 0; "listre caldas" × "Lister Caldas" = 1;
 * "bar da lia" × "Bar da Bia" = null).
 */
export function distanciaDeGrafia(escrito: string, certo: string): number | null {
  const a = palavrasSemParticulas(escrito);
  const b = palavrasSemParticulas(certo);
  if (!a.length || a.length !== b.length) return null;
  let total = 0;
  for (let i = 0; i < a.length; i++) {
    const d = distancia(a[i], b[i]);
    if (d > tolerancia(b[i].length)) return null;
    total += d;
  }
  return total <= 2 ? total : null;
}

/**
 * O nome da lista que o texto cita, mesmo com erro de escrita: procura cada nome
 * (com o mesmo número de palavras) dentro do texto. Exato vence; entre parecidos, o
 * de menos erros; empate entre nomes diferentes = null (não chuta).
 */
export function nomeParecidoNoTexto<T>(
  texto: string | null | undefined,
  itens: T[],
  nomeDe: (item: T) => string,
): { item: T; escrito: string; erros: number } | null {
  const palavras = normalizarTexto(texto).split(" ").filter(Boolean);
  if (!palavras.length) return null;
  const achados: { item: T; nome: string; escrito: string; erros: number }[] = [];
  for (const item of itens) {
    const nome = normalizarTexto(nomeDe(item));
    const n = nome.split(" ").filter(Boolean).length;
    if (!n) continue;
    let melhorDoItem: { escrito: string; erros: number } | null = null;
    // janelas de n palavras, com folga para as partículas que o cliente pôs ou tirou
    for (let i = 0; i < palavras.length; i++) {
      for (let tam = Math.max(1, n - 2); tam <= n + 2 && i + tam <= palavras.length; tam++) {
        const escrito = palavras.slice(i, i + tam).join(" ");
        const erros = distanciaDeGrafia(escrito, nome);
        if (erros !== null && (!melhorDoItem || erros < melhorDoItem.erros)) melhorDoItem = { escrito, erros };
      }
    }
    if (melhorDoItem) achados.push({ item, nome, ...melhorDoItem });
  }
  if (!achados.length) return null;
  // menos erros vence; depois o nome mais longo ("Cohab Anil" > "Anil")
  achados.sort((a, b) => a.erros - b.erros || b.nome.length - a.nome.length);
  const [primeiro, segundo] = achados;
  if (segundo && segundo.erros === primeiro.erros && segundo.nome.length === primeiro.nome.length && segundo.nome !== primeiro.nome) {
    return null; // dois nomes igualmente parecidos: não chuta
  }
  return { item: primeiro.item, escrito: primeiro.escrito, erros: primeiro.erros };
}

// ---------------------------------------------------------------------------
// Datas escritas do jeito do cliente (filtro barato das reservas preparadas)
// ---------------------------------------------------------------------------

/** Palavras de data com 5+ letras: aceitam erro ("sesta", "sabdo", "amanah", "qinta"). */
const PALAVRAS_DE_DATA = ["amanha", "segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo", "semana", "feriado"];

/** Abreviações e grafias comuns que a regra de erro não alcança. */
const ABREVIACOES_DE_DATA = new Set([
  "hoje", "hj", "hje", "oje", "hojee", "amnh", "amnha", "amn", "amh", "manha", "amanh", "amanha", "amanham", "amanhan",
  "seg", "qua", "qui", "sab", "dom", "fds", "segunda", "terca", "tercaa",
]);

/**
 * O cliente citou um dia? Aceita erros e abreviações ("hj", "amnh", "sesta",
 * "sabdo", "dia 12", "12/11", "semana que vem").
 */
export function temDataNoTexto(texto: string | null | undefined): boolean {
  const t = normalizarTexto(texto);
  if (!t) return false;
  if (/\bdia\s+\d{1,2}\b|\b\d{1,2}\s*[/.-]\s*\d{1,2}\b|\bdepois de amanha\b|\bdia primeiro\b/.test(t)) return true;
  // "12/11" vira "12 11" na normalização: confere também no texto cru
  if (/\b\d{1,2}\s*[/.-]\s*\d{1,2}\b/.test(String(texto ?? ""))) return true;
  for (const p of t.split(" ")) {
    if (ABREVIACOES_DE_DATA.has(p)) return true;
    if (p.length >= 4 && PALAVRAS_DE_DATA.some((d) => palavraParecida(p, d))) return true;
  }
  return false;
}

/**
 * Tira os nomes de logradouro do texto antes de procurar uma cidade (issue #341):
 * "Rua Santa Rita de Cássia", "Av. Colombo", "Travessa Miranda" são ruas, não as cidades do
 * caminho. Vai do tipo do logradouro até a próxima vírgula, hífen, número ou parêntese.
 * Devolve o texto em minúsculas e sem acento (o resto como estava).
 */
export function semLogradouros(texto: string | null | undefined): string {
  const t = String(texto ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return t.replace(
    /(^|[^a-z0-9])(rua|r\.|av\.?|avenida|travessa|trav\.?|tv\.?|beco|praca|alameda|estrada|rodovia|ladeira|largo)\s+[^,;\-–/()\n\d]*/g,
    "$1 ",
  );
}
