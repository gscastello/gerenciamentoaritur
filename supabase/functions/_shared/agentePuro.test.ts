import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  afirmaTerMexidoEmReserva,
  calcularTotal,
  calendarioParaOPrompt,
  contemDadoInterno,
  converterMensagensDoChatwoot,
  existeTextoNovoDoCliente,
  PREFIXO_DO_RASCUNHO,
  type MensagemBruta,
  diaCivil,
  diaPorExtenso,
  equipeRespondeuRecentemente,
  formatarHistorico,
  somarDias,
  ultimaFoiDoCliente,
  validarPedidoDeReserva,
  type MensagemDaConversa,
} from "./agentePuro.ts";

const m = (quem: MensagemDaConversa["quem"], texto: string, em: string): MensagemDaConversa => ({ quem, texto, em });

Deno.test("dia civil usa o calendário de Fortaleza (UTC-3), não o de UTC", () => {
  // 02:00 UTC de 29/10 ainda é 23:00 de 28/10 em Fortaleza
  assertEquals(diaCivil(new Date("2026-10-29T02:00:00Z")), "2026-10-28");
  assertEquals(diaCivil(new Date("2026-10-29T12:00:00Z")), "2026-10-29");
});

Deno.test("dia por extenso e soma de dias", () => {
  assertEquals(diaPorExtenso("2026-11-03"), "terça-feira, 03/11/2026");
  assertEquals(somarDias("2026-11-30", 1), "2026-12-01");
  assertEquals(somarDias("2026-03-01", -1), "2026-02-28");
});

Deno.test("calendário do prompt diz hoje, amanhã e os próximos dias", () => {
  const c = calendarioParaOPrompt(new Date("2026-11-03T17:30:00Z")); // 14:30 em Fortaleza
  assertStringIncludes(c, "14:30");
  assertStringIncludes(c, "terça-feira, 03/11/2026");
  assertStringIncludes(c, "Amanhã: quarta-feira, 04/11/2026 (2026-11-04)");
  assertStringIncludes(c, "Daqui a 7 dias: terça-feira, 10/11/2026");
});

Deno.test("histórico: ordem cronológica, rótulos e dia/hora", () => {
  const h = formatarHistorico([
    m("bot", "Oi! Em que posso ajudar?", "2026-11-03T12:01:00Z"),
    m("cliente", "tem vaga amanhã?", "2026-11-03T12:02:00Z"),
    m("cliente", "Bom dia", "2026-11-03T12:00:00Z"),
  ]);
  const linhas = h.split("\n");
  assertEquals(linhas.length, 3);
  assertStringIncludes(linhas[0], "CLIENTE: Bom dia");
  assertStringIncludes(linhas[1], "VOCÊ (atendente virtual): Oi!");
  assertStringIncludes(linhas[2], "CLIENTE: tem vaga amanhã?");
  assertStringIncludes(linhas[0], "09:00");
});

Deno.test("histórico: limita quantidade e tamanho; anexo vazio vira marcador", () => {
  const muitas = Array.from({ length: 60 }, (_, i) =>
    m("cliente", `msg ${i}`, new Date(Date.UTC(2026, 10, 3, 12, i)).toISOString()),
  );
  const h = formatarHistorico(muitas, 40);
  assertEquals(h.split("\n").length, 40);
  assertStringIncludes(h, "msg 59");
  assertEquals(h.includes("msg 5\n"), false);
  assertStringIncludes(formatarHistorico([m("cliente", "   ", "2026-11-03T12:00:00Z")]), "[anexo sem texto]");
  assertEquals(formatarHistorico([m("cliente", "a".repeat(2000), "2026-11-03T12:00:00Z")], 40, 100).length < 140, true);
});

Deno.test("silêncio: só conta resposta HUMANA dentro da janela de 10 minutos", () => {
  const agora = new Date("2026-11-03T15:00:00Z");
  const msgs = [
    m("cliente", "oi", "2026-11-03T14:40:00Z"),
    m("equipe", "já te respondo", "2026-11-03T14:55:00Z"),
    m("cliente", "ok", "2026-11-03T14:58:00Z"),
  ];
  assertEquals(equipeRespondeuRecentemente(msgs, agora), true);
  assertEquals(equipeRespondeuRecentemente(msgs, new Date("2026-11-03T15:06:00Z")), false);
  // resposta do próprio bot não conta como humano
  assertEquals(equipeRespondeuRecentemente([m("bot", "oi", "2026-11-03T14:59:00Z")], agora), false);
});

Deno.test("última palavra: só responde se foi do cliente", () => {
  assertEquals(ultimaFoiDoCliente([]), false);
  assertEquals(ultimaFoiDoCliente([m("cliente", "oi", "2026-11-03T12:00:00Z")]), true);
  assertEquals(
    ultimaFoiDoCliente([m("cliente", "oi", "2026-11-03T12:00:00Z"), m("equipe", "olá", "2026-11-03T12:01:00Z")]),
    false,
  );
});

const PEDIDO = {
  data: "2026-11-05",
  direcao: "ida",
  ponto: "rodoviaria",
  quantidade: 2,
  desembarque: "Pirapemas centro",
  forma_pagamento: "pix",
  cliente_confirmou: true,
};

Deno.test("pedido de reserva completo e confirmado é válido", () => {
  const r = validarPedidoDeReserva(PEDIDO, "2026-11-03");
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.pedido.quantidade, 2);
    assertEquals(r.pedido.formaPagamento, "pix");
    assertEquals(r.pedido.nomeCliente, null);
  }
});

Deno.test("pedido: sem confirmação do cliente não grava", () => {
  const r = validarPedidoDeReserva({ ...PEDIDO, cliente_confirmou: false }, "2026-11-03");
  assertEquals(r.ok, false);
  if (!r.ok) assertStringIncludes(r.erros.join(" "), "não confirmou");
  // "true" como texto também não vale: tem que ser o booleano
  assertEquals(validarPedidoDeReserva({ ...PEDIDO, cliente_confirmou: "true" }, "2026-11-03").ok, false);
});

Deno.test("pedido: data passada, quantidade ruim e campos faltando voltam como erros", () => {
  const r = validarPedidoDeReserva(
    { data: "2026-11-01", direcao: "meio", ponto: "", quantidade: 0, desembarque: "", forma_pagamento: "cartao" },
    "2026-11-03",
  );
  assertEquals(r.ok, false);
  if (!r.ok) {
    const t = r.erros.join(" | ");
    assertStringIncludes(t, "a data já passou");
    assertStringIncludes(t, "direcao");
    assertStringIncludes(t, "ponto de embarque");
    assertStringIncludes(t, "quantidade");
    assertStringIncludes(t, "desembarque");
    assertStringIncludes(t, "forma_pagamento");
  }
});

Deno.test("pedido: hoje vale; limite de passagens por pedido; nome curto", () => {
  assertEquals(validarPedidoDeReserva({ ...PEDIDO, data: "2026-11-03" }, "2026-11-03").ok, true);
  const muitas = validarPedidoDeReserva({ ...PEDIDO, quantidade: 11 }, "2026-11-03");
  assertEquals(muitas.ok, false);
  const nome = validarPedidoDeReserva({ ...PEDIDO, nome_cliente: "Jo" }, "2026-11-03");
  assertEquals(nome.ok, false);
  assertEquals(validarPedidoDeReserva({ ...PEDIDO, quantidade: "2" }, "2026-11-03").ok, true);
  assertEquals(validarPedidoDeReserva({ ...PEDIDO, quantidade: 1.5 }, "2026-11-03").ok, false);
});

Deno.test("valor total com duas casas", () => {
  assertEquals(calcularTotal(60, 2), 120);
  assertEquals(calcularTotal(33.33, 3), 99.99);
  assertEquals(calcularTotal(0.1, 3), 0.3);
});

Deno.test("detecta resposta que afirma ter mexido numa reserva", () => {
  assertEquals(afirmaTerMexidoEmReserva("Pronto! Sua reserva está confirmada para amanhã."), true);
  assertEquals(afirmaTerMexidoEmReserva("Reserva cancelada com sucesso."), true);
  assertEquals(afirmaTerMexidoEmReserva("Confirmei sua passagem para sexta."), true);
  assertEquals(afirmaTerMexidoEmReserva("Remarquei para quinta, tudo certo."), false); // sem o objeto: o resto da trava cobre
  assertEquals(afirmaTerMexidoEmReserva("Tem vaga amanhã, quer que eu reserve?"), false);
  assertEquals(afirmaTerMexidoEmReserva("Posso confirmar a reserva se você disser sim."), false);
});

Deno.test("identificador interno não vaza", () => {
  assertEquals(contemDadoInterno("sua reserva 3f2b8c1e-1a2b-4c3d-9e8f-0a1b2c3d4e5f"), true);
  assertEquals(contemDadoInterno("sua reserva de sexta"), false);
});

const bruta = (id: number, message_type: number, content: string, extra: Partial<MensagemBruta> = {}): MensagemBruta => ({
  id,
  message_type,
  content,
  created_at: 1793700000 + id,
  ...extra,
});

Deno.test("Chatwoot → conversa: cliente, equipe, bot; atividades e notas comuns ficam de fora", () => {
  const r = converterMensagensDoChatwoot([
    bruta(1, 0, "Bom dia"),
    bruta(2, 1, "Bom dia! Em que posso ajudar?", { sender: { type: "agent_bot" } }),
    bruta(3, 1, "Já te respondo", { sender: { type: "user" } }),
    bruta(4, 2, "Conversa aberta"),
    bruta(5, 1, "Transferido pelo bot. Motivo: x", { private: true }),
    bruta(6, 0, "", { attachments: [{}] }),
    bruta(7, 0, ""),
  ]);
  assertEquals(r.map((x) => [x.id, x.quem]), [[1, "cliente"], [2, "bot"], [3, "equipe"], [6, "cliente"]]);
});

Deno.test("Chatwoot → conversa: o rascunho do modo sombra vira fala do bot (sem o prefixo)", () => {
  const r = converterMensagensDoChatwoot([
    bruta(1, 0, "tem vaga amanhã?"),
    bruta(2, 1, `${PREFIXO_DO_RASCUNHO}

Tem sim! Quantas passagens?`, { private: true }),
    bruta(3, 1, "🤖 [SOMBRA] Criaria a reserva: {}", { private: true }),
  ]);
  assertEquals(r.length, 2);
  assertEquals(r[1].quem, "bot");
  assertEquals(r[1].texto, "Tem sim! Quantas passagens?");
});

Deno.test("mensagem nova de texto do cliente faz esta rodada ceder; figurinha/anexo não", () => {
  const msgs = [bruta(10, 0, "oi"), bruta(11, 0, "", { attachments: [{}] }), bruta(12, 1, "resposta", { sender: { type: "user" } })];
  assertEquals(existeTextoNovoDoCliente(msgs, 10), false);
  assertEquals(existeTextoNovoDoCliente([...msgs, bruta(13, 0, "tem vaga?")], 10), true);
  assertEquals(existeTextoNovoDoCliente([...msgs, bruta(13, 0, "tem vaga?")], 13), false);
  assertEquals(existeTextoNovoDoCliente([bruta(14, 0, "nota", { private: true })], 10), false);
});
