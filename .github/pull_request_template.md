## O que muda

## Por quê

Closes #<issue>

## Como testar

## Checklist

- [ ] Lint (Biome) passando — `npm run lint`
- [ ] Knip sem código/dependência morta — `npm run knip`
- [ ] Contrato de arquitetura ok — `npm run arch`
- [ ] Testes unitários/integração passando — `npm run test`
- [ ] Mutation testing acima do limite — `npm run test:mutation` (se tocou `src/domain`)
- [ ] Playwright (e2e) passando nos fluxos afetados — `npm run test:e2e`
- [ ] Sem regressão de acessibilidade/motion (`prefers-reduced-motion` respeitado)
- [ ] Toda tela nova/alterada tem skeleton, lazy-load e transição de entrada/saída
- [ ] Se toca em reservas: sem risco de perda de dado (idempotência/transação confirmadas)
- [ ] Eventos de observabilidade nomeados nas funções críticas alteradas
- [ ] README.md "Estado atual" atualizado, se este PR muda o que está pronto/pendente

