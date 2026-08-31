# Plano de integração — `App.jsx` ⇄ Supabase (issue #10)

Objetivo: trocar a fonte de verdade do `frontend/src/app/App.jsx` de
`window.storage` (localStorage) para o Postgres, via os `services/` e
`hooks/` que já existem em `frontend/src/`.

## Estado desta branch (`feature/10-app-supabase`)

Já feito:

- **Auth** — `src/auth/` (`AuthProvider`, `AuthGate`, `LoginScreen`).
  `main.jsx` embrulha o app: sem login → tela de login; logado sem papel
  → aviso; logado com papel → o app. Isso é pré-requisito: com RLS ligado
  e sem usuário autenticado, todo `select` volta vazio.
- **Services** — os 8 originais + 2 novos (`routePointsService`,
  `settingsService`) que faltavam para as abas Reservar e Sistema.
- **Correções** — `reservationsService.listByDate` agora usa
  `trips!inner` (sem isso o filtro por data era ignorado);
  `tripsService.getAvailability` sem o ternário morto.
- `supabaseClient` degrada com elegância se faltar env (mostra tela de
  "configure o Supabase" em vez de tela branca).
- `database/08-realtime.sql` — publica as tabelas no Realtime.

Falta: reescrever `App.jsx` aba por aba (abaixo).

## Como testar cada passo

Não dá para testar sem o app rodando contra o banco. Ordem:

1. Merge dos PRs #16 e #17 na `main`.
2. Deploy na Vercel (`frontend/DEPLOY.md`) — ou `cd frontend && npm run dev`
   com `.env` preenchido.
3. Criar seu login no Supabase Auth (vira `admin` — bootstrap).
4. Rodar `database/08-realtime.sql`.
5. A partir daí, cada aba migrada é testável no preview.

## `AppInner` — a troca do núcleo (fazer primeiro)

| Antes | Depois |
|---|---|
| `const [reservas, setReservas] = useState([])` + `loadKey("reservas_v5")` | `const { reservations, pending, loading, error, ...actions } = useReservations(data)` |
| `const [financeiro, setFinanceiro] = useState([])` | `useFinance(mesRef)` |
| `const [operacao, setOperacao] = useState(...)` | `useOperation()` + `useVehicles()` |
| `const [config, setConfig] = useState(...)` (trips/segunda) | `useSettings()` + `routePointsService` (via um `useRoutePoints()` a criar) |
| `const [crm, setCrm] = useState({})` | vem de `customers.notes` — `useCustomers()` |
| `const [usuario, setUsuario] = useState("Dono")` + `<TextInput>` | `useAuth().profile.name` (read-only) |
| `sincronizarAgora` (polling 8s) + `assinaturaRef` | **apagar** — `useRealtimeTable` já está dentro dos hooks |
| `runDiagnostics` effect que reescreve o array | **apagar a parte de escrita** — o banco valida (`check (quantidade > 0)`, trigger de capacidade). A aba Sistema pode manter um diagnóstico só-leitura (`select ... from v_trip_occupancy where occupied > capacity`) |
| `<GlobalStyles/>` com skeleton inline | já foi para `ui/motion` (PR #17) |

Enquanto `loading` → `<TabSkeleton tab={tab} />`. Se `error` → tela de erro
com `refetch`.

## Abas — ordem sugerida (mais crítica → menos)

### 1. Agenda (`AgendaTab`) — núcleo operacional

- `reservas` → `reservations` (de `useReservations(data)`), `pendentes` →
  `pending`.
- `atualizarStatus(id, "embarcado")` → `markPassengers(id, "embarcado")`.
- `confirmarPendente(r)` → `confirmReservation(r.id, { routePointCode })`.
  Não checar vaga no cliente — a RPC/trigger decide; no `catch` oferecer
  lista de espera.
- `salvarEdicao` (EditarReservaModal) → separar: campos que **não** mexem
  em vaga (nome, telefone, desembarque, pagamento) → `editReservation`;
  mudança de data/direção/ponto/quantidade → `moveReservation` (passa pela
  trigger de destino).
- `togglePagamento` / `toggleComprovante` → `paymentsService.markPaid` /
  `markProofReceived` (criar `usePayments` binding se faltar).
- `iniciarViagem` / `finalizarViagem` → `tripsService.startTrip/finishTrip`
  (via `useTrips`). O `prompt("Km...")` pode ficar por enquanto.
- Formato das linhas: a view `v_reservations_flat` já devolve o objeto
  "achatado" que a UI espera (`pontoId`, `bairro`, `valorTotal`,
  `nome`, `telefone`…). Considerar `reservationsService.listByDate` passar
  a consultar `v_reservations_flat` em vez do select aninhado — menos
  remapeamento na UI.

### 2. Reservar (`ReservarTab`) — fluxo do cliente

- Lista de pontos por direção → `routePointsService.listByDirection`.
- Preço do bairro → `routePointsService.getNeighborhoodPrice` (retorna
  `null` → "um atendente confirma", nunca chuta).
- Vagas exibidas → `tripsService.getAvailability` (só para mostrar, nunca
  para decidir — comentário no service).
- `confirmar()` → `createReservation({...})` (ver
  `INTEGRATION-EXAMPLE.jsx`, já tem o mapa de campos). `catch` com
  `code === 'CAPACITY_OR_BUSINESS_RULE'` → oferecer espera
  (`createReservation({ ..., status: 'espera' })`, nunca falha por vaga).
- `confirmarEspera` → `createReservation({ status: 'espera' })`.
- Frete/encomenda → `createReservation({ type: 'frete' | 'encomenda' })`.

### 3. Lista do Dia (`ListaTab`)

- Mesma fonte da Agenda (`useReservations`).
- `mover(id, chaveAlvo)` → `moveReservation(id, { tripDate, direction, routePointCode })`.
- `remove(id)` → `cancelReservation(id)`.

### 4. Passageiros / CRM (`PassageirosTab`)

- `passageiros` (hoje agregado de `reservas`) → `useCustomers()` +
  `customersService.getHistory(customerId)` por cliente aberto.
- `salvarNota(tel, texto)` → `customersService.updateNotes(customerId, texto)`.

### 5. Financeiro (`FinanceiroTab`)

- `financeiro` → `useFinance(mesRef)` (`listByMonth` + `getDaySummary`).
- `add()` → `financeService.addManualEntry`. **Combustível/manutenção
  nunca entram por aqui** — vêm da trigger.
- editar/remover → `financeService.update` / `softDelete`.
- Só `admin`/`financeiro` conseguem (RLS) — esconder a aba para os demais
  (`useHasRole('admin','financeiro')`).

### 6. Operação (`OperacaoTab`)

- Veículos → `useVehicles()`; trocar padrão → `vehiclesService.setDefault`
  (não muda capacidade de viagens já criadas — snapshot).
- Motoristas → `vehiclesService.listDrivers/addDriver/updateDriver/removeDriver`.
- Registros de combustível → `operationService.addFuelRecord` (despesa
  gerada sozinha). Manutenção → `operationService.addMaintenance`.
- % do intervalo → `operationService.getMaintenanceStatus`.

### 7. Dashboard (`DashboardTab`)

- Só leitura. `insights`/`previsaoDemanda` client-side podem continuar,
  mas alimentados por `useReservations` + `useFinance` + `v_trip_occupancy`.
- Os gráficos (`SevenDayCharts`) já estão lazy (PR #17).

### 8. Sistema (`SistemaTab`)

- Pontos/preços → `routePointsService` (update, addCustomPoint,
  removeCustomPoint, listNeighborhoodPricing).
- `modo_atendimento` → `settingsService.setAttendanceMode('ia'|'manual')`.
- Ajuste de segunda → `settingsService.setMondayAdjustment`.
- Diagnóstico → **só leitura** (ver acima). Backup manual (JSON) pode
  continuar exportando o resultado das queries.
- Só `admin` (RLS) — esconder para os demais.

## Depois da migração

- Remover `import "./lib/storageShim.js"` do `main.jsx` e o arquivo.
- Tirar `src/app/App.jsx` do `ignore` do `biome.json` e do `knip.json`;
  rodar `npm run lint --write` e corrigir o que sobrar.
- Mover os helpers puros que ainda vivem no `App.jsx` (fmtBRL, isMonday…)
  para `src/domain` (já tem os equivalentes lá — deduplicar).
- Fechar a issue #10.
