// src/hooks/useRealtimeTable.js
//
// Assina mudanças em uma (ou mais) tabelas do Postgres via Supabase
// Realtime e chama `onChange` sempre que algo mudar — o padrão adotado
// neste app é "qualquer evento relevante dispara um refetch simples",
// em vez de tentar aplicar patches manuais no estado local. Para o
// volume de dados de uma operação regional isso é mais barato de manter
// corretamente do que reconciliar merges — e é exatamente o que garante
// que dois atendentes vejam a tela do outro atualizar sozinha.
//
// O tempo real PERDE eventos enquanto a conexão está caída (celular bloqueado, app em segundo
// plano, troca de rede) e não os reenvia ao voltar. Por isso (issue #444) `onChange` também é
// chamado, com `{ resync: true }`, quando: o canal reconecta depois de cair; o app volta para a
// frente depois de um tempo escondido; a internet volta; e, se `conferirACada` for dado, de
// tempos em tempos com a tela visível (releitura de segurança das listas críticas). Sem isso a
// tela ficava com o dado velho até alguém recarregar o app.

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

/** Tempo escondido a partir do qual vale reler ao voltar (evita reler a cada troca rápida de app). */
export const ESCONDIDO_MINIMO_MS = 15000;

export function useRealtimeTable(tables, onChange, { enabled = true, conferirACada = 0 } = {}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: a lista de tabelas entra como texto
  useEffect(() => {
    if (!enabled) return undefined;
    const list = Array.isArray(tables) ? tables : [tables];
    const channel = supabase.channel(
      `rt-${list.join("-")}-${Math.random().toString(36).slice(2, 8)}`,
    );
    const reler = (motivo) => onChangeRef.current?.({ resync: true, motivo });

    list.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        onChangeRef.current?.(payload);
      });
    });

    let caiu = false;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        // voltou depois de cair: o que mudou nesse meio-tempo não chegou
        if (caiu) reler("reconectou");
        caiu = false;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        caiu = true;
      }
    });

    let escondidoEm = document.visibilityState === "hidden" ? Date.now() : null;
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "hidden") {
        escondidoEm = Date.now();
      } else if (escondidoEm !== null) {
        const fora = Date.now() - escondidoEm;
        escondidoEm = null;
        if (fora >= ESCONDIDO_MINIMO_MS) reler("voltou");
      }
    };
    const aoVoltarARede = () => reler("online");
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("online", aoVoltarARede);
    const relogio =
      conferirACada > 0
        ? setInterval(() => {
            if (document.visibilityState === "visible" && navigator.onLine !== false) {
              reler("conferencia");
            }
          }, conferirACada)
        : null;

    return () => {
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("online", aoVoltarARede);
      if (relogio) clearInterval(relogio);
      supabase.removeChannel(channel);
    };
  }, [Array.isArray(tables) ? tables.join(",") : tables, enabled, conferirACada]);
}
