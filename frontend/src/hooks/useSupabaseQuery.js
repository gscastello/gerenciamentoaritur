// src/hooks/useSupabaseQuery.js
//
// Hook genérico de LEITURA: loading, error, data, refetch — com retry
// automático e seguro (só reexecuta erros classificados como
// "retryable" pelo service; nunca reexecuta uma regra de negócio, tipo
// "capacidade excedida", sozinho).

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 600;

export function useSupabaseQuery(fetcher, deps = [], { enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const attemptRef = useRef(0);
  const aliveRef = useRef(true);

  const run = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    attemptRef.current = 0;

    while (attemptRef.current <= MAX_RETRIES) {
      try {
        const result = await fetcher();
        if (!aliveRef.current) return;
        setData(result);
        setLoading(false);
        return;
      } catch (err) {
        attemptRef.current += 1;
        const canRetry = err?.retryable && attemptRef.current <= MAX_RETRIES;
        if (!canRetry) {
          if (!aliveRef.current) return;
          setError(err);
          setLoading(false);
          return;
        }
        await sleep(BASE_DELAY_MS * 2 ** (attemptRef.current - 1));
      }
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

  return { data, loading, error, refetch: run };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
