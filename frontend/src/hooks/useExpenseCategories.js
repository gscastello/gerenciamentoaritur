// src/hooks/useExpenseCategories.js
//
// Lista viva das categorias de despesa (aba Gestão + Financeiro). A tela
// reage em tempo real quando alguém cria/renomeia uma categoria.

import { useCallback, useMemo } from "react";
import { expenseCategoriesService } from "../services/expenseCategoriesService";
import { useAsyncAction } from "./useAsyncAction";
import { useRealtimeTable } from "./useRealtimeTable";
import { useSupabaseQuery } from "./useSupabaseQuery";

const GRUPO_PADRAO = "Estrutura";

export function useExpenseCategories() {
  const query = useSupabaseQuery(() => expenseCategoriesService.list(), []);
  useRealtimeTable("expense_categories", () => query.refetch());

  const criarAcao = useAsyncAction(expenseCategoriesService.upsert);
  const editarAcao = useAsyncAction(expenseCategoriesService.update);
  const removerAcao = useAsyncAction(expenseCategoriesService.remove);

  const todas = query.data ?? [];

  const api = useMemo(() => {
    const ativas = todas.filter((c) => c.active);
    const doKind = (kind) => ativas.filter((c) => c.kind === kind || c.kind === "ambos");
    const gruposDe = (lista) => [...new Set(lista.map((c) => c.grupo || GRUPO_PADRAO))];
    const bySlug = Object.fromEntries(todas.map((c) => [c.slug, c]));
    return {
      todas,
      gestao: doKind("gestao"),
      despesa: doKind("despesa"),
      gruposGestao: gruposDe(doKind("gestao")),
      gruposDespesa: gruposDe(doKind("despesa")),
      rotulo: (slug) => bySlug[slug]?.label || slug || "—",
      grupo: (slug) => bySlug[slug]?.grupo || GRUPO_PADRAO,
      existe: (slug) => Boolean(bySlug[slug]),
      slugsGestao: new Set(doKind("gestao").map((c) => c.slug)),
    };
  }, [todas]);

  const criar = useCallback(
    async (fields) => {
      const r = await criarAcao.run(fields);
      await query.refetch();
      return r;
    },
    [criarAcao, query],
  );
  const editar = useCallback(
    async (id, fields) => {
      const r = await editarAcao.run(id, fields);
      await query.refetch();
      return r;
    },
    [editarAcao, query],
  );
  const remover = useCallback(
    async (id) => {
      const r = await removerAcao.run(id);
      await query.refetch();
      return r;
    },
    [removerAcao, query],
  );

  return {
    ...api,
    loading: query.loading,
    error: query.error,
    refetch: query.refetch,
    criar,
    editar,
    remover,
    salvando: criarAcao.loading || editarAcao.loading || removerAcao.loading,
  };
}
