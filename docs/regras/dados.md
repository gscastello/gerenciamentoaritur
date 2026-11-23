# Persistência de dados (AGENTS.md §6)

> Parte do `AGENTS.md` (issue #496): mesmas regras, mesma força. Separada para não entrar em
> toda conversa. Leia inteira antes de mexer no assunto; regra nova do assunto entra aqui.

## 6. Persistência de dados (reserva nunca pode se perder)

- Fonte de verdade em produção é o Postgres descrito em
  `database/DATABASE.md`, **não** o `storageShim`/localStorage (que é só
  para rodar o protótipo em dev).
- Toda criação de reserva é **transacional e idempotente** por
  `wa_message_id` (no bot, `cw-<id da mensagem no Chatwoot>`) — reenvio de
  webhook nunca duplica. O telefone do cliente é **sempre normalizado**
  (`fn_normalizar_telefone`: só dígitos, sem `+55`) e buscado também com/sem o
  nono dígito — senão o mesmo número vira dois clientes.
- **Sem internet** (issue #355): a Agenda abre com a **cópia da última leitura** guardada no aparelho
  (`src/lib/copiaOffline.js`, `offlineKey` no `useSupabaseQuery`), com o aviso "Sem internet" e a hora da cópia.
  É só para **ler**: gravar continua indo ao banco. Só guarda com "Permanecer conectado"; sair da conta apaga.
  Sem rede para renovar o token, o app segue com a sessão e o perfil guardados em vez de voltar ao login.
- **Comprovante Pix no WhatsApp** (issue #363, `comprovantePuro.ts`, `database/100`): o bot lê o comprovante (valor,
  data, quem recebeu, id da transação) em qualquer modo. Só dá baixa quando é comprovante, quem recebeu é a empresa
  (`settings.pix`), a data é dos últimos 10 dias e o valor é exatamente o de reserva(s) do cliente em aberto;
  `rpc_baixa_por_comprovante` confere de novo no banco (soma, já pago, comprovante repetido). Qualquer dúvida vira
  pendência com o motivo, e tudo fica em `comprovantes_pix`.
- **Rota** (issue #411, antiga Lista do Dia): o embarque é só o da **Volta** — quem buscamos em casa em Pirapemas e
  Cantanhede, na ordem da rota. O **Desembarque** é só a lista anotada na viagem (issue #440: o desembarque da Ida por
  cidade da #428 saiu a pedido do dono; `dropoff_seq`/`rpc_reorder_dropoff` ficam no banco, sem uso na tela). O Bloco
  de notas (aba) saiu (issue #428): a tabela `notes` fica, nada foi apagado.
- **Desembarque anotado na viagem** (issue #383, Rota → Desembarque, `database/106`): lista livre por dia e
  sentido, que começa em branco e **não muda a reserva** (decisão do dono). Grava no aparelho primeiro (copiaOffline)
  e envia por `rpc_salvar_lista_desembarque`, que **junta** linha por linha (vale o `em` mais recente; apagar é marcar
  `apagada`) — mesma regra de `domain/listaDesembarque.js`. Dois aparelhos na mesma viagem não se apagam.
  **Organizar e Copiar** (issue #440, `database/116`): a ordem vai em cada linha (`ordem`; sem ela, a hora em que foi
  anotada) e mover uma linha só muda essa linha (`reordenarLinhas`), então a junção por linha continua valendo;
  "Copiar" leva o texto na ordem da tela, numerado, com ✓ em quem desceu (`textoDaListaAnotada`).
- **Lista com mais de 1.000 linhas** (issue #442, crítico): o Supabase devolve no máximo 1.000 linhas por consulta e
  **corta o resto sem erro**. A janela de reservas da Agenda passou disso e as reservas mais novas sumiram do app (um
  passageiro não foi embarcado). Toda lista que pode passar de 1.000 usa `buscarTodasAsPaginas` (`src/lib/paginas.js`),
  com ordem estável (criação + id); nunca `.limit(N)` acima de 1.000 achando que vem tudo.
- **Nada de dado incompleto ou velho calado** (issue #444, crítico): três travas além da paginação. (1) A guarda do
  cliente (`src/lib/guardaDeListas.js`, ligada no `supabaseClient`) olha toda leitura: 1.000 linhas num pedido sem
  `offset` = lista cortada → faixa "Lista incompleta" na tela (`AvisoListaCortada`) e erro `LISTA_CORTADA` no registro.
  (2) O teste `services/__tests__/listasSemCorte.test.js` falha quando um service ganha lista sem limite, sem paginação
  e fora da lista de tabelas pequenas (com o motivo). (3) O tempo real perde eventos com a conexão caída:
  `useRealtimeTable` relê ao reconectar, ao voltar para a frente (15 s ou mais escondido) e quando a internet volta; a
  janela de reservas relê também de 2 em 2 minutos. `useSupabaseQuery` só deixa a leitura mais nova escrever na tela.
  O app instalado procura versão nova de hora em hora e ao voltar para a frente (`PWAUpdatePrompt`).
- **Quem não está logado não tem grant em tabela nenhuma** (`database/117`): tabela nova não ganha grant para `anon`;
  RPC `security definer` chamada pelo app confere o papel (`fn_has_role`) e usa `auth.uid()` como autor.
- Cancelamento é sempre `UPDATE status`, **nunca `DELETE`**.
- Backup diário automático no provedor + botão de backup manual (JSON) na
  aba Sistema.
