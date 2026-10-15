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
