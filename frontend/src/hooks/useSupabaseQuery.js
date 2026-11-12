// src/hooks/useSupabaseQuery.js
//
// Hook genérico de LEITURA: loading, error, data, refetch — com retry
// automático e seguro (só reexecuta erros classificados como
// "retryable" pelo service; nunca reexecuta uma regra de negócio, tipo
// "capacidade excedida", sozinho).
//
// Com `offlineKey` (issue #355), cada leitura boa fica guardada no aparelho e,
// sem internet, o hook devolve a última cópia com `offlineDesde` (hora em que
// foi lida) em vez do erro, já no primeiro erro de conexão (o próprio cliente
// do Supabase insiste ~7 s antes de desistir) ou se o servidor não respondeu
// em 6 s (sem rede, a leitura espera a renovação do token, que leva até 30 s).
// A resposta que chegar depois vale por cima. Enquanto mostra a cópia, tenta
// de novo a cada 30 s e assim que o aparelho avisa que a rede voltou.

import { useCallback, useEffect, useRef, useState } from "react";
import { lerCopia, salvarCopia, semRede } from "../lib/copiaOffline.js";
import { logTecnico } from "../lib/erros.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 600;
const NOVA_TENTATIVA_OFFLINE_MS = 30000;
const ESPERA_ANTES_DA_COPIA_MS = 6000;

export function useSupabaseQuery(fetcher, deps = [], { enabled = true, offlineKey = null } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [offlineDesde, setOfflineDesde] = useState(null);
  const attemptRef = useRef(0);
  const aliveRef = useRef(true);

  const run = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    attemptRef.current = 0;

    const usarCopia = () => {
      const copia = offlineKey ? lerCopia(offlineKey) : null;
      if (!copia) return false;
      setData(copia.dados);
      setOfflineDesde(copia.em);
      setLoading(false);
      return true;
    };
    const ler = async () => {
      while (attemptRef.current <= MAX_RETRIES) {
        try {
          const result = await fetcher();
          if (!aliveRef.current) return;
          setData(result);
          setOfflineDesde(null);
          setLoading(false);
          if (offlineKey) salvarCopia(offlineKey, result);
          return;
        } catch (err) {
          attemptRef.current += 1;
          if (!aliveRef.current) return;
          // sem conexão: a cópia guardada já, em vez de insistir
          if (semRede(err) && usarCopia()) return;
          const canRetry = err?.retryable && attemptRef.current <= MAX_RETRIES;
          if (!canRetry) {
            setError(err);
            setLoading(false);
            logTecnico(err, { origem: "useSupabaseQuery" });
            return;
          }
          await sleep(BASE_DELAY_MS * 2 ** (attemptRef.current - 1));
        }
      }
    };
    // aparelho sem rede nenhuma: nem tenta (cada leitura levaria segundos para falhar)
    if (typeof navigator !== "undefined" && navigator.onLine === false && usarCopia()) return;
    const demorou = offlineKey
      ? setTimeout(() => aliveRef.current && usarCopia(), ESPERA_ANTES_DA_COPIA_MS)
      : null;
    try {
      await ler();
    } finally {
      clearTimeout(demorou);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    aliveRef.current = true;
    run();
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // mostrando a cópia guardada: tenta de novo de tempos em tempos e quando a rede volta
  useEffect(() => {
    if (!offlineDesde) return undefined;
    window.addEventListener("online", run);
    const t = setInterval(run, NOVA_TENTATIVA_OFFLINE_MS);
    return () => {
      window.removeEventListener("online", run);
      clearInterval(t);
    };
  }, [offlineDesde, run]);

  // Atualização otimista pontual (ex.: marcar embarque / quem busca —
  // ações que NÃO afetam capacidade). O refetch seguinte reconcilia com
  // o banco.
  const mutate = useCallback((updater) => {
    setData((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  return { data, loading, error, refetch: run, mutate, offlineDesde };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
