// src/hooks/useEnsureTrips.js
//
// Rede de segurança para a Agenda nunca aparecer vazia. Uma vez por
// montagem, pede ao banco (rpc_ensure_trips) para criar a Ida/Volta dos
// próximos dias que ainda não existirem. O trabalho de fato é do pg_cron
// diário `ensure-upcoming-trips` — isto só cobre o caso de o cron ter
// atrasado ou o app ser aberto logo depois do deploy inicial.
//
// Fire-and-forget: não bloqueia a tela, não expõe loading/erro. Se falhar
// (sem rede, sem veículo padrão), a Agenda simplesmente segue como antes.
// Ver database/09-daily-trips.sql.

import { useEffect } from "react";
import { tripsService } from "../services/tripsService";

export function useEnsureTrips(days = 14) {
  useEffect(() => {
    tripsService.ensureUpcoming(days).catch(() => {});
  }, [days]);
}
