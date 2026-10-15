// supabase/functions/_shared/botGuard.ts
//
// Trava contra invenção: as respostas livres do bot (base de conhecimento)
// são escritas pelo modelo, mas NENHUM número, horário ou valor pode
// aparecer ali se não estiver nas fontes que o sistema forneceu (dados ao
// vivo + base de conhecimento + o que o próprio cliente escreveu). Se
// aparecer, a resposta não é enviada.
//
// Módulo sem dependências de propósito (testável sem env vars).

// "05:40", "5h40", "13h", "R$ 80", "80,00", "1.200", telefones
const RE_NUMERO = /\d{1,2}\s*[h:]\s*\d{2}|\d{1,2}\s*h\b|\d+(?:[.,]\d+)*/gi;

function canonico(token: string): string {
  const t = token.toLowerCase().replace(/\s+/g, "");
  const hora = t.match(/^(\d{1,2})[h:](\d{2})$/);
  if (hora) return `${Number(hora[1])}:${hora[2]}`;
  const horaCheia = t.match(/^(\d{1,2})h$/);
  if (horaCheia) return `${Number(horaCheia[1])}:00`;
  // 1.200 / 1200 / 80,00 / 80.00 → mesma forma numérica
  const semMilhar = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(semMilhar.replace(",", "."));
  return Number.isFinite(n) ? String(n) : t;
}

export function extrairNumeros(texto: string): string[] {
  return [...texto.matchAll(RE_NUMERO)].map((m) => canonico(m[0]));
}

/** Números presentes na resposta que não aparecem em nenhuma das fontes. */
export function numerosNaoFundamentados(resposta: string, fontes: string[]): string[] {
  const permitidos = new Set(fontes.flatMap(extrairNumeros));
  return [...new Set(extrairNumeros(resposta))].filter((n) => !permitidos.has(n));
}
