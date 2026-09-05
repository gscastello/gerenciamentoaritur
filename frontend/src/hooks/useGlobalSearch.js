// src/hooks/useGlobalSearch.js
//
// Estado da busca global. Faz debounce do termo e consulta passageiros
// + reservas em paralelo. "Viagens" e "ir para" são derivados na tela
// (não têm I/O), então não entram aqui.

import { useEffect, useRef, useState } from "react";
import { searchService } from "../services/searchService";

const DEBOUNCE_MS = 280;
const MIN_LEN = 2;

export function useGlobalSearch(termo) {
  const [state, setState] = useState({
    passageiros: [],
    reservas: [],
    loading: false,
    error: null,
  });
  const seq = useRef(0);

  useEffect(() => {
    const t = (termo || "").trim();
    if (t.length < MIN_LEN) {
      setState({ passageiros: [], reservas: [], loading: false, error: null });
      return undefined;
    }

    const meu = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    const id = setTimeout(async () => {
      try {
        const [passageiros, reservas] = await Promise.all([
          searchService.customers(t),
          searchService.reservations(t),
        ]);
        if (meu === seq.current)
          setState({ passageiros, reservas, loading: false, error: null });
      } catch (e) {
        if (meu === seq.current)
          setState({ passageiros: [], reservas: [], loading: false, error: e });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(id);
  }, [termo]);

  return state;
}
