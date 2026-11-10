# Assistente pela Siri (iPhone)

Falar com o assistente da equipe só pela voz, inclusive no CarPlay (issue #290):

> **Você:** "E aí Siri, Rota Van."
> **Siri:** (ouvindo)
> **Você:** "Muda a volta do Zequinha pra sexta."
> **Siri:** "Vou mudar a Volta do Zequinha para sexta, dia 13, em Cantanhede. Confirma?"
> **Você:** "Sim."
> **Siri:** "Feito. Reserva atualizada."

As regras são as mesmas do assistente do app: ele só grava depois do **"sim"**, o preço sai da
tabela, a vaga é conferida pelo app e a reserva fica no nome de quem é dono da chave. "Não"
descarta. A conversa por voz vale por 10 minutos (dá para responder uma pergunta dele).

## 1. Gerar a sua chave (uma vez)

No app: aba **Assistente** → **Usar pela Siri (iPhone)** → **Gerar chave**. Aparecem a **chave**
(começa com `ari_`) e o **endereço**. Copie os dois: a chave não aparece de novo. Perdeu o celular?
Volte ali e toque em **Apagar**: o atalho para na hora.

## 2. Montar o atalho no app Atalhos

Abra o app **Atalhos** → **+** → dê o nome que você vai falar para a Siri (ex.: **Rota Van**;
evite "Agenda", "Lembrete" ou "Mensagem"). Adicione, nesta ordem:

1. **Ditar Texto** — Idioma: Português (Brasil). Parar de ouvir: Após Pausa.
2. **Obter Conteúdo do URL**
   - URL: o **endereço** copiado (termina em `/functions/v1/assistente-voz`)
   - Método: **POST**
   - Cabeçalhos: `Authorization` = `Bearer ` + a **chave** (com um espaço depois de Bearer)
   - Corpo da Solicitação: **JSON**, um campo de texto `texto` = **Texto Ditado**
3. **Obter Valor do Dicionário** — Chave: `fala` — do **Conteúdo do URL**.
4. **Falar Texto** — o **Valor do Dicionário**.
5. **Obter Valor do Dicionário** — Chave: `continuar` — do **Conteúdo do URL**.
6. **Se** — Valor do Dicionário **é** `sim`:
   - **Executar Atalho** — o próprio atalho (ele ouve de novo para o "sim" ou a sua resposta).
7. (Fim do Se.)

Toque em **Concluído**. Teste no celular parado: "E aí Siri, Rota Van" → "quantas vagas tem na
Volta de amanhã?".

## 3. No carro (CarPlay)

Funciona igual: "E aí Siri, Rota Van". Se a Siri pedir para desbloquear o iPhone na primeira vez,
em **Ajustes → Siri** deixe **Permitir Siri Bloqueado** ligado.

## Como funciona (técnico)

- Edge Function `assistente-voz` (`verify_jwt = false`; a autenticação é a chave). A chave é
  guardada só como hash sha256 em `assistente_chaves` (migração 87); `rpc_criar_chave_assistente`
  e `rpc_revogar_chave_assistente`, só para a equipe.
- Resposta sempre `200 { fala, continuar: "sim" | "nao" }`: a Siri lê até os erros.
- Conversa e proposta pendente em `assistente_voz_sessao` (10 min). `ehConfirmacao` /
  `ehRecusa` (módulo puro `assistentePuro.ts`) decidem o "sim" e o "não".
- Usa o mesmo assistente da aba (`_shared/assistente.ts`) no **modo voz** (frases curtas, sem
  listas, termina em "Confirma?"), o mesmo teto de gasto e o mesmo registro de uso.
- O banco é lido como servidor; o que o papel da pessoa não pode ver (conversa do WhatsApp só
  admin, financeiro só admin/financeiro) é barrado no código do assistente.
