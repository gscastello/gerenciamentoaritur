// supabase/functions/_shared/dataOperacao.ts
//
// A operação é em São Luís (MA) — UTC-3 o ano inteiro (Brasil não observa
// mais horário de verão desde 2019). "Hoje" pro bot tem que ser sempre o
// dia civil de São Luís, nunca UTC: `new Date().toISOString().slice(0,10)`
// mostra o dia seguinte entre ~21h e meia-noite em São Luís, fazendo o bot
// resolver datas relativas ("hoje", "amanhã") um dia adiantado nesse
// intervalo (docs/AUDITORIA-2026-09-08.md §3.3-L — mesmo padrão já usado
// em frontend/src/app/tabShared.jsx's dataOperacao/todayStr).
//
// Módulo sem dependências de propósito: permite testar a regra de fuso
// isoladamente, sem precisar dos env vars (Supabase/Meta/Anthropic) que o
// resto do bot exige no import.
const FUSO_OPERACAO = "America/Fortaleza";
const fmtDiaSaoLuis = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_OPERACAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function hojeSaoLuis(): string {
  return fmtDiaSaoLuis.format(new Date());
}
