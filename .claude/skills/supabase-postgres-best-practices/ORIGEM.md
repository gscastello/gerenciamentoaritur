# Origem e uso neste projeto

- **Fonte:** https://github.com/supabase/agent-skills/tree/c9be0e9/skills/supabase-postgres-best-practices (commit `c9be0e9`, 10/11/2026)
- **Autor:** Supabase · **Licença:** MIT (ver `LICENSE`)
- **Lida antes de entrar** (issue #282): só instruções e documentação; nenhuma busca de instruções na internet.
- O `SKILL.md` e as referências estão como vieram, sem alterações. Para atualizar, baixe de novo da fonte,
  leia a diferença e troque os arquivos num PR.

## Neste projeto (o AGENTS.md vence em caso de conflito)

- Migrações ficam em `database/NN-nome.sql` (numeração em ordem), idempotentes, e são **testadas numa
  transação desfeita** (`raise exception` no fim) antes de aplicar no projeto `szwnsacgpsvioswrelqo`.
- Cancelamento é sempre `UPDATE status`, nunca `DELETE`; reserva é idempotente por `wa_message_id`;
  telefone sempre normalizado (`fn_normalizar_telefone`) — AGENTS.md §6.
- Extensões (`pg_trgm` etc.) ficam no schema `extensions`: chame `extensions.similarity(...)` dentro de
  funções com `search_path = public`.
