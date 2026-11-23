# Skills e MCP do projeto (AGENTS.md §3)

> Parte do `AGENTS.md` (issue #496): mesmas regras, mesma força. Separada para não entrar em
> toda conversa. Leia inteira antes de mexer no assunto; regra nova do assunto entra aqui.

**Skills do Claude em `.claude/skills/`** (issue #282) — carregadas sozinhas quando a tarefa pede:

| Skill | Para quê | Fonte |
|---|---|---|
| `agendar` | lançar no app reservas combinadas no WhatsApp | deste repositório |
| `vercel-react-best-practices` | desempenho em React (o app é Vite/SPA: regras `server-*` não valem) | vercel-labs/agent-skills (MIT) |
| `supabase-postgres-best-practices` | consultas, índices, RLS, migrações | supabase/agent-skills (MIT) |
| `systematic-debugging` | achar a causa antes de corrigir | obra/superpowers (MIT) |
| `verification-before-completion` | rodar e ler a verificação antes de dizer que terminou | obra/superpowers (MIT) |
| `frontend-design` | direção visual intencional, sem cara de template | anthropics/claude-plugins-official (Apache-2.0) |
| `impeccable` | criticar, auditar e polir telas (modo *Operate* nas telas do app; sem o launcher, que baixa binário) | pbakaus/impeccable (Apache-2.0) |
| `make-interfaces-feel-better` | detalhes de polimento: sombras, ícones, tipografia, entrada/saída | jakubkrehel/make-interfaces-feel-better (MIT) |
| `color-expert` | cor: paletas, rampas, contraste WCAG/APCA, espaços de cor | meodai/skill.color-expert (CC BY 4.0) |
| `mobile-app-design` | convenções de toque e acessibilidade no celular (o app é PWA) | awesome-skills/mobile-app-design (MIT no README) |
| `css-animation` | animações HTML/CSS de demonstração de uma função (walkthrough), fora do app | neonwatty/css-animation-skill (MIT) |
| `design-brief` | brief de uma tela antes de construir (`.design/<feature>/`) | julianoczkowski/designer-skills (Apache-2.0) |
| `ui-ux-pro-max` | base local de estilos, paletas, fontes e regras de UX (referência; a identidade AriTur fica) | nextlevelbuilder/ui-ux-pro-max-skill (MIT) |

Design (issue #381): o sistema do app (`ui/`, `ui/motion/`, tokens `C`, §5) vence o que essas skills sugerirem;
elas ajudam a decidir e a revisar, não a trocar a identidade. `taste-skill` (sites de marketing, 39 MB) ficou só na
máquina do dono; `animate-skill` não entrou (sem licença); `canvas-design` já vem da Anthropic.

Cada skill de fora traz `LICENSE` e `ORIGEM.md` (fonte, commit e o que muda neste projeto). Este AGENTS.md
vence em caso de conflito. Skill nova só entra **lida antes**, com licença que permita copiar e sem buscar
instruções na internet a cada uso.

**MCP do shadcn/ui** (issue #379, `.mcp.json`): servidor oficial `npx shadcn@4.23.0 mcp` (versão fixa; `cmd /c`
porque a máquina do dono é Windows), só para **consultar** componentes e exemplos. O app não usa shadcn/ui: o padrão
continua sendo `ui/` e `ui/motion/` (§5). Rodar `init_project` ou trazer componente de lá é mudança à parte, com issue.
