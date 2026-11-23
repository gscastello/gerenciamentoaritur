# Visual aprovado pelo dono (AGENTS.md §5)

> Parte do `AGENTS.md` (issue #496): mesmas regras, mesma força. Separada para não entrar em
> toda conversa. Leia inteira antes de mexer no assunto; regra nova do assunto entra aqui.

**Visual aprovado pelo dono** (issue #391, simulação "Painel de bordo" v16): letra única **Inter** (números de
largura fixa); cores em `C` (`tabShared.jsx`) — preto no fundo, cartões grafite com o canto e o filete em vermelho
escuro (`Card`/`FUNDO_CARTAO`, classe `cartao-at`), vermelho da marca só no que acende. No celular, o topo do app
mostra o AT (`/brand/emblema-at.webp`, sem selo branco), o nome da tela e o dia, o sino e o "Mais" (telas extras e
Sair); cada tela mostra ali só os seus controles. Barra de baixo flutuante com cinco telas e a luz vinho deslizando. Na
Agenda, a lotação é o **mapa dos lugares** do veículo do dia (issue #430, `domain/mapaDosLugares.js`): ônibus de 31
com 2 na frente à esquerda (porta à direita), fileiras de 2 + corredor + 2 e o fundo com 5; van de 15 com 2 + corredor
+ 1 e o fundo com 3.
**Visual v18** (issue #446, simulação aprovada em 17/11): paleta em `C` com neutros puxados para o vermelho da marca
(`#080606`, `#110D0D`, `#1B1616`, `#2B2525`; texto `#F5F3F1`/`#B6AFAD`/`#9E9695`; botão `#D70A20`, a marca `#E4121F`
fica em `C.lanterna`), as mesmas cores como `--at-*` para a `ui/` (ex.: `FolhaDeBaixo`). Na Agenda, a semana fica no
topo com a lotação de cada dia e o mês abre num calendário (`domain/semanaDaAgenda.js`); abas Ida/Volta e a faixa de
cada categoria de embarque ficam presas no topo (`--topo-h`, `--seletor-h`). O Início não muda. Segundo nível de navegação = `SubTabs` (seletor numa caixa); abas de grupo = `SubAbas` (fileira com a linha vermelha); folhas de baixo = `ui/FolhaDeBaixo`. Sem rótulo em maiúsculas. Cadastro repetido: `fn_possiveis_repetidos` / `rpc_juntar_cadastros` (`database/119`, só admin, o que sai é apagado só logicamente).
Artes oficiais em `frontend/public/brand/` (logo para fundo claro e escuro — o slogan já faz parte dela —, AT e a
capa do Início). Toque em todo botão (`btn-press`/`toque-at`), nada sai da tela de 320 a 430 px.
