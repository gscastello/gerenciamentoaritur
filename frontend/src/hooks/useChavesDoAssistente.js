// src/hooks/useChavesDoAssistente.js
//
// Chaves pessoais do atalho da Siri (issue #290): lista as suas, gera uma nova
// (o texto aparece uma vez só) e apaga.

import { useCallback, useState } from "react";
import { assistenteService } from "../services/assistenteService";
import { useAsyncAction } from "./useAsyncAction";
import { useSupabaseQuery } from "./useSupabaseQuery";

export function useChavesDoAssistente({ enabled = true } = {}) {
  // só busca quando o painel abre (enabled entra nas deps para a busca acontecer nessa hora)
  const query = useSupabaseQuery(() => assistenteService.listarChaves(), [enabled], { enabled });
  const gerador = useAsyncAction(assistenteService.gerarChave);
  const removedor = useAsyncAction(assistenteService.revogarChave);
  const [novaChave, setNovaChave] = useState(null);

  const gerar = useCallback(
    async (nome) => {
      const chave = await gerador.run(nome);
      setNovaChave(chave);
      query.refetch();
      return chave;
    },
    [gerador, query],
  );

  const apagar = useCallback(
    async (id) => {
      await removedor.run(id);
      query.mutate((prev) => (prev ?? []).filter((c) => c.id !== id));
    },
    [removedor, query],
  );

  return {
    chaves: query.data ?? [],
    carregando: query.loading,
    erro: query.error || gerador.error || removedor.error,
    gerando: gerador.loading,
    novaChave,
    esconderNovaChave: () => setNovaChave(null),
    gerar,
    apagar,
  };
}
