-- database/43-limpeza-categorias-gestao.sql
--
-- Limpeza pedida pelo dono: a tela de Gestão acumulou 12 categorias de
-- custo empresarial (kind='gestao') que nunca tiveram nenhum uso — puro
-- seed inicial (database/22-categorias-de-despesa.sql), sem lançamento
-- nem custo recorrente ativo apontando pra elas. O dono quer só o que
-- já tem dado lançado, e criar o resto do zero pela nova aba Categorias
-- (ver frontend GestaoTab.jsx).
--
-- Confirmado via auditoria em produção antes de aplicar: as 12 abaixo
-- têm 0 lançamentos em financial_entries e 0 recurring_expense_templates
-- ativos. `lavagem`, `despesa_administrativa` (têm lançamento) e
-- `prestacao_onibus` (tem recorrência ativa, criada pelo próprio dono)
-- ficam.
--
-- Soft-delete (mesma trava/campo que rpc_soft_delete_expense_category
-- usa) — reversível: um admin do banco pode restaurar limpando
-- deleted_at se algum dia precisar. Idempotente via `deleted_at is null`.

update public.expense_categories
set deleted_at = now(), active = false, updated_at = now()
where slug in (
  'salario', 'pro_labore', 'imposto', 'taxa_bancaria', 'taxa_cartao', 'seguro',
  'ipva', 'pneu', 'peca', 'manutencao_corretiva', 'depreciacao', 'outro_recorrente'
)
and deleted_at is null;
