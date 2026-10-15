// supabase/functions/_shared/telefone.ts
//
// Mesma normalização de domain/validacao.js (frontend) e de
// fn_normalizar_telefone (database/48): só dígitos, sem o prefixo "55" do
// país (só quando sobram mais de 11 dígitos, pra não confundir com o DDD
// 55 de verdade). O Chatwoot entrega o telefone em E.164 ("+5598..."), mas
// customers.phone é guardado normalizado — sem isso o bot nunca reconhece
// um cliente que já existe.
//
// Módulo sem dependências de propósito (testável sem env vars).

export function normalizarTelefone(entrada: string | null | undefined): string {
  const digitos = String(entrada ?? "").replace(/\D/g, "");
  return digitos.startsWith("55") && digitos.length > 11 ? digitos.slice(2) : digitos;
}

/**
 * Formas equivalentes do MESMO celular: com e sem o nono dígito. O WhatsApp
 * entrega alguns números do Maranhão sem o 9 ("98 8101-2388") e o cadastro do
 * app pode ter o mesmo cliente com 9 ("98 98101-2388") — ou o contrário (o
 * cadastro real já tem números de 10 dígitos digitados sem o 9). Buscar pelas
 * duas formas evita reconhecer um cliente como "novo" e duplicá-lo. Fixos
 * (começam com 2–5) não têm variante.
 */
export function variantesTelefone(entrada: string | null | undefined): string[] {
  const n = normalizarTelefone(entrada);
  const formas = new Set([n]);
  if (n.length === 10 && /^[6-9]/.test(n[2])) formas.add(`${n.slice(0, 2)}9${n.slice(2)}`);
  if (n.length === 11 && n[2] === "9" && /^[6-9]/.test(n[3])) formas.add(`${n.slice(0, 2)}${n.slice(3)}`);
  return [...formas];
}
