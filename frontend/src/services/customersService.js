import { digitosDeBusca, variantesTelefone } from "../domain/validacao.js";
// src/services/customersService.js
import { buscarTodasAsPaginas } from "../lib/paginas.js";
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

const CUSTOMER_COLS = "id, name, phone, notes, default_neighborhood, created_at";
const STATS_COLS =
  "customer_id, nome, telefone, notes, bairro_padrao, viagens_count, total_passagens, cancelamentos, nao_compareceu, total_gasto, ultima_data, reservas_total, ponto_padrao, pagamento_padrao, telefone2, ultima_viagem, proxima_data, primeira_data, viagens_90d, a_receber, a_receber_qtd, frequente, novo, sumiu, sem_nome, cliente_desde, email, tags, bot_instructions, nota_do_bot";

// Grupos prontos do CRM (issue #446, database/118): o filtro de cada um na v_customers_stats.
const FILTRO_DO_GRUPO = {
  sumiram: (q) => q.eq("sumiu", true),
  sem_pagamento: (q) => q.gt("a_receber", 0),
  frequentes: (q) => q.eq("frequente", true),
  marcada: (q) => q.not("proxima_data", "is", null),
  novos: (q) => q.eq("novo", true),
  sem_nome: (q) => q.eq("sem_nome", true),
};
// Ordens da lista; o id do passageiro desempata (página estável).
const ORDEM_DA_LISTA = {
  viagens: [
    ["viagens_count", false],
    ["total_gasto", false],
  ],
  recente: [["ultima_viagem", false]],
  gasto: [["total_gasto", false]],
  a_receber: [
    ["a_receber", false],
    ["viagens_count", false],
  ],
  nome: [["nome", true]],
};

export const customersService = {
  async list({ search } = {}) {
    const filtro = [];
    if (search) {
      // `.or()` do PostgREST usa vírgula/parênteses como sintaxe: tirar
      // esses caracteres evita que um termo de busca "vaze" para
      // condições extras. Sobra texto puro para o ilike (limitado a 80).
      const termo = String(search)
        .replace(/[,()*:\\%]/g, " ")
        .trim()
        .slice(0, 80);
      const fone = digitosDeBusca(search);
      if (fone) filtro.push(`phone.ilike.%${fone}%,phone_secondary.ilike.%${fone}%`);
      else if (termo) filtro.push(`name.ilike.%${termo}%,phone.ilike.%${termo}%`);
    }
    // 712 passageiros em nov/2026: em páginas, para nunca cortar em 1.000 (issue #444)
    return handle(
      buscarTodasAsPaginas(() => {
        const q = supabase
          .from("customers")
          .select(CUSTOMER_COLS)
          .is("deleted_at", null)
          .order("name")
          .order("id");
        return filtro.length ? q.or(filtro[0]) : q;
      }),
      "list",
    );
  },

  /**
   * Lista agregada do CRM (v_customers_stats, database/37) — paginada e
   * com busca no servidor. `range` é [de, ate] inclusivo (PostgREST).
   * Devolve { linhas, total }.
   */
  async listStats({ search, de = 0, ate = 24, grupo = "todos", ordem = "viagens" } = {}) {
    // uma página por vez (range): a lista nunca é cortada em 1.000 calada (issue #444)
    let query = supabase
      .from("v_customers_stats")
      .select(STATS_COLS, { count: "exact" })
      .range(de, ate);
    for (const [coluna, asc] of ORDEM_DA_LISTA[ordem] ?? ORDEM_DA_LISTA.viagens)
      query = query.order(coluna, { ascending: asc, nullsFirst: false });
    query = query.order("customer_id", { ascending: true });
    if (FILTRO_DO_GRUPO[grupo]) query = FILTRO_DO_GRUPO[grupo](query);
    if (search) {
      const termo = String(search)
        .replace(/[,()*:\\%]/g, " ")
        .trim()
        .slice(0, 80);
      const fone = digitosDeBusca(search);
      if (fone) query = query.or(`telefone.ilike.%${fone}%,telefone2.ilike.%${fone}%`);
      else if (termo) query = query.or(`nome.ilike.%${termo}%,telefone.ilike.%${termo}%`);
    }
    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(`listStats: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    }
    return { linhas: data ?? [], total: count ?? data?.length ?? 0 };
  },

  /** Os números do topo de Passageiros e a quantidade de cada grupo (database/118). */
  async resumo() {
    return handle(supabase.rpc("fn_resumo_dos_passageiros"), "resumo");
  },

  /** Outros cadastros que podem ser a mesma pessoa (database/119): mesmo nome ou telefone. */
  async possiveisRepetidos(customerId) {
    const data = await handle(
      supabase.rpc("fn_possiveis_repetidos", { p_customer_id: customerId }),
      "possiveisRepetidos",
    );
    return Array.isArray(data) ? data : [];
  },

  /** "Não é a mesma pessoa": o par sai da lista de possíveis repetidos. */
  async marcarCadastrosDistintos(a, b) {
    const data = await handle(
      supabase.rpc("rpc_marcar_cadastros_distintos", { p_a: a, p_b: b }),
      "marcarCadastrosDistintos",
    );
    if (!data?.success)
      throw new ServiceError("Não foi possível guardar que não é a mesma pessoa.", {
        retryable: false,
      });
    return data;
  },

  /**
   * Junta dois cadastros (só admin): tudo do `remover` passa para o `manter`, e o `remover` sai
   * da lista (apagado só logicamente). Devolve { reservas } (quantas reservas mudaram de dono).
   */
  async juntarCadastros(manter, remover) {
    const data = await handle(
      supabase.rpc("rpc_juntar_cadastros", { p_manter: manter, p_remover: remover }),
      "juntarCadastros",
    );
    if (!data?.success)
      throw new ServiceError(
        data?.message === "SEM_PERMISSAO"
          ? "Só o administrador pode juntar cadastros."
          : "Não foi possível juntar os cadastros.",
        { retryable: false },
      );
    return data;
  },

  /** A aba Conversa da ficha: as últimas mensagens do WhatsApp e os avisos enviados. */
  async conversa(customerId) {
    const data = await handle(
      supabase.rpc("rpc_conversa_do_passageiro", { p_customer_id: customerId, p_limite: 12 }),
      "conversa",
    );
    if (data && data.success === false)
      throw new ServiceError("Sem permissão para ver a conversa deste passageiro.", {
        retryable: false,
      });
    return data;
  },

  /**
   * O resumo de UM passageiro (v_customers_stats) — a ficha aberta pela Agenda ou pela lista
   * (issue #438). `null` quando o cadastro foi removido.
   */
  async getStats(customerId) {
    return handle(
      supabase
        .from("v_customers_stats")
        .select(STATS_COLS)
        .eq("customer_id", customerId)
        .maybeSingle(),
      "getStats",
    );
  },

  /**
   * Histórico "achatado" de UM cliente (v_reservations_flat) — carregado
   * só quando o card do passageiro abre. Traz os campos de endereço para
   * calcular os endereços mais usados.
   */
  async getHistoryFlat(customerId) {
    return handle(
      supabase
        .from("v_reservations_flat")
        .select(
          "id, data, direcao, status, tipo, quantidade, valorTotal, pago, pagamento, bairro, localExato, rua, referencia, desembarque, pontoId, criadoEm",
        )
        .eq("customer_id", customerId)
        // as 400 viagens mais recentes pela data da viagem (histórico do CRM, issue #436)
        .order("data", { ascending: false })
        .limit(400),
      "getHistoryFlat",
    );
  },

  /**
   * Endereço de costume do cliente (database/66): por sentido, o fixado pela
   * equipe ou o mais frequente no histórico. { ida, volta, sentido_sugerido }.
   */
  async getEnderecoDeCostume(customerId) {
    const data = await handle(
      supabase.rpc("rpc_endereco_de_costume", { p_customer_id: customerId }),
      "getEnderecoDeCostume",
    );
    if (!data?.success)
      throw new ServiceError(data?.message || "Não foi possível ler o endereço de costume.", {
        retryable: false,
      });
    return data;
  },

  /** A equipe fixa (ou corrige) o endereço de costume de um sentido. */
  async definirEnderecoDeCostume(
    customerId,
    direcao,
    { pontoId, bairro, detalhe, desembarque, area },
  ) {
    const data = await handle(
      supabase.rpc("rpc_definir_endereco_de_costume", {
        p_customer_id: customerId,
        p_direction: direcao,
        p_route_point_code: pontoId,
        p_neighborhood: bairro || null,
        p_detail: detalhe || null,
        p_dropoff_location: desembarque || null,
        p_dropoff_area: area || null,
      }),
      "definirEnderecoDeCostume",
    );
    if (!data?.success)
      throw new ServiceError(data?.message || "Não foi possível fixar o endereço de costume.", {
        retryable: false,
      });
    return data;
  },

  /** Solta o endereço fixado: o sentido volta a usar o histórico. */
  async limparEnderecoDeCostume(customerId, direcao) {
    const data = await handle(
      supabase.rpc("rpc_limpar_endereco_de_costume", {
        p_customer_id: customerId,
        p_direction: direcao,
      }),
      "limparEnderecoDeCostume",
    );
    if (!data?.success)
      throw new ServiceError(data?.message || "Não foi possível soltar o endereço de costume.", {
        retryable: false,
      });
    return data;
  },

  async removeCustomer(customerId) {
    const { data, error } = await supabase.rpc("rpc_soft_delete_customer", { p_id: customerId });
    if (error)
      throw new ServiceError(`removeCustomer: ${error.message}`, {
        cause: error,
        retryable: isNetworkish(error),
      });
    if (!data?.success)
      throw new ServiceError(data?.message || "Não foi possível remover o passageiro.", {
        retryable: false,
      });
    return data;
  },

  /** O cadastro desse número, com ou sem o nono dígito, também como telefone secundário. */
  async getByPhone(phone) {
    const formas = variantesTelefone(phone).join(",");
    if (!formas) return null;
    const linhas = await handle(
      supabase
        .from("customers")
        .select(CUSTOMER_COLS)
        .or(`phone.in.(${formas}),phone_secondary.in.(${formas})`)
        .is("deleted_at", null)
        .order("created_at")
        .limit(1),
      "getByPhone",
    );
    return linhas?.[0] ?? null;
  },

  /** Histórico + total gerado, calculado no banco para não depender de somar tudo no cliente. */
  async getHistory(customerId) {
    return handle(
      supabase
        .from("reservations")
        .select("id, status, quantity, total_price, created_at, trip:trips(trip_date, direction)")
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      "getHistory",
    );
  },

  async updateNotes(customerId, notes) {
    const actor = await getCurrentUserId();
    return handle(
      supabase
        .from("customers")
        .update({ notes, updated_by: actor })
        .eq("id", customerId)
        .select()
        .single(),
      "updateNotes",
    );
  },

  /** Edição do cadastro em Passageiros: nome, telefone e as preferências
   * fixas (ponto de embarque e pagamento padrão — usadas pela Central de
   * Atendimento como sugestão prioritária sobre o cálculo do histórico).
   * `null` limpa a preferência; campos omitidos não mudam. */
  async updateProfile(
    customerId,
    { name, phone, phoneSecondary, defaultRoutePointCode, defaultPaymentMethod } = {},
  ) {
    const actor = await getCurrentUserId();
    const patch = { updated_by: actor };
    if (name !== undefined) patch.name = name;
    if (phone !== undefined) patch.phone = phone;
    if (phoneSecondary !== undefined) patch.phone_secondary = phoneSecondary;
    if (defaultRoutePointCode !== undefined) patch.default_route_point_code = defaultRoutePointCode;
    if (defaultPaymentMethod !== undefined) patch.default_payment_method = defaultPaymentMethod;
    return handle(
      supabase.from("customers").update(patch).eq("id", customerId).select().single(),
      "updateProfile",
    );
  },

  async upsertByPhone({ name, phone, defaultNeighborhood }) {
    const actor = await getCurrentUserId();
    const existing = await this.getByPhone(phone);
    if (existing) {
      return handle(
        supabase
          .from("customers")
          .update({
            name: name || existing.name,
            default_neighborhood: defaultNeighborhood ?? existing.default_neighborhood,
            updated_by: actor,
          })
          .eq("id", existing.id)
          .select()
          .single(),
        "upsertByPhone(update)",
      );
    }
    return handle(
      supabase
        .from("customers")
        .insert({
          name,
          phone,
          default_neighborhood: defaultNeighborhood ?? null,
          created_by: actor,
        })
        .select()
        .single(),
      "upsertByPhone(insert)",
    );
  },
};
