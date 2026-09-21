// e2e/support/supabaseMock.js
//
// Harness de e2e sem backend (issue #4). Não existe projeto Supabase de
// teste no CI, então este helper:
//   1) injeta uma sessão de auth válida no localStorage antes do app subir
//      (o AuthGate acha que já tem login);
//   2) intercepta as chamadas PostgREST / RPC / realtime com respostas
//      controladas por cenário.
//
// O objetivo NÃO é reimplementar o Postgres — é dar dados estáveis o
// suficiente para dirigir os fluxos de tela (Reservar, Lista/embarque) e
// verificar o que a UI faz com a resposta do banco (confirmação, viagem
// lotada -> lista de espera, marcar embarcado).

const PROJECT_REF = "e2e-placeholder"; // casa com playwright.config.js
const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

const FAKE_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@rota-pirapemas.local",
  user_metadata: {},
  app_metadata: { provider: "email" },
};

function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "e2e-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "e2e-refresh-token",
    user: FAKE_USER,
  };
}

const ROUTE_POINTS = [
  {
    id: "rp-busca",
    direction: "ida",
    code: "busca",
    name: "Buscar em Casa",
    base_time: "05:00:00",
    price: null,
    requires_detail: true,
    detail_label: "Bairro",
    boarding_window: null,
    is_core: true,
    display_order: 0,
    active: true,
    deleted_at: null,
  },
  {
    id: "rp-rodoviaria",
    direction: "ida",
    code: "rodoviaria",
    name: "Rodoviária",
    base_time: "05:40:00",
    price: 60,
    requires_detail: false,
    detail_label: null,
    boarding_window: null,
    is_core: true,
    display_order: 1,
    active: true,
    deleted_at: null,
  },
  {
    id: "rp-br",
    direction: "ida",
    code: "br",
    name: "BR (Posto)",
    base_time: "06:00:00",
    price: 60,
    requires_detail: true,
    detail_label: "Ponto na BR",
    boarding_window: null,
    is_core: true,
    display_order: 2,
    active: true,
    deleted_at: null,
  },
  {
    id: "rp-pirapemas",
    direction: "volta",
    code: "pirapemas",
    name: "Pirapemas centro",
    base_time: "13:00:00",
    price: 60,
    requires_detail: false,
    detail_label: null,
    boarding_window: "12:00 – 13:00",
    is_core: true,
    display_order: 1,
    active: true,
    deleted_at: null,
  },
];

const SETTINGS = [
  { key: "attendance_mode", value: { mode: "ia" } },
  { key: "monday_adjustment", value: { active: true, hours: 1 } },
  { key: "pix", value: { key: "98981012388", name: "A O Castelo Transporte e Turismo" } },
  { key: "served_cities", value: ["sao luis", "cantanhede", "pirapemas"] },
  { key: "intermediate_cities", value: ["bacabeira", "santa rita"] },
];

function json(body, status = 200, headers = null) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
    headers: headers || undefined,
  };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {string} [opts.role="atendente"] papel do usuário de teste
 * @param {Array}  [opts.reservations=[]]  linhas de v_reservations_flat
 * @param {object} [opts.occupancy]        { [`${data}|${direcao}`]: {capacity, occupied, available} }
 * @param {object} [opts.createResult]     resposta de rpc_create_reservation
 * @param {(route)=>void} [opts.onCreate]  callback quando rpc_create_reservation é chamado
 * @param {(route)=>void} [opts.onEdit]    callback quando rpc_edit_reservation é chamado
 * @param {Array}  [opts.notifications=[]]  linhas de v_app_notifications
 * @param {Array}  [opts.pendencias=[]]     linhas de v_pendencias_atendimento
 * @param {Array}  [opts.notes=[]]          linhas iniciais de notes (bloco de notas)
 */
export async function mockSupabase(page, opts = {}) {
  const {
    role = "atendente",
    occupancy = {},
    createResult = {
      success: true,
      reservation_id: "e2e-res-1",
      status: "confirmada",
      message: "created",
    },
    onCreate,
    onEdit,
    notifications = [],
    pendencias = [],
  } = opts;
  // mutável: rpc_edit_reservation aplica mudanças simples no array
  let reservations = (opts.reservations ?? []).map((r) => ({ ...r }));

  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    [AUTH_STORAGE_KEY, fakeSession()],
  );

  // realtime: nunca conecta
  await page.route("**/realtime/v1/**", (route) => route.abort());

  // Edge Functions (ex.: create-user da aba Sistema → Equipe)
  await page.route("**/functions/v1/**", (route) =>
    route.fulfill(json({ success: true, id: "e2e-new-user" })),
  );

  // auth: getUser / refresh
  await page.route("**/auth/v1/**", (route) => {
    const url = route.request().url();
    if (url.includes("/user")) return route.fulfill(json(FAKE_USER));
    if (url.includes("/token")) return route.fulfill(json(fakeSession()));
    if (url.includes("/logout")) return route.fulfill(json({}, 204));
    return route.fulfill(json({}));
  });

  // bloco de notas (issue #90 → notas soltas) — stateful dentro do cenário
  let notesRows = (opts.notes ?? []).map((n) => ({ ...n }));
  let noteSeq = 0;
  // categorias de despesa (Gestão + Financeiro, database/22 e 43) — stateful,
  // pra testar criar/editar/remover pela aba Categorias.
  let expenseCategories = (
    opts.expenseCategories ?? [
      {
        id: "ec-1",
        slug: "lavagem",
        label: "Lavagem",
        grupo: "Veículo",
        kind: "gestao",
        icon: "Sparkles",
        sort_order: 10,
        active: true,
      },
      {
        id: "ec-2",
        slug: "combustivel",
        label: "Combustível",
        grupo: "Caixa do dia",
        kind: "despesa",
        icon: "Fuel",
        sort_order: 10,
        active: true,
      },
      {
        id: "ec-3",
        slug: "outro",
        label: "Outro",
        grupo: "Caixa do dia",
        kind: "despesa",
        icon: "Receipt",
        sort_order: 50,
        active: true,
      },
    ]
  ).map((c) => ({ ...c }));
  let categorySeq = 0;
  // Frota (database/46) — veículos, manutenção e tipos de manutenção,
  // stateful pra testar criar/remover veículo, editar manutenção etc.
  let vehiclesRows = (
    opts.vehicles ?? [
      { id: "veh-1", name: "Ônibus", plate: "ABC-1234", type: "onibus", capacity: 31, is_default: true, active: true },
    ]
  ).map((v) => ({ ...v }));
  let vehicleSeq = 0;
  let maintenanceRows = (opts.maintenance ?? []).map((m) => ({ ...m }));
  let maintenanceSeq = 0;
  let maintenanceTypesRows = (
    opts.maintenanceTypes ?? [
      { id: "mt-1", label: "Troca de óleo", active: true, sort_order: 10 },
      { id: "mt-2", label: "Revisão geral", active: true, sort_order: 20 },
    ]
  ).map((t) => ({ ...t }));
  let maintenanceTypeSeq = 0;
  // log de erros (database/36+47) — stateful pra testar "Resolver"
  let errorLogRows = (opts.errorLog ?? []).map((e) => ({ ...e }));
  // quem busca em casa (issue #96) — override por reserva, stateful
  const buscaOverride = {};
  // sino de notificações (issue #112) — stateful "lida" por id
  const lidas = new Set();
  // pendências de atendimento (issue #118) — stateful
  let tickets = pendencias.map((p) => ({ ...p }));
  let ticketSeq = 0;

  await page.route("**/rest/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/rest/v1/", "");
    const wantsObject = (req.headers().accept || "").includes("pgrst.object");

    if (path === "notes") {
      if (req.method() === "GET") {
        const sorted = [...notesRows].sort((a, b) =>
          a.pinned === b.pinned
            ? new Date(b.updated_at) - new Date(a.updated_at)
            : a.pinned
              ? -1
              : 1,
        );
        return route.fulfill(json(wantsObject ? (sorted[0] ?? null) : sorted));
      }
      if (req.method() === "POST") {
        const body = req.postDataJSON?.() ?? {};
        noteSeq += 1;
        const now = new Date().toISOString();
        const row = {
          id: `note-${noteSeq}`,
          content: body.content ?? "",
          pinned: false,
          created_at: now,
          updated_at: now,
          updated_by: FAKE_USER.id,
        };
        notesRows = [row, ...notesRows];
        return route.fulfill(json(wantsObject ? row : [row]));
      }
      if (req.method() === "PATCH") {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        const body = req.postDataJSON?.() ?? {};
        notesRows = notesRows.map((n) =>
          n.id === id ? { ...n, ...body, updated_at: new Date().toISOString() } : n,
        );
        const updated = notesRows.find((n) => n.id === id) ?? null;
        return route.fulfill(json(wantsObject ? updated : [updated]));
      }
      if (req.method() === "DELETE") {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        notesRows = notesRows.filter((n) => n.id !== id);
        return route.fulfill(json([]));
      }
      return route.fulfill(json([]));
    }

    // RPCs
    if (path.startsWith("rpc/")) {
      const fn = path.slice(4);
      if (fn === "rpc_create_reservation") {
        onCreate?.(route);
        return route.fulfill(json(createResult));
      }
      if (fn === "rpc_ensure_trips") return route.fulfill(json({ success: true, created: 0 }));
      if (fn === "rpc_set_pickup_transport") {
        const b = req.postDataJSON?.() ?? {};
        if (b.p_reservation_id) buscaOverride[b.p_reservation_id] = b.p_mode;
        return route.fulfill(json({ success: true, mode: b.p_mode }));
      }
      if (fn === "rpc_set_passengers_status" || fn === "rpc_confirm_reservation") {
        return route.fulfill(json({ success: true }));
      }
      if (fn === "rpc_edit_reservation") {
        const b = req.postDataJSON?.() ?? {};
        // aplica o que dá no array em memória — o suficiente pros testes
        // (inclui mover/status/extra_data, usado pra agendar encomenda).
        if (b.p_reservation_id) {
          reservations = reservations.map((r) => {
            if (r.id !== b.p_reservation_id) return r;
            return {
              ...r,
              desembarque: b.p_details?.dropoff_location ?? r.desembarque,
              valorTotal: b.p_details?.unit_price != null ? b.p_details.unit_price : r.valorTotal,
              quantidade: b.p_quantity ?? r.quantidade,
              ...(b.p_move
                ? {
                    data: b.p_move.trip_date,
                    direcao: b.p_move.direction,
                    pontoId: b.p_move.route_point_code,
                  }
                : {}),
              ...(b.p_contact
                ? { nome: b.p_contact.name ?? r.nome, telefone: b.p_contact.phone ?? r.telefone }
                : {}),
              ...(b.p_status ? { status: b.p_status } : {}),
              extra: b.p_extra_data ? { ...r.extra, ...b.p_extra_data } : r.extra,
            };
          });
        }
        onEdit?.(route);
        return route.fulfill(json({ success: true, message: "edited" }));
      }
      if (fn === "rpc_upsert_expense_category") {
        const b = req.postDataJSON?.() ?? {};
        const slug =
          b.p_slug ||
          b.p_label
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
        const existente = expenseCategories.find((c) => c.slug === slug);
        if (existente) {
          Object.assign(existente, {
            label: b.p_label,
            grupo: b.p_grupo ?? existente.grupo,
            kind: b.p_kind ?? existente.kind,
            icon: b.p_icon ?? existente.icon,
          });
        } else {
          categorySeq += 1;
          expenseCategories.push({
            id: `ec-novo-${categorySeq}`,
            slug,
            label: b.p_label,
            grupo: b.p_grupo ?? "Estrutura",
            kind: b.p_kind ?? "gestao",
            icon: b.p_icon ?? null,
            sort_order: b.p_sort_order ?? 100,
            active: true,
          });
        }
        return route.fulfill(
          json({ success: true, id: (existente ?? expenseCategories.at(-1)).id, slug }),
        );
      }
      if (fn === "rpc_soft_delete_expense_category") {
        const b = req.postDataJSON?.() ?? {};
        expenseCategories = expenseCategories.filter((c) => c.id !== b.p_id);
        return route.fulfill(json({ success: true }));
      }
      if (fn === "rpc_soft_delete_vehicle") {
        const b = req.postDataJSON?.() ?? {};
        const alvo = vehiclesRows.find((v) => v.id === b.p_id);
        if (!alvo) return route.fulfill(json({ success: false, message: "Veículo não encontrado." }));
        if (alvo.is_default) {
          return route.fulfill(
            json({ success: false, message: "Defina outro veículo como padrão antes de remover este." }),
          );
        }
        vehiclesRows = vehiclesRows.filter((v) => v.id !== b.p_id);
        return route.fulfill(json({ success: true }));
      }
      if (fn === "rpc_mark_notifications_read") {
        const b = req.postDataJSON?.() ?? {};
        for (const id of b.p_ids ?? []) lidas.add(id);
        return route.fulfill(json({ success: true }));
      }
      if (fn === "rpc_mark_all_notifications_read") {
        for (const n of notifications) lidas.add(n.id);
        return route.fulfill(json({ success: true }));
      }
      if (fn === "rpc_open_support_ticket") {
        const b = req.postDataJSON?.() ?? {};
        ticketSeq += 1;
        tickets = [
          {
            id: `tkt-${ticketSeq}`,
            source: b.p_source ?? "manual",
            phone: b.p_phone ?? null,
            customer_id: b.p_customer_id ?? null,
            assunto: b.p_subject ?? "Atendimento",
            detail: b.p_detail ?? "",
            status: "aberta",
            meta: {},
            created_at: new Date().toISOString(),
            cliente: null,
            aberto_por: "Atendente E2E",
          },
          ...tickets,
        ];
        return route.fulfill(json({ success: true, id: `tkt-${ticketSeq}` }));
      }
      if (fn === "rpc_resolve_support_ticket") {
        const b = req.postDataJSON?.() ?? {};
        tickets = tickets.filter((t) => t.id !== b.p_id);
        return route.fulfill(json({ success: true }));
      }
      return route.fulfill(json({ success: true }));
    }

    const table = path;
    let rows;
    if (table === "users")
      rows = [
        {
          id: FAKE_USER.id,
          name: "Atendente E2E",
          phone: null,
          role,
          active: true,
          deleted_at: null,
        },
        {
          id: "u-motorista",
          name: "Motorista E2E",
          phone: "98999990000",
          role: "motorista",
          active: true,
          deleted_at: null,
        },
      ];
    else if (table === "route_points") rows = ROUTE_POINTS;
    else if (table === "settings") rows = SETTINGS;
    else if (table === "v_reservations_flat")
      rows = reservations.map((r) =>
        buscaOverride[r.id] ? { ...r, buscaPor: buscaOverride[r.id] } : r,
      );
    else if (table === "v_trip_occupancy") {
      rows = Object.entries(occupancy).map(([k, v]) => {
        const [trip_date, direction] = k.split("|");
        return { trip_id: `trip-${k}`, trip_date, direction, ...v };
      });
    } else if (table === "trips") rows = [];
    else if (table === "vehicles" && req.method() === "POST") {
      const body = req.postDataJSON?.() ?? {};
      vehicleSeq += 1;
      const row = { id: `veh-novo-${vehicleSeq}`, is_default: false, active: true, ...body };
      vehiclesRows = [...vehiclesRows, row];
      return route.fulfill(json(wantsObject ? row : [row]));
    } else if (table === "vehicles" && req.method() === "PATCH") {
      const id = url.searchParams.get("id")?.replace("eq.", "");
      const body = req.postDataJSON?.() ?? {};
      vehiclesRows = vehiclesRows.map((v) => (v.id === id ? { ...v, ...body } : v));
      const updated = vehiclesRows.find((v) => v.id === id) ?? null;
      return route.fulfill(json(wantsObject ? updated : [updated]));
    } else if (table === "vehicles") rows = vehiclesRows;
    else if (table === "maintenance" && req.method() === "POST") {
      const body = req.postDataJSON?.() ?? {};
      maintenanceSeq += 1;
      const row = { id: `maint-novo-${maintenanceSeq}`, deleted_at: null, ...body };
      maintenanceRows = [row, ...maintenanceRows];
      return route.fulfill(json(wantsObject ? row : [row]));
    } else if (table === "maintenance" && req.method() === "PATCH") {
      const id = url.searchParams.get("id")?.replace("eq.", "");
      const body = req.postDataJSON?.() ?? {};
      maintenanceRows = maintenanceRows.map((m) => (m.id === id ? { ...m, ...body } : m));
      const updated = maintenanceRows.find((m) => m.id === id) ?? null;
      return route.fulfill(json(wantsObject ? updated : [updated]));
    } else if (table === "maintenance") rows = maintenanceRows;
    else if (table === "maintenance_types" && req.method() === "POST") {
      const body = req.postDataJSON?.() ?? {};
      maintenanceTypeSeq += 1;
      const row = { id: `mt-novo-${maintenanceTypeSeq}`, active: true, sort_order: 100, ...body };
      maintenanceTypesRows = [...maintenanceTypesRows, row];
      return route.fulfill(json(wantsObject ? row : [row]));
    } else if (table === "maintenance_types" && req.method() === "PATCH") {
      const id = url.searchParams.get("id")?.replace("eq.", "");
      const body = req.postDataJSON?.() ?? {};
      maintenanceTypesRows = maintenanceTypesRows.map((t) => (t.id === id ? { ...t, ...body } : t));
      const updated = maintenanceTypesRows.find((t) => t.id === id) ?? null;
      return route.fulfill(json(wantsObject ? updated : [updated]));
    } else if (table === "maintenance_types") rows = maintenanceTypesRows;
    else if (table === "expense_categories" && req.method() === "PATCH") {
      const id = url.searchParams.get("id")?.replace("eq.", "");
      const body = req.postDataJSON?.() ?? {};
      expenseCategories = expenseCategories.map((c) => (c.id === id ? { ...c, ...body } : c));
      const updated = expenseCategories.find((c) => c.id === id) ?? null;
      return route.fulfill(json(wantsObject ? updated : [updated]));
    } else if (table === "expense_categories") rows = expenseCategories;
    else if (table === "neighborhood_pricing")
      rows = [
        { id: "np-1", neighborhood: "Cohama", price: 80 },
        { id: "np-2", neighborhood: "Anjo da Guarda", price: 90 },
      ];
    else if (table === "dropoff_areas")
      rows = [
        {
          id: "da-1",
          direction: "ida",
          code: "cantanhede",
          label: "Cantanhede",
          detail_label: "Onde em Cantanhede",
          detail_placeholder: "",
          detail_required: false,
          sort_order: 10,
          active: true,
        },
        {
          id: "da-2",
          direction: "ida",
          code: "pirapemas",
          label: "Pirapemas",
          detail_label: "Onde em Pirapemas",
          detail_placeholder: "",
          detail_required: false,
          sort_order: 20,
          active: true,
        },
        {
          id: "da-3",
          direction: "ida",
          code: "outro",
          label: "Outros locais",
          detail_label: "Onde você vai ficar",
          detail_placeholder: "Descreva o local",
          detail_required: true,
          sort_order: 30,
          active: true,
        },
        {
          id: "da-4",
          direction: "volta",
          code: "casa",
          label: "Em casa (bairro)",
          detail_label: "Bairro onde vai ficar",
          detail_placeholder: "Ex.: Cohama",
          detail_required: true,
          sort_order: 40,
          active: true,
        },
      ];
    else if (table === "customers") rows = [];
    else if (table === "v_contas_a_receber") rows = [];
    else if (table === "v_app_notifications")
      rows = notifications.map((n) => ({ ...n, lida: n.lida || lidas.has(n.id) }));
    else if (table === "v_pendencias_atendimento") rows = tickets;
    else if (table === "app_error_log" && req.method() === "PATCH") {
      const id = url.searchParams.get("id")?.replace("eq.", "");
      const body = req.postDataJSON?.() ?? {};
      errorLogRows = errorLogRows.map((e) => (e.id === id ? { ...e, ...body } : e));
      const updated = errorLogRows.find((e) => e.id === id) ?? null;
      return route.fulfill(json(wantsObject ? updated : [updated]));
    } else if (table === "app_error_log") rows = errorLogRows.filter((e) => !e.resolved_at);
    else if (table === "v_diagnostico_reservas") rows = opts.diagnostico ?? [];
    else if (table === "v_customers_stats") {
      rows = opts.customersStats ?? [];
      return route.fulfill(
        json(rows, 200, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` }),
      );
    } else rows = [];

    const body = wantsObject ? (rows[0] ?? null) : rows;
    return route.fulfill(json(body));
  });
}
