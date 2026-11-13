// src/hooks/useExtrato.js
//
// Conferência do extrato do banco (issue #364): o mês escolhido, os movimentos
// guardados, os lançamentos e pagamentos ao redor (±3 dias) e a conciliação
// (domain/extrato.js). Importar lê o arquivo, guarda sem repetir e abre o mês dele.

import { useCallback, useMemo, useState } from "react";
import { chavesDasLinhas, conciliar, lerExtrato } from "../domain/extrato.js";
import { todayStr } from "../domain/format.js";
import { textoDoArquivo } from "../lib/textoDoArquivo.js";
import { extratoService } from "../services/extratoService";
import { useAsyncAction } from "./useAsyncAction";
import { useSupabaseQuery } from "./useSupabaseQuery";

const somarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const limitesDoMes = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
};

export function useExtrato() {
  const [mesEscolhido, setMes] = useState(null);
  const ultima = useSupabaseQuery(() => extratoService.ultimaData(), []);
  const mes = mesEscolhido ?? (ultima.data ? ultima.data.slice(0, 7) : todayStr().slice(0, 7));
  const { de, ate } = limitesDoMes(mes);
  const deFolga = somarDias(de, -3);
  const ateFolga = somarDias(ate, 3);

  const linhas = useSupabaseQuery(() => extratoService.listar(de, ate), [de, ate]);
  const lanc = useSupabaseQuery(
    () => extratoService.lancamentos(deFolga, ateFolga),
    [deFolga, ateFolga],
  );
  const pags = useSupabaseQuery(
    () => extratoService.pagamentos(deFolga, ateFolga),
    [deFolga, ateFolga],
  );

  const conciliacao = useMemo(
    () =>
      conciliar({
        linhas: (linhas.data ?? []).map((l) => ({ ...l, valor: Number(l.valor) })),
        lancamentos: (lanc.data ?? []).map((x) => ({ ...x, amount: Number(x.amount) })),
        pagamentos: (pags.data ?? []).map((p) => ({
          ...p,
          amount: Number(p.amount),
          paid_at: p.paid_at ? String(p.paid_at).slice(0, 10) : null,
        })),
      }),
    [linhas.data, lanc.data, pags.data],
  );

  const recarregar = useCallback(async () => {
    await Promise.all([linhas.refetch(), lanc.refetch()]);
  }, [linhas, lanc]);

  const importarAcao = useAsyncAction(async (arquivo) => {
    const lido = lerExtrato(arquivo.name, await textoDoArquivo(arquivo));
    if (lido.erro) return { ok: false, erro: lido.erro };
    const chaves = chavesDasLinhas(lido.conta, lido.linhas);
    const r = await extratoService.guardar({
      conta: lido.conta,
      arquivo: arquivo.name,
      linhas: lido.linhas,
      chaves,
    });
    const maisNova = lido.linhas
      .map((l) => l.data)
      .sort()
      .at(-1);
    return {
      ok: true,
      conta: lido.conta,
      lidos: lido.linhas.length,
      ...r,
      mes: maisNova.slice(0, 7),
    };
  });
  const lancarAcao = useAsyncAction(extratoService.lancar);
  const ignorarAcao = useAsyncAction(extratoService.ignorar);

  return {
    mes,
    setMes,
    periodo: { de, ate },
    conciliacao,
    loading: linhas.loading || lanc.loading,
    error: linhas.error || lanc.error || pags.error,
    recarregar,
    importando: importarAcao.loading,
    importar: async (arquivo) => {
      const r = await importarAcao.run(arquivo);
      if (r?.ok) {
        if (r.mes === mes) await linhas.refetch();
        else setMes(r.mes);
      }
      return r;
    },
    lancar: async (id, categoria, descricao) => {
      const r = await lancarAcao.run(id, categoria, descricao);
      await recarregar();
      return r;
    },
    ignorar: async (id, valor) => {
      await ignorarAcao.run(id, valor);
      await linhas.refetch();
    },
    salvando: lancarAcao.loading || ignorarAcao.loading,
  };
}
