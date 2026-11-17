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

/** "Sair da conta": na lateral do computador; no celular fica no "Mais" do topo (issue #391), com confirmação. */
export async function sairDaConta(page) {
  const sair = page.getByRole("button", { name: "Sair da conta" }).filter({ visible: true });
  if ((await sair.count()) === 0)
    await page.getByRole("button", { name: "Mais", exact: true }).click();
  await page
    .getByRole("button", { name: "Sair da conta" })
    .filter({ visible: true })
    .first()
    .click();
  // no celular a folha do "⋯" pede confirmação antes de sair (issue #446)
  const confirmar = page
    .getByTestId("folha-mais")
    .getByRole("button", { name: "Sair", exact: true });
  if (await confirmar.count()) await confirmar.click();
}

const PONTOS_DA_VOLTA = /pirapemas|cantanhede/i;

/**
 * Agenda (issue #393): o campo "Anotar" de cada ponto abre ao tocar em "Anotar em <ponto>".
 * Escolhe a viagem do ponto no seletor, abre o campo se preciso e devolve o campo.
 */
export async function campoAnotar(page, ponto) {
  const campo = page.getByLabel(`Anotar reserva — ${ponto}`);
  if ((await campo.count()) > 0) return campo;
  const abrir = page.getByRole("button", { name: `Anotar em ${ponto}` });
  if ((await abrir.count()) === 0)
    await escolherSentido(page, PONTOS_DA_VOLTA.test(ponto) ? "Volta" : "Ida");
  await abrir.first().click();
  return campo;
}

/** Agenda (issue #393): abre o menu "⋯" da linha da reserva de `nome` e toca em `acao`. */
export async function acaoDaReserva(page, nome, acao) {
  await page
    .getByRole("button", { name: `Mais ações de ${nome}` })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: acao }).click();
}

/**
 * Agenda (issue #446): leva a Agenda para o dia `iso` pelo calendário do mês (a semana no topo e
 * o calendário substituíram a barra com setas). Se já está no dia, não faz nada.
 */
export async function irParaODia(page, iso) {
  const titulo = page.getByTestId("dia-da-agenda").filter({ visible: true }).first();
  await titulo.waitFor();
  if ((await titulo.getAttribute("data-dia")) === iso) return;
  await page
    .getByRole("button", { name: "Abrir o calendário do mês" })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByTestId("calendario-do-mes").getByLabel("Ir para a data").fill(iso);
  await page.getByTestId("calendario-do-mes").waitFor({ state: "detached" });
}
