// src/hooks/usePassageiros.js
//
// CRM paginado: a lista agregada vem do banco (v_customers_stats),
// página a página, com busca no servidor. A ficha de cada passageiro
// (resumo, histórico, nota, cadastro) é o usePassageiro.

import { useCallback, useEffect, useRef, useState } from "react";
import { logTecnico, mensagemAmigavel } from "../lib/erros.js";
import { customersService } from "../services/customersService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";

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

  // a ficha (issue #438) muda o passageiro; a lista acompanha sem recarregar a página
  const atualizarNaLista = useCallback((customerId, campos) => {
    setLinhas((atual) =>
      atual.map((p) => (p.customer_id === customerId ? { ...p, ...campos } : p)),
    );
  }, []);
  const tirarDaLista = useCallback((customerId) => {
    setLinhas((atual) => atual.filter((p) => p.customer_id !== customerId));
    setTotal((atual) => Math.max(0, atual - 1));
  }, []);

  return {
    passageiros: linhas,
    total,
    loading,
    erro,
    temMais: linhas.length < total,
    carregarMais,
    recarregar,
    atualizarNaLista,
    tirarDaLista,
  };
}

// O que o cadastro editado muda na linha de v_customers_stats.
function camposDaLinha({
  name,
  phone,
  phoneSecondary,
  defaultRoutePointCode,
  defaultPaymentMethod,
}) {
  return {
    ...(name !== undefined ? { nome: name } : {}),
    ...(phone !== undefined ? { telefone: phone } : {}),
    ...(phoneSecondary !== undefined ? { telefone2: phoneSecondary } : {}),
    ...(defaultRoutePointCode !== undefined ? { ponto_padrao: defaultRoutePointCode } : {}),
    ...(defaultPaymentMethod !== undefined ? { pagamento_padrao: defaultPaymentMethod } : {}),
  };
}

/**
 * A ficha de UM passageiro (issue #438), aberta pela lista do CRM ou pela Agenda: o resumo
 * (v_customers_stats), o histórico e as ações de nota, cadastro e remoção. `inicial` = a linha
 * que a lista já tem (a ficha abre na hora e se atualiza com a leitura do banco).
 */
export function usePassageiro(customerId, { inicial = null } = {}) {
  const [p, setP] = useState(inicial);
  const [carregando, setCarregando] = useState(!!customerId);
  const [erroLeitura, setErroLeitura] = useState("");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!customerId) return;
    let vivo = true;
    setCarregando(true);
    setErroLeitura("");
    customersService
      .getStats(customerId)
      .then((linha) => {
        if (vivo) setP(linha ?? null);
      })
      .catch((e) => {
        logTecnico(e, { origem: "usePassageiro" });
        if (vivo) setErroLeitura(mensagemAmigavel(e, "Não foi possível abrir o passageiro."));
      })
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [customerId, tentativa]);

  const { viagens, loading: carregandoViagens } = usePassageiroDetalhe(customerId);

  const notaAction = useAsyncAction(customersService.updateNotes);
  const salvarNota = useCallback(
    async (notes) => {
      await notaAction.run(customerId, notes);
      setP((atual) => (atual ? { ...atual, notes } : atual));
      return { notes };
    },
    [notaAction, customerId],
  );

  // cadastro editável (nome, telefone, ponto/pagamento padrão) — um único "Salvar"
  const perfilAction = useAsyncAction(customersService.updateProfile);
  const salvarPerfil = useCallback(
    async (campos) => {
      await perfilAction.run(customerId, campos);
      const mudou = camposDaLinha(campos);
      setP((atual) => (atual ? { ...atual, ...mudou } : atual));
      return mudou;
    },
    [perfilAction, customerId],
  );

  const removerAction = useAsyncAction(customersService.removeCustomer);
  const remover = useCallback(() => removerAction.run(customerId), [removerAction, customerId]);

  return {
    p,
    carregando: carregando && !p,
    erro:
      erroLeitura ||
      (notaAction.error
        ? mensagemAmigavel(notaAction.error, "Não foi possível salvar a nota.")
        : "") ||
      (perfilAction.error
        ? mensagemAmigavel(perfilAction.error, "Não foi possível salvar o cadastro.")
        : "") ||
      (removerAction.error
        ? mensagemAmigavel(removerAction.error, "Não foi possível remover o passageiro.")
        : ""),
    tentarDeNovo: () => setTentativa((n) => n + 1),
    viagens,
    carregandoViagens,
    salvarNota,
    salvarPerfil,
    remover,
  };
}

/** Histórico achatado de um passageiro — sob demanda, com cache simples. */
function usePassageiroDetalhe(customerId) {
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

  // antes da primeira leitura também é "carregando" (o skeleton entra sem piscar "nenhuma viagem")
  return { viagens: viagens ?? [], loading: loading || (!!customerId && viagens === null) };
}
