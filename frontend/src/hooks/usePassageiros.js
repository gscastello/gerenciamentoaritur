// src/hooks/usePassageiros.js
//
// CRM paginado: a lista agregada vem do banco (v_customers_stats),
// página a página, com busca no servidor. O histórico detalhado de um
// passageiro carrega só quando o card abre (carregarDetalhe).

import { useCallback, useEffect, useRef, useState } from "react";
import { customersService } from "../services/customersService";
import { useRealtimeTable } from "./useRealtimeTable";
import { useAsyncAction } from "./useAsyncAction";
import { logTecnico, mensagemAmigavel } from "../lib/erros.js";

const PAGINA = 25;

export function usePassageiros(busca) {
  const [linhas, setLinhas] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const paginaRef = useRef(0);
  const buscaRef = useRef(busca);
  buscaRef.current = busca;

  const carregar = useCallback(async (pagina, termo) => {
    setLoading(true);
    setErro("");
    try {
      const de = pagina * PAGINA;
      const { linhas: novas, total: t } = await customersService.listStats({
        search: termo,
        de,
        ate: de + PAGINA - 1,
      });
      setTotal(t);
      setLinhas((atual) => (pagina === 0 ? novas : [...atual, ...novas]));
      paginaRef.current = pagina;
    } catch (e) {
      logTecnico(e, { origem: "usePassageiros" });
      setErro(mensagemAmigavel(e, "Não foi possível carregar os passageiros."));
    } finally {
      setLoading(false);
    }
  }, []);

  // busca (com debounce) → volta pra página 0
  useEffect(() => {
    const t = setTimeout(() => carregar(0, busca), busca ? 300 : 0);
    return () => clearTimeout(t);
  }, [busca, carregar]);

  // outro atendente mexeu numa reserva/cliente → recarrega a página 0
  useRealtimeTable(["reservations", "customers"], () => carregar(0, buscaRef.current));

  const carregarMais = useCallback(
    () => carregar(paginaRef.current + 1, buscaRef.current),
    [carregar],
  );
  const recarregar = useCallback(() => carregar(0, buscaRef.current), [carregar]);

  const notaAction = useAsyncAction(customersService.updateNotes);
  const salvarNota = useCallback(
    async (customerId, notes) => {
      await notaAction.run(customerId, notes);
      setLinhas((atual) =>
        atual.map((p) => (p.customer_id === customerId ? { ...p, notes } : p)),
      );
    },
    [notaAction],
  );

  return {
    passageiros: linhas,
    total,
    loading,
    erro: erro || (notaAction.error ? mensagemAmigavel(notaAction.error, "Não foi possível salvar a nota.") : ""),
    temMais: linhas.length < total,
    carregarMais,
    recarregar,
    salvarNota,
  };
}

/** Histórico achatado de um passageiro — sob demanda, com cache simples. */
export function usePassageiroDetalhe(customerId) {
  const [viagens, setViagens] = useState(null);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map());

  useEffect(() => {
    if (!customerId) return;
    if (cache.current.has(customerId)) {
      setViagens(cache.current.get(customerId));
      return;
    }
    let vivo = true;
    setLoading(true);
    customersService
      .getHistoryFlat(customerId)
      .then((v) => {
        if (!vivo) return;
        cache.current.set(customerId, v);
        setViagens(v);
      })
      .catch((e) => {
        logTecnico(e, { origem: "usePassageiroDetalhe" });
        if (vivo) setViagens([]);
      })
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [customerId]);

  return { viagens: viagens ?? [], loading };
}
