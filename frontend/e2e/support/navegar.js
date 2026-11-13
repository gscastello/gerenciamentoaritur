// e2e/support/navegar.js
//
// Telas juntas (issue #360): Financeiro, Gestão e Operação ficam no item "Gestão"
// do menu; Conversas, Para lançar, Pendências e Bot no item "Atendimento". Cada
// uma é uma aba (role="tab") no topo da tela do grupo.

const TELAS = {
  financeiro: { menu: "Gestão", aba: "Financeiro" },
  gestao: { menu: "Gestão", aba: "Gestão" },
  operacao: { menu: "Gestão", aba: "Operação" },
  vencimentos: { menu: "Gestão", aba: "Vencimentos" },
  extrato: { menu: "Gestão", aba: "Extrato" },
  fechamento: { menu: "Gestão", aba: "Fechamento" },
  atendimento: { menu: "Atendimento", aba: "Conversas" },
  para_lancar: { menu: "Atendimento", aba: "Para lançar" },
  pendencias: { menu: "Atendimento", aba: "Pendências" },
  bot: { menu: "Atendimento", aba: "Bot" },
};

/** Abre o item do menu (lateral, barra do celular ou "Mais"). Aceita número de aviso no nome. */
export async function abrirMenu(page, nome) {
  // o número de avisos vem antes do nome no celular e depois no computador
  const re = new RegExp(`^(\\d+ )?${nome}( \\d+)?$`);
  await page
    .getByRole("button", { name: /^Agenda/ })
    .first()
    .waitFor();
  let botao = page.getByRole("button", { name: re });
  if ((await botao.count()) === 0 || !(await botao.first().isVisible())) {
    await page.getByRole("button", { name: "Mais" }).click();
    botao = page.getByRole("button", { name: re });
  }
  await botao.first().click();
}

/** Abre uma tela de grupo: o item do menu e depois a aba no topo. */
export async function abrirTela(page, tela) {
  const t = TELAS[tela];
  if (!t) throw new Error(`tela desconhecida: ${tela}`);
  await abrirMenu(page, t.menu);
  await page.getByRole("tab", { name: new RegExp(`^${t.aba}`) }).click();
}

/** Agenda (issue #391): escolhe a viagem no seletor Ida/Volta. */
export async function escolherSentido(page, sentido) {
  await page
    .getByTestId("seletor-sentido")
    .getByRole("tab", { name: new RegExp(`^${sentido}`) })
    .click();
}

/** "Sair da conta": na lateral do computador; no celular fica no "Mais" do topo (issue #391). */
export async function sairDaConta(page) {
  const sair = page.getByRole("button", { name: "Sair da conta" }).filter({ visible: true });
  if ((await sair.count()) === 0) await page.getByRole("button", { name: "Mais" }).click();
  await page
    .getByRole("button", { name: "Sair da conta" })
    .filter({ visible: true })
    .first()
    .click();
}
