// src/services/extratoService.js
//
// Extrato do banco (issue #364, database/104): guardar os movimentos do arquivo
// (sem repetir, pela chave), listar o mês, lançar o que falta pela RPC (o
// lançamento sai do próprio movimento) e marcar o que não entra.

import { ServiceError, getCurrentUserId, supabase } from "../lib/supabaseClient";

function isNetworkish(error) {
  return /fetch|network|timeout/i.test(error?.message || "");
}
async function handle(promise, context) {
  const { data, error } = await promise;
  if (error)
    throw new ServiceError(`${context}: ${error.message}`, {
      cause: error,
      retryable: isNetworkish(error),
    });
  return data;
}

export const extratoService = {
  /** Guarda os movimentos; os que já estavam (mesma chave) ficam como estão. Devolve quantos entraram. */
  async guardar({ conta, arquivo, linhas, chaves }) {
    const actor = await getCurrentUserId();
    const rows = linhas.map((l, i) => ({
      conta,
      arquivo,
      data: l.data,
      valor: l.valor,
      descricao: l.descricao ?? "",
      documento: l.documento ?? null,
      chave: chaves[i],
      importado_por: actor,
    }));
    let novos = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const data = await handle(
        supabase
          .from("extrato_linhas")
          .upsert(rows.slice(i, i + 500), { onConflict: "chave", ignoreDuplicates: true })
          .select("id"),
        "guardarExtrato",
      );
      novos += data?.length ?? 0;
    }
    return { novos, repetidos: rows.length - novos };
  },

  async listar(de, ate) {
    return handle(
      supabase
        .from("extrato_linhas")
        .select("id, conta, data, valor, descricao, documento, financial_entry_id, ignorada")
        .gte("data", de)
        .lte("data", ate)
        .order("data")
        .limit(5000),
      "listarExtrato",
    );
  },

  /** Data do movimento mais recente guardado (o mês que a tela abre). */
  async ultimaData() {
    const data = await handle(
      supabase.from("extrato_linhas").select("data").order("data", { ascending: false }).limit(1),
      "ultimaDataExtrato",
    );
    return data?.[0]?.data ?? null;
  },

  async lancamentos(de, ate) {
    return handle(
      supabase
        .from("financial_entries")
        .select("id, entry_date, type, amount, category, description")
        .gte("entry_date", de)
        .lte("entry_date", ate)
        .is("deleted_at", null)
        .limit(5000),
      "lancamentosDoExtrato",
    );
  },

  /** Pagamentos de reserva já pagos no Pix/cartão (o dinheiro não passa no banco). */
  async pagamentos(de, ate) {
    return handle(
      supabase
        .from("payments")
        .select("id, amount, paid_at, method, reservation_id")
        .eq("status", "pago")
        .in("method", ["pix", "cartao"])
        .gte("paid_at", `${de}T00:00:00-03:00`)
        .lte("paid_at", `${ate}T23:59:59-03:00`)
        .is("deleted_at", null)
        .limit(5000),
      "pagamentosDoExtrato",
    );
  },

  async lancar(id, categoria, descricao) {
    const data = await handle(
      supabase.rpc("rpc_lancar_movimento", {
        p_linha: id,
        p_categoria: categoria,
        p_descricao: descricao ?? null,
      }),
      "lancarMovimento",
    );
    if (!data?.success) throw new ServiceError(data?.message || "Não foi possível lançar.");
    return data;
  },

  async ignorar(id, ignorada) {
    return handle(
      supabase.from("extrato_linhas").update({ ignorada }).eq("id", id),
      "ignorarMovimento",
    );
  },
};
