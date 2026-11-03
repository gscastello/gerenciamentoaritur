// src/hooks/useEnderecoDeCostume.js
//
// Endereço de costume de UM passageiro (database/66): carrega quando o card
// abre e permite fixar/soltar. O cálculo do "mais frequente" é do banco.

import { useCallback, useEffect, useState } from "react";
import { logTecnico, mensagemAmigavel } from "../lib/erros.js";
import { customersService } from "../services/customersService";

export function useEnderecoDeCostume(customerId) {
  const [costume, setCostume] = useState(null);
  const [sugerido, setSugerido] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setErro("");
    try {
      const r = await customersService.getEnderecoDeCostume(customerId);
      setCostume({ ida: r.ida ?? null, volta: r.volta ?? null });
      setSugerido(r.sentido_sugerido ?? null);
    } catch (e) {
      logTecnico(e, { origem: "useEnderecoDeCostume" });
      setErro(mensagemAmigavel(e, "Não foi possível ler o endereço de costume."));
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    setCostume(null);
    carregar();
  }, [carregar]);

  const fixar = useCallback(
    async (direcao, dados) => {
      await customersService.definirEnderecoDeCostume(customerId, direcao, dados);
      await carregar();
    },
    [customerId, carregar],
  );

  const soltar = useCallback(
    async (direcao) => {
      await customersService.limparEnderecoDeCostume(customerId, direcao);
      await carregar();
    },
    [customerId, carregar],
  );

  return { costume, sugerido, loading, erro, fixar, soltar, recarregar: carregar };
}
