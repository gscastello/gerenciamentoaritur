// Contrato de arquitetura ("arch-contract"). Roda no CI (`npm run arch`).
// Falha o build se um limite for cruzado.
//
// Camadas (de dentro para fora):
//   domain/        — regras puras, sem React, sem I/O
//   services/      — acesso ao Supabase (I/O), usa domain
//   hooks/         — estado React, usa services + domain
//   observability/ — instrumentação, isolada
//   ui/ , app/     — componentes; usam hooks + domain, NUNCA services direto

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-is-pure",
      comment: "domain/ não importa React, services, hooks nem I/O.",
      severity: "error",
      from: { path: "^src/domain" },
      to: { path: "^(src/(services|hooks|ui|app|observability)|react|@supabase)" },
    },
    {
      name: "ui-nao-chama-services-direto",
      comment: "Componentes passam por hooks; não importam services nem o cliente Supabase.",
      severity: "error",
      from: { path: "^src/(ui|app)" },
      to: { path: "^src/(services|lib/supabaseClient)" },
    },
    {
      name: "services-nao-dependem-de-ui-ou-hooks",
      severity: "error",
      from: { path: "^src/services" },
      to: { path: "^src/(ui|app|hooks)" },
    },
    {
      name: "financeiro-nao-depende-de-whatsapp",
      comment: "AGENTS.md §arquitetura: financeiro/ não pode depender de whatsapp-bot/.",
      severity: "error",
      from: { path: "financeiro" },
      to: { path: "whatsapp" },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: { orphan: true, pathNot: "\\.(d\\.ts|test\\.js|spec\\.js)$" },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(\\.test\\.js|\\.spec\\.js|__tests__)" },
    tsPreCompilationDeps: false,
    reporterOptions: { text: { highlightFocused: true } },
  },
};
