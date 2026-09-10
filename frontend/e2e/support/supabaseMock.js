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
  { id: "rp-busca", direction: "ida", code: "busca", name: "Buscar em Casa", base_time: "05:00:00", price: null, requires_detail: true, detail_label: "Bairro", boarding_window: null, is_core: true, display_order: 0, active: true, deleted_at: null },
  { id: "rp-rodoviaria", direction: "ida", code: "rodoviaria", name: "Rodoviária", base_time: "05:40:00", price: 60, requires_detail: false, detail_label: null, boarding_window: null, is_core: true, display_order: 1, active: true, deleted_at: null },
  { id: "rp-br", direction: "ida", code: "br", name: "BR (Posto)", base_time: "06:00:00", price: 60, requires_detail: true, detail_label: "Ponto na BR", boarding_window: null, is_core: true, display_order: 2, active: true, deleted_at: null },
  { id: "rp-pirapemas", direction: "volta", code: "pirapemas", name: "Pirapemas centro", base_time: "13:00:00", price: 60, requires_detail: false, detail_label: null, boarding_window: "12:00 – 13:00", is_core: true, display_order: 1, active: true, deleted_at: null },
];

const SETTINGS = [
  { key: "attendance_mode", value: { mode: "ia" } },
  { key: "monday_adjustment", value: { active: true, hours: 1 } },
  { key: "pix", value: { key: "98981012388", name: "A O Castelo Transporte e Turismo" } },
  { key: "served_cities", value: ["sao luis", "cantanhede", "pirapemas"] },
  { key: "intermediate_cities", value: ["bacabeira", "santa rita"] },
];

function json(body, status = 200) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {string} [opts.role="atendente"] papel do usuário de teste
 * @param {Array}  [opts.reservations=[]]  linhas de v_reservations_flat
 * @param {object} [opts.occupancy]        { [`${data}|${direcao}`]: {capacity, occupied, available} }
 * @param {object} [opts.createResult]     resposta de rpc_create_reservation
 * @param {(route)=>void} [opts.onCreate]  callback quando rpc_create_reservation é chamado
 * @param {Array}  [opts.notifications=[]]  linhas de v_app_notifications
 * @param {Array}  [opts.pendencias=[]]     linhas de v_pendencias_atendimento
 */
export async function mockSupabase(page, opts = {}) {
  const {
    role = "atendente",
    occupancy = {},
    createResult = { success: true, reservation_id: "e2e-res-1", status: "confirmada", message: "created" },
    onCreate,
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
  await page.route("**/functions/v1/**", (route) => route.fulfill(json({ success: true, id: "e2e-new-user" })));

  // auth: getUser / refresh
  await page.route("**/auth/v1/**", (route) => {
    const url = route.request().url();
    if (url.includes("/user")) return route.fulfill(json(FAKE_USER));
    if (url.includes("/token")) return route.fulfill(json(fakeSession()));
    if (url.includes("/logout")) return route.fulfill(json({}, 204));
    return route.fulfill(json({}));
  });

  // bloco de notas da agenda (issue #90) — stateful dentro do cenário
  let notaAgenda = null;
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

    if (path === "agenda_notes") {
      if (req.method === "GET") {
        return route.fulfill(json(wantsObject ? notaAgenda : notaAgenda ? [notaAgenda] : []));
      }
      const body = req.postDataJSON?.() ?? {};
      const incoming = Array.isArray(body) ? body[0] : body;
      notaAgenda = {
        note_date: incoming.note_date ?? "2026-09-09",
        content: incoming.content ?? "",
        updated_at: new Date().toISOString(),
        updated_by: FAKE_USER.id,
      };
      return route.fulfill(json(wantsObject ? notaAgenda : [notaAgenda]));
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
        // aplica o que dá no array em memória (só o desembarque/pagamento
        // simples, o suficiente pros testes)
        if (b.p_reservation_id) {
          reservations = reservations.map((r) =>
            r.id === b.p_reservation_id
              ? {
                  ...r,
                  desembarque: b.p_details?.dropoff_location ?? r.desembarque,
                  quantidade: b.p_quantity ?? r.quantidade,
                }
              : r,
          );
        }
        return route.fulfill(json({ success: true, message: "edited" }));
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
        { id: FAKE_USER.id, name: "Atendente E2E", phone: null, role, active: true, deleted_at: null },
        { id: "u-motorista", name: "Motorista E2E", phone: "98999990000", role: "motorista", active: true, deleted_at: null },
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
    else if (table === "vehicles") rows = [{ id: "veh-1", name: "Ônibus", capacity: 31, is_default: true, active: true }];
    else if (table === "expense_categories")
      rows = [
        { id: "ec-1", slug: "salario", label: "Salários", grupo: "Pessoal", kind: "gestao", icon: "Users", sort_order: 10, active: true },
        { id: "ec-2", slug: "combustivel", label: "Combustível", grupo: "Caixa do dia", kind: "despesa", icon: "Fuel", sort_order: 10, active: true },
        { id: "ec-3", slug: "outro", label: "Outro", grupo: "Caixa do dia", kind: "despesa", icon: "Receipt", sort_order: 50, active: true },
      ];
    else if (table === "neighborhood_pricing")
      rows = [
        { id: "np-1", neighborhood: "Cohama", price: 80 },
        { id: "np-2", neighborhood: "Anjo da Guarda", price: 90 },
      ];
    else if (table === "dropoff_areas")
      rows = [
        { id: "da-1", direction: "ida", code: "cantanhede", label: "Cantanhede", detail_label: "Onde em Cantanhede", detail_placeholder: "", detail_required: false, sort_order: 10, active: true },
        { id: "da-2", direction: "ida", code: "pirapemas", label: "Pirapemas", detail_label: "Onde em Pirapemas", detail_placeholder: "", detail_required: false, sort_order: 20, active: true },
        { id: "da-3", direction: "ida", code: "outro", label: "Outros locais", detail_label: "Onde você vai ficar", detail_placeholder: "Descreva o local", detail_required: true, sort_order: 30, active: true },
        { id: "da-4", direction: "volta", code: "casa", label: "Em casa (bairro)", detail_label: "Bairro onde vai ficar", detail_placeholder: "Ex.: Cohama", detail_required: true, sort_order: 40, active: true },
      ];
    else if (table === "customers") rows = [];
    else if (table === "v_contas_a_receber") rows = [];
    else if (table === "v_app_notifications")
      rows = notifications.map((n) => ({ ...n, lida: n.lida || lidas.has(n.id) }));
    else if (table === "v_pendencias_atendimento") rows = tickets;
    else rows = [];

    const body = wantsObject ? (rows[0] ?? null) : rows;
    return route.fulfill(json(body));
  });
}
