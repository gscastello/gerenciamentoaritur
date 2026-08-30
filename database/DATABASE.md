# DATABASE.md — Arquitetura de dados V3 (PostgreSQL / Supabase)

> Esta é a segunda geração do banco de dados do Rota Pirapemas. A versão
> anterior (schema simples em `reservas`/`financeiro`/`operacao`) foi
> substituída por um modelo normalizado, com RLS por papel e proteção de
> lotação garantida pelo próprio banco — não apenas pelo frontend.
>
> Arquivos deste pacote:
> - `supabase-schema.sql` — todas as tabelas, enums, índices, triggers.
> - `supabase-rls-policies.sql` — Row Level Security por papel.
> - `supabase-seed.sql` — dados iniciais (veículos, pontos, bairros, config).
> - Ordem de execução: **schema → RLS → seed**.

---

## 1. Por que normalizar

No V2, uma "reserva" era um único registro solto guardando tudo junto:
cliente, quantidade, ponto, pagamento, histórico como array JSON dentro do
próprio registro. Isso funcionava para o protótipo, mas tinha três
problemas de fundo que a arquitetura V3 resolve:

1. **Quantidade sem granularidade** — uma reserva de "3 passagens" era um
   único número, não 3 pessoas reais. Agora `reservation_passengers` cria
   uma linha por lugar, permitindo, por exemplo, que 2 embarquem e 1 não
   compareça na mesma reserva — o que a versão anterior não conseguia
   representar.
2. **Histórico falsificável** — o campo `historico` era um array editável
   dentro do próprio registro, poderia ser escrito por qualquer chamada. A
   `audit_logs` agora é uma tabela separada, **insert-only**, alimentada
   por trigger de banco (não pela aplicação) — ninguém consegue "reescrever
   o passado" nem fingir quem fez a alteração.
3. **Capacidade viva e global** — o V2 calculava lotação a partir de um
   valor de veículo global e mutável, recalculado a qualquer momento. No
   V3, `trips.capacity` é um **snapshot** gravado na criação da viagem — se
   o dono trocar o veículo padrão amanhã, viagens já criadas não são
   afetadas retroativamente.

## 2. As 22 tabelas (16 pedidas + 6 de apoio)

| Tabela | Papel |
|---|---|
| `users` | Perfil de aplicação sobre o `auth.users` do Supabase, com `role`. |
| `customers` | Passageiros / CRM. |
| `drivers` | Motoristas (podem ou não ter login). |
| `vehicles` | Frota (ônibus/van), com capacidade e veículo padrão. |
| `route_points` | Pontos de embarque/desembarque configuráveis (substitui o `TRIPS_PADRAO` fixo no frontend). |
| `neighborhood_pricing` | Preço de "Buscar em Casa" por bairro. |
| `settings` | Chave/valor: ajuste de segunda, Pix, modo de atendimento. |
| `trips` | Uma Ida ou Volta de um dia específico — aqui a capacidade é congelada. |
| `reservations` | Cabeçalho da reserva (cliente, viagem, tipo, status, preço). |
| `reservation_passengers` | Um registro por passageiro/lugar dentro da reserva. |
| `boarding_records` | Log imutável de embarque/desembarque/no-show. |
| `payments` | Pagamentos — fonte de verdade sobre "pago"/comprovante. |
| `financial_entries` | Livro-caixa (receita/despesa). |
| `fuel_records` | Abastecimento, por veículo. |
| `maintenance` | Manutenção preventiva, por veículo, com histórico. |
| `operational_occurrences` | Atraso, pane, reclamação, acidente. |
| `notifications` | Fila/log de mensagens (WhatsApp/SMS/e-mail). |
| `audit_logs` | Auditoria real, insert-only. |

Tabelas de apoio criadas além da lista pedida, porque o negócio já
depende delas hoje: `route_points` e `neighborhood_pricing` (para não
depender de arrays fixos no código) e a view `v_trip_occupancy` (consulta
rápida de vagas, usada pelo backend antes de tentar inserir).

## 3. Como o overbooking é impedido pelo banco (não pelo frontend)

A garantia final não é uma checagem de tela — é a trigger
`fn_check_trip_capacity()` em `supabase-schema.sql`, seção 22:

1. Antes de inserir/atualizar um `reservation_passenger` para status que
   ocupa vaga (`confirmado` ou `embarcado`), a trigger **trava a linha da
   viagem correspondente** (`select ... for update`).
2. Enquanto essa transação não terminar (commit ou rollback), qualquer
   outra tentativa de reservar a mesma viagem **espera** — não há
   condição de corrida possível entre dois clientes reservando ao mesmo
   tempo, porque o Postgres serializa o acesso a essa linha.
3. Só então ela conta quantos lugares já estão ocupados e compara com
   `trips.capacity`. Se estourar, a transação inteira é revertida com
   `raise exception 'CAPACIDADE_EXCEDIDA...'` — nada é gravado.

O backend (bot do WhatsApp ou painel) pode consultar `v_trip_occupancy`
antes de tentar, só para responder rápido ao cliente ("restam 3 vagas"),
mas **quem garante que nunca há overbooking é a trigger, não essa
consulta prévia** — a consulta pode ficar desatualizada entre o instante
em que foi lida e o instante da escrita; a trigger não.

## 4. RLS — o que cada papel pode fazer

Resumo (detalhes completos em `supabase-rls-policies.sql`):

- **admin** — acesso total a todas as tabelas.
- **atendente** — cria/edita `customers`, `reservations`,
  `reservation_passengers`, registra `payments`; **lê** viagens e
  configuração; não acessa `financial_entries`/`maintenance`/`fuel_records`.
- **motorista** — só enxerga `trips` onde é o motorista designado (e as
  reservas/passageiros dessas viagens); registra `boarding_records`,
  `operational_occurrences` e pode lançar `fuel_records` da própria
  viagem; **não vê nada financeiro** nem edita preços/configuração.
- **financeiro** — leitura ampla de reservas para conferência; leitura e
  escrita total em `payments`, `financial_entries`, `fuel_records`,
  `maintenance`; não edita o conteúdo da reserva em si (isso é do
  atendente).

`audit_logs` não tem policy de update/delete para ninguém — sem policy
explícita, o Postgres nega por padrão com RLS habilitado. Correção de
erro em auditoria vira um **novo registro**, nunca reescreve o antigo.

O bot do WhatsApp deve se conectar com a **service role key** do Supabase
(ignora RLS), atribuindo as ações a um usuário de sistema dedicado ("Bot
WhatsApp") para a auditoria diferenciar IA de humano — ver nota no final
de `supabase-rls-policies.sql`.

## 5. Soft delete, timestamps e autoria

Todas as tabelas de domínio seguem o mesmo contrato: `id uuid`,
`created_at`/`updated_at` (mantido por trigger `fn_set_updated_at`),
`created_by`/`updated_by` (referenciando `users`), e `deleted_at` para
soft delete — nunca `DELETE` físico em dado que já teve valor financeiro
ou operacional associado. Índices únicos relevantes (placa, telefone,
bairro, ponto por direção) são todos **parciais** (`where deleted_at is
null`), para permitir recriar um registro com o mesmo valor depois de
"apagado" sem violar unicidade.

## 6. Estratégia de migração dos dados atuais (V2 → V3)

Os dados do V2 vivem em `window.storage` do próprio app (chaves
`reservas_v5`, `financeiro_v5`, `operacao_v5`, `config_v5`, `crm_v5`,
`usuario_v5`). O caminho mais seguro é usar o **botão "Baixar backup"
que já existe na aba Sistema** como fonte de extração — ele já exporta
exatamente esses blobs em um único JSON.

### Passo a passo

1. **Extrair**: baixar o backup JSON de produção (aba Sistema → Backup
   manual) no dia da migração, o mais próximo possível do corte.
2. **Provisionar o banco**: rodar `supabase-schema.sql` →
   `supabase-rls-policies.sql` → `supabase-seed.sql` num projeto Supabase
   novo (o seed já recria veículos, pontos e preços de bairro idênticos
   ao que está fixo no frontend hoje).
3. **Transformar e carregar** (script único, Node ou Python, rodado uma
   vez, fora do horário de operação):

   | Campo no JSON do V2 | Tabela/campo no V3 |
   |---|---|
   | `operacao.veiculos.onibus` / `.van` | `vehicles` (usar os mesmos `id` se possível, ou mapear por `plate`) |
   | `operacao.motoristas[]` | `drivers` |
   | `operacao.veiculoAtivo` | vira o `vehicle_id` de cada `trips` criada a partir da data em diante |
   | `config.trips.ida/volta.pontos[]` | `route_points` (por `direction`+`code`) |
   | `config.segundaAtiva`/`segundaHoras` | `settings['monday_adjustment']` |
   | `reservas[].data + direcao` | uma linha de `trips` por par (data, direção) — criar antes de importar as reservas que apontam para ela |
   | `reservas[]` (cada item) | uma linha de `reservations` + **N linhas de `reservation_passengers`** (uma para cada unidade de `quantidade`) |
   | `reservas[].historico[]` | linhas em `audit_logs` com `action='create'`/`'status_change'`, `performed_at = historico[i].quando`, tentar casar `historico[i].funcionario` (texto livre) com um `users.name` existente; se não achar, gravar `performed_by = null` e manter o nome original dentro de `after_data` |
   | `reservas[].pago`/`.comprovanteRecebido` | uma linha em `payments` por reserva paga, com `status='pago'` e `proof_received` |
   | `financeiro[]` | `financial_entries` — **atenção**: filtrar antes da carga qualquer lançamento manual de combustível/manutenção que já vai ser recriado automaticamente a partir de `operacao.registros`/`operacao.manutencoes` (a trigger nova gera esse lançamento sozinha), para não duplicar o histórico importado |
   | `operacao.registros[]` | `fuel_records` (por veículo — no V2 não havia essa amarração; se não for possível saber qual veículo rodou em cada registro antigo, importar tudo apontando para o veículo padrão e sinalizar para conferência manual) |
   | `operacao.manutencoes[]` | `maintenance` |
   | `crm[telefone].notas` | `customers.notes`, casando por `telefone` |
   | `usuario_v5` (nome ativo no app) | criar um `users` inicial com esse nome e `role='admin'` |

4. **Congelar capacidade retroativa**: para toda `trips` criada a partir
   de reservas antigas, gravar `capacity` igual à capacidade do veículo
   que estava ativo naquela data (aproximação: usar 31 salvo indicação em
   contrário, já que o V2 não guardava isso por viagem — é exatamente a
   lacuna que a V3 fecha para o futuro).
5. **Validar**: rodar a `view v_trip_occupancy` sobre os dados
   importados e conferir se nenhuma viagem migrada aparece com
   `occupied > capacity` — se aparecer, é sinal de um overbooking que já
   existia no V2 antes da correção do backend; decidir manualmente
   (cancelar o excedente ou ajustar a capacidade histórica) antes de
   liberar o novo banco para uso.
6. **Trocar a camada de persistência do frontend**: substituir as funções
   `loadKey`/`saveKey` (que hoje falam com `window.storage`) por chamadas
   ao cliente JS do Supabase, mantendo a mesma interface de dados que os
   componentes já esperam — a lógica visual do app **não muda**.
7. **Cutover**: rodar os dois sistemas em paralelo por um dia (V2
   somente leitura, V3 recebendo as reservas novas), depois desligar o
   V2.

### O que NÃO migrar automaticamente

- Registros de `historico` cujo `funcionario` seja um valor genérico tipo
  `"—"` ou vazio — importar mesmo assim, mas sinalizar em `after_data`
  para não se perder a trilha, sem tentar adivinhar autoria.
- Combinações de `financeiro[]` que batam exatamente com um
  `operacao.registros[]`/`operacao.manutencoes[]` do mesmo dia e valor —
  são candidatas a dupla contagem (bug já identificado na versão
  anterior) e devem ser revisadas manualmente, não importadas às cegas.
