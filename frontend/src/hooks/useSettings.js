// src/hooks/useSettings.js
//
// Configuração chave/valor (tabela `settings`). Leitura liberada a
// qualquer papel; escrita só admin (RLS). Usado para o modo de
// atendimento (IA/manual) e o ajuste de segunda-feira — coisas que
// precisam ser as mesmas para todos os sócios.

import { settingsService } from "../services/settingsService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useSettings() {
  const query = useSupabaseQuery(() => settingsService.getAll(), [], { offlineKey: "settings" });
  useRealtimeTable("settings", () => query.refetch());

  const setKey = useAsyncAction(settingsService.set);
  const after = async (p) => {
    const r = await p;
    await query.refetch();
    return r;
  };

  const settings = query.data ?? {};

  return {
    settings,
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,

    attendanceMode: settings.attendance_mode?.mode ?? "ia",
    mondayAdjustment: settings.monday_adjustment ?? { active: true, hours: 1 },
    pix: settings.pix ?? null,
    // receita automática das passagens no Financeiro (database/58): sem a chave = ligada
    autoRevenue: settings.auto_revenue?.enabled ?? true,
    // cidades da rota (issue #6) — listas normalizadas (minúsculas/sem acento no banco)
    servedCities: Array.isArray(settings.served_cities) ? settings.served_cities : [],
    intermediateCities: Array.isArray(settings.intermediate_cities)
      ? settings.intermediate_cities
      : [],

    botStyleGuide: settings.bot_style_guide?.text ?? "",
    // enviado pelo bot quando o cliente insiste em saber onde a van está (issue #244)
    driverContact: settings.driver_contact ?? null,
    // confirmação da reserva ao cliente depois do "Agendado ☑️" (issue #310): sem a chave = ligada
    agendadoConfirmacao: settings.agendado_confirmacao?.ativo ?? true,
    // link base da conta no Chatwoot (database/52) pro "Abrir no Chatwoot"
    chatwootUrl: settings.chatwoot?.url ?? null,
    // estimativa do DAS (issue #366): anexo do Simples e a alíquota que o contador passar (em %)
    simples: {
      anexo: settings.simples?.anexo ?? "III",
      aliquotaManual: settings.simples?.aliquota_manual ?? null,
    },

    setAttendanceMode: (mode) => after(setKey.run("attendance_mode", { mode })),
    setBotStyleGuide: (text) => after(setKey.run("bot_style_guide", { text })),
    setDriverContact: ({ name, phone }) => after(setKey.run("driver_contact", { name, phone })),
    setAutoRevenue: (enabled) => after(setKey.run("auto_revenue", { enabled })),
    setAgendadoConfirmacao: (ativo) => after(setKey.run("agendado_confirmacao", { ativo })),
    setMondayAdjustment: ({ active, hours }) =>
      after(setKey.run("monday_adjustment", { active, hours })),
    setServedCities: (list) => after(setKey.run("served_cities", list)),
    setIntermediateCities: (list) => after(setKey.run("intermediate_cities", list)),
    setSimples: ({ anexo, aliquotaManual }) =>
      after(setKey.run("simples", { anexo, aliquota_manual: aliquotaManual })),
    saving: setKey.loading,
  };
}
