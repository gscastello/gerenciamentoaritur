# Issues — prontas para criar de verdade com `gh` CLI

> Não encontrei um conector de GitHub disponível nesta conversa (verifiquei
> o diretório de conectores duas vezes), então não consigo abrir Issues/PRs
> daqui. Rode os comandos abaixo (com `gh auth login` já feito) dentro do
> repositório para criar tudo de uma vez — ou cole o corpo manualmente na
> UI do GitHub. Cada `gh issue create` já sai com o label certo.

```bash
gh issue create -t "Conectar bot de WhatsApp (WhatsApp Business API) ao motor de reservas" \
  -l "feature,integração" -b "Implementar o backend que recebe mensagens do WhatsApp Business API (ou Twilio/360dialog) e conduz o roteiro completo: data → viagem (Ida/Volta) → local de embarque (com sub-perguntas de BR/Outro/Volta) → quantidade → local de desembarque → pagamento → confirmação, gravando direto no Postgres (ver DATABASE.md).
Critério de aceite: reserva feita pelo WhatsApp aparece na Agenda em até 2s, respeitando lotação compartilhada por viagem e idempotência por wa_message_id."

gh issue create -t "Detectar automaticamente cidades intermediárias e criar fila de pendentes" \
  -l "feature,integração,crítico" -b "Ao receber texto livre de embarque/desembarque, checar contra a lista de cidades atendidas (São Luís, Cantanhede, Pirapemas). Fora dessas, marcar reserva como pendente, não contar na lotação, avisar o cliente que vamos verificar, e notificar a equipe (WhatsApp interno ou e-mail).
Hoje o app faz isso com uma heurística de palavras-chave (Bacabeira, Santa Rita, Entroncamento, Colombo, Miranda, Matões) — evoluir para reconhecimento mais robusto (NLP) é bem-vindo, mas sem perder o fallback humano."

gh issue create -t "Webhook de comprovante Pix" \
  -l "feature,integração,financeiro" -b "Quando o cliente escolhe Pix, orientar o envio do comprovante pelo WhatsApp e anexar a mídia recebida à reserva correspondente (wa_message_id) para conferência manual, sem baixa automática."

gh issue create -t "Redirecionamento de pedidos de Frete para atendimento humano" \
  -l "feature" -b "Ao escolher 'Frete', não seguir o roteiro de passagem — coletar só nome/telefone e criar um item pendente do tipo frete, sinalizando para a equipe assumir a conversa. Já implementado no protótipo (ReservarTab); falta ligar ao encaminhamento real (transferência de atendimento no WhatsApp Business API)."

gh issue create -t "Job agendado de diagnóstico e auto-correção (Agenda/Reservas)" \
  -l "bug,crítico" -b "Portar a lógica de runDiagnostics do app (quantidade inválida, overbooking, ponto de embarque inexistente, reserva sem telefone, ids duplicados) para um job agendado no backend, gravando achados em auditoria e alertando via Sentry/Datadog. Nenhuma correção automática pode acontecer em reserva confirmada sem deixar rastro auditável."

gh issue create -t "Persistir reservas em Postgres (schema em DATABASE.md)" \
  -l "feature,crítico" -b "Substituir o window.storage do protótipo por um backend real sobre o schema de DATABASE.md, com trigger de checagem de lotação, unique constraint em wa_message_id para idempotência, e backup diário automático."

gh issue create -t "Flag de modo de atendimento (IA ⇄ manual) lida pelo bot" \
  -l "feature" -b "Expor endpoint/consulta que o bot do WhatsApp checa antes de responder automaticamente, refletindo a mesma flag editável na aba Sistema do painel (modo_atendimento: ia | manual)."

gh issue create -t "Validar overbooking também na edição manual de reserva" \
  -l "bug,crítico" -b "Confirmar que a edição manual de quantidade/ponto de embarque/data nunca ultrapassa a lotação compartilhada da viagem — cobertura de teste tanto na criação quanto na edição via EditarReservaModal."

gh issue create -t "Notificação automática da lista para o motorista" \
  -l "enhancement" -b "Enviar a lista de passageiros por viagem/ponto de embarque para o motorista X minutos antes do horário, no formato NP Local (telefone) já usado na Agenda e na Lista do Dia."

gh issue create -t "Autenticação e papéis (dono / motorista / atendente)" \
  -l "enhancement,segurança" -b "Separar visão do motorista (Agenda + checklist de embarque) da visão do dono (acesso completo) e de um possível atendente humano, com login simples."

gh issue create -t "Exportar relatório financeiro mensal/anual" \
  -l "feature,financeiro" -b "Botão no Dashboard/Financeiro para exportar faturamento e lucro por dia/mês/ano em PDF ou XLSX, a partir dos dados já exibidos no calendário do Financeiro e dos totais por período em Operação."
```

## Template de PR (usar sempre)

```markdown
## O que muda
...
## Por quê
...
Closes #<issue>
## Como testar
...
## Checklist
- [ ] Lint (Biome) passando
- [ ] Testes unitários/integração passando
- [ ] Playwright (e2e) passando nos fluxos de Agenda/Reservas afetados
- [ ] Sem regressão de acessibilidade/motion (prefers-reduced-motion respeitado)
- [ ] Se toca em reservas: sem risco de perda de dado (idempotência/transação confirmadas)
```

## Assim que o conector de GitHub aparecer disponível

Me avise ou apenas peça de novo — eu crio as Issues e abro os PRs
referenciando cada uma (`Closes #N`) de verdade, em vez de só deixar os
comandos prontos.
