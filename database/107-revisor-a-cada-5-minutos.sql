-- 107 — Revisor de reservas a cada 5 minutos (issue #401)
--
-- A equipe corrigia à mão porque a correção do revisor demorava (até 15 min + 3 min de espera).
-- Cada revisão custa ~US$ 0,01 e só roda para quem mudou algo (assinatura), então rodar mais
-- vezes quase não muda o custo; o teto mensal continua em settings.revisao_budget.

do $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'revisar-reservas';
  if v_job is null then
    raise exception 'job revisar-reservas não existe (rode a 97 antes)';
  end if;
  perform cron.alter_job(v_job, schedule := '*/5 * * * *');
end $$;
