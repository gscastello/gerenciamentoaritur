# Integração Frontend ⇄ Supabase — Rota Pirapemas V3

> **Aviso importante antes de tudo**: não tenho acesso a um projeto
> Supabase real nem a rede neste ambiente, então não consegui *executar*
> nada disso contra um banco de verdade — o que entrego aqui é código
> completo e coerente (services, hooks, RPC, exemplo de integração), não
> um teste passando. Antes de considerar isso "pronto para produção",
> rode `supabase-schema.sql` → `supabase-rls-policies.sql` →
> `supabase-rpc-functions.sql` → `supabase-seed.sql` num projeto real,
> preencha o `.env`, e teste o fluxo de reserva manualmente com dois
> usuários em duas abas.

Dependência nova necessária no `package.json`:
```json
"dependencies": {
  "@supabase/supabase-js": "^2.45.0"
}
```

---

## Quais arquivos foram criados

**Banco (SQL, em `/mnt/user-data/outputs/`, sequência de execução):**
1. `supabase-schema.sql` *(já existia da etapa anterior)*
2. `supabase-rls-policies.sql` *(já existia)*
3. `supabase-rpc-functions.sql` — **novo nesta etapa**: as funções
   `rpc_create_reservation`, `rpc_confirm_reservation`,
   `rpc_cancel_reservation`, `rpc_set_passengers_status`,
   `rpc_move_reservation`, `rpc_start_trip`, `rpc_finish_trip`.
4. `supabase-seed.sql` *(já existia)*

**Frontend (JS, em `src/`):**
- `src/lib/supabaseClient.js`
- `src/services/reservationsService.js`
- `src/services/tripsService.js`
- `src/services/customersService.js`
- `src/services/paymentsService.js`
- `src/services/financeService.js`
- `src/services/operationService.js`
- `src/services/vehiclesService.js`
- `src/services/usersService.js`
- `src/hooks/useSupabaseQuery.js` (genérico: loading/error/retry)
- `src/hooks/useRealtimeTable.js` (genérico: assinatura de tempo real)
- `src/hooks/useAsyncAction.js` (genérico: mutação com retry seguro)
- `src/hooks/useReservations.js`
- `src/hooks/useTrips.js`
- `src/hooks/useCustomers.js`
- `src/hooks/usePayments.js`
- `src/hooks/useFinance.js`
- `src/hooks/useOperation.js`
- `src/hooks/useVehicles.js`
- `src/hooks/useUsers.js`
- `src/INTEGRATION-EXAMPLE.jsx` — prova de integração comentada (antes/depois) do caminho Reservar → Agenda
- `.env.example`

## Quais arquivos foram modificados

**Nenhum arquivo do app visual (`rota-pirapemas-app.jsx`) foi
reescrito nesta etapa.** Por instrução explícita ("manter a interface
atual o mais intacta possível" + "primeiro faça o banco e a
sincronização funcionarem"), priorizei entregar a camada de dados
completa e testável isoladamente, com um exemplo de integração real e
comentado (`INTEGRATION-EXAMPLE.jsx`) mostrando exatamente o que muda no
topo do `AppInner` e dentro do `ReservarTab`. Aplicar esse mesmo padrão
nas abas restantes (Financeiro, Operação, Passageiros, Sistema) é
mecânico — trocar o `useState` alimentado por `loadKey` pelo hook
correspondente — mas run risco de reescrever ~1000 linhas de JSX de uma
vez sem poder testar contra um banco real. Prefiro te devolver isso
revisável em partes a entregar um diff gigante não verificado.

## Quais funções antigas foram removidas (conceitualmente — a remoção
física acontece quando você aplicar o padrão do `INTEGRATION-EXAMPLE.jsx`
no `rota-pirapemas-app.jsx`)

- `loadKey(key, fallback)` — lia do `window.storage`. **Removida.**
  Substituída pelos hooks de leitura (`useReservations`, `useTrips` etc.),
  que consultam o Postgres diretamente.
- `saveKey(key, value)` — escrevia o array/objeto inteiro no
  `window.storage`. **Removida.** Substituída por escrita granular via
  `services/*` (um `UPDATE`/`INSERT` por operação, nunca "regravar tudo").
- `sincronizarAgora()` (polling a cada 8s comparando `JSON.stringify`) —
  **Removida.** Substituída por `useRealtimeTable`, que reage a mudanças
  reais assim que acontecem (sem o atraso de até 8s, e sem comparar blobs
  inteiros de JSON a cada rodada).
- `assinaturaRef` (hash manual para detectar mudança) — **Removida**,
  não é mais necessária: o Realtime já entrega só o que mudou.
- `runDiagnostics()` client-side que "corrigia" `quantidade` inválida
  direto no array local — a validação de dado agora é responsabilidade
  do banco (`check (quantidade > 0)` nas colunas, e a trigger de
  capacidade recusando o que não faz sentido). O diagnóstico da aba
  Sistema pode continuar existindo como uma consulta de leitura
  (ex.: `select * from v_trip_occupancy where occupied > capacity`), mas
  não precisa mais *escrever* para "corrigir" nada.

## Como o fluxo de reserva funciona agora

1. O atendente preenche o formulário normalmente (nenhuma mudança visual).
2. Ao confirmar, o frontend chama **uma única função**:
   `reservationsService.create(payload)` → por baixo, isso é uma chamada
   RPC (`supabase.rpc("rpc_create_reservation", ...)`), **não** um
   `INSERT` direto.
3. Essa função RPC roda **inteira dentro de uma transação no Postgres**:
   cria/atualiza o cliente, garante que a viagem do dia existe, cria o
   cabeçalho da reserva e, por fim, cria uma linha por passageiro em
   `reservation_passengers`.
4. É exatamente nesse último passo que a trigger `fn_check_trip_capacity`
   entra em ação (definida em `supabase-schema.sql`) — ela trava a linha
   da viagem, conta quantos lugares já estão ocupados e só permite seguir
   se ainda houver vaga.
5. Se não houver vaga, a função inteira é revertida (nada é gravado) e
   devolve `{ success: false, message: "..." }` — o
   `reservationsService.create` transforma isso num erro JS que a tela
   captura para oferecer lista de espera.
6. Se confirmar, o hook `useReservations` chama `refetch()` e, além
   disso, o `useRealtimeTable` já havia assinado mudanças na tabela —
   **qualquer outro atendente com a tela aberta vê a nova reserva
   aparecer sozinha**, sem apertar nada.
7. Reserva pendente ("fora da área") ou em lista de espera nasce com os
   passageiros em status `'cancelado'` (não ocupam vaga de verdade) —
   só quando alguém chama `confirmReservation` (que dispara
   `rpc_confirm_reservation`) é que a trigger de capacidade é testada
   de fato. Isso corrige, no nível do banco, o mesmo furo que a
   auditoria anterior apontou no "mover" da Lista do Dia da V2.

## Como o sistema impede que dois atendentes ocupem a mesma vaga

Isto é o ponto central de toda a mudança, então vale ser bem explícito:

- **Não é otimismo de UI.** O app deliberadamente **não** marca a
  reserva como "confirmada" na tela antes de o banco confirmar. Não há
  "atualização otimista" no fluxo de criação — isso é comentado
  explicitamente em `useReservations.js`.
- **Não é um `SELECT` de vagas antes de inserir.** Esse tipo de
  checagem ("vamos ver se cabe, e se couber, insere") é exatamente o
  padrão que causa condição de corrida: dois atendentes podem fazer o
  `SELECT` ao mesmo tempo, ambos verem "1 vaga", e ambos inserirem.
  `tripsService.getAvailability()` existe só para *exibir* "restam N
  vagas" rapidamente na tela — o comentário no código deixa isso
  explícito e proíbe usá-lo como decisão.
- **A garantia real é `SELECT ... FOR UPDATE` na linha da viagem**,
  dentro da trigger, chamada dentro da mesma transação da função RPC.
  Isso significa: se dois atendentes clicarem "Confirmar" no mesmo
  segundo para a última vaga da mesma viagem, o Postgres **serializa**
  as duas transações — uma delas trava esperando a outra terminar. A
  que terminar primeiro ocupa a vaga; a segunda, ao rodar sua contagem,
  já vê a vaga ocupada e é recusada. Não existe janela de tempo em que
  as duas contagens rodam "ao mesmo tempo" vendo o mesmo número de vagas
  livres — é isso que uma trava de linha (`FOR UPDATE`) garante, e é
  exatamente o motivo de a checagem viver no banco, e não no
  `reservas.filter(...).reduce(...)` que existia no frontend da V2.

## O que fica para a próxima etapa (por instrução explícita, não foi feito agora)

- Integração com WhatsApp Business API (o bot que hoje é simulado com
  `alert()` no protótipo).
- GPS/rastreamento contínuo (hoje só há os dois campos de km/localização
  de saída e chegada, via `rpc_start_trip`/`rpc_finish_trip`).
- Reescrever fisicamente `rota-pirapemas-app.jsx` inteiro para consumir
  os hooks — o padrão já está prontinho e testável em
  `INTEGRATION-EXAMPLE.jsx`, faltando aplicá-lo aba por aba.
