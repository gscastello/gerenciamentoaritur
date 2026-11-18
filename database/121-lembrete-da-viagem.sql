-- 121-lembrete-da-viagem.sql — issue #458
--
-- Lembrete automático da viagem (Edge Function lembrete-viagem, regras em
-- supabase/functions/_shared/lembretePuro.ts): Ida na noite anterior, Volta 1 hora antes do horário
-- do ponto, e quem agenda depois recebe na rodada seguinte enquanto a viagem não saiu.
--
-- 1. settings.lembrete_viagem — começa DESLIGADO; o dono liga quando confirmar a hora da Ida e o
--    modelo da Meta (aviso_horario) para quem está fora das 24 h.
-- 2. pg_cron de 5 em 5 minutos chamando a função com a chave da rotina do revisor (Vault), como o
--    revisor-reservas. Desligado, a função só responde e não faz nada.

insert into settings (key, value)
values ('lembrete_viagem', '{"ativo": false, "ida_hora": "21:00", "volta_antes_min": 60, "silencio": {"de": "22:00", "ate": "06:00"}}'::jsonb)
on conflict (key) do nothing;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'lembrete-viagem';
  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;
  perform cron.schedule(
    'lembrete-viagem',
    '*/5 * * * *',
    $cmd$
      select net.http_post(
        url := 'https://szwnsacgpsvioswrelqo.supabase.co/functions/v1/lembrete-viagem',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-rotina', (select decrypted_secret from vault.decrypted_secrets where name = 'rotina_revisor_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 5000
      );
    $cmd$
  );
end $$;
