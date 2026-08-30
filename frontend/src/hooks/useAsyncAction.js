// src/hooks/useAsyncAction.js
//
// Envolve uma função de escrita (criar reserva, confirmar, cancelar...)
// com loading/error e uma política de retry SEGURA: só tenta de novo
// automaticamente se o erro for de rede/timeout (err.retryable === true).
// Erros de regra de negócio (ex.: "capacidade excedida") nunca são
// reexecutados sozinhos — o usuário vê a mensagem e decide o próximo
// passo (ex.: oferecer lista de espera).

import { useCallback, useState } from "react";

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;

export function useAsyncAction(actionFn) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const result = await actionFn(...args);
          setLoading(false);
          return result;
        } catch (err) {
          attempt += 1;
          if (err?.retryable && attempt <= MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)));
            continue;
          }
          setLoading(false);
          setError(err);
          throw err; // quem chamou decide como reagir (ex.: mostrar "lotado, entrar na espera?")
        }
      }
    },
    [actionFn]
  );

  return { run, loading, error, clearError: () => setError(null) };
}
