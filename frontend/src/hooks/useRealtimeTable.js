// src/hooks/useRealtimeTable.js
//
// Assina mudanças em uma (ou mais) tabelas do Postgres via Supabase
// Realtime e chama `onChange` sempre que algo mudar — o padrão adotado
// neste app é "qualquer evento relevante dispara um refetch simples",
// em vez de tentar aplicar patches manuais no estado local. Para o
// volume de dados de uma operação regional isso é mais barato de manter
// corretamente do que reconciliar merges — e é exatamente o que garante
// que dois atendentes vejam a tela do outro atualizar sozinha.

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

export function useRealtimeTable(tables, onChange, { enabled = true } = {}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) return undefined;
    const list = Array.isArray(tables) ? tables : [tables];
    const channel = supabase.channel(`rt-${list.join("-")}-${Math.random().toString(36).slice(2, 8)}`);

    list.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        onChangeRef.current?.(payload);
      });
    });

    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        // a conexão de realtime caiu — não é fatal: o polling de segurança
        // (ver useReservations) garante que o dado eventualmente converge
        console.warn(`Realtime indisponível para [${list.join(", ")}] — seguindo com atualização manual/polling de segurança.`);
      }
    });

    return () => { supabase.removeChannel(channel); };
  }, [Array.isArray(tables) ? tables.join(",") : tables, enabled]);
}
