import { assert, assertEquals } from "jsr:@std/assert";
import {
  type MensagemDaConversa,
} from "./agentePuro.ts";
import {
  ehMarcaDeAgendado,
  FERRAMENTA_PEDIDOS,
  instrucoesDaLeitura,
  mensagensRecentesDoCliente,
  pareceTerPedido,
  validarPedidoExtraido,
} from "./rascunhoPuro.ts";

const pontos = { ida: ["busca", "rodoviaria", "postocarone", "retorno", "br", "outro"], volta: ["pirapemas", "cantanhede"] };
const ctx = { hoje: "2026-11-09", pontos };

Deno.test("filtro: sem data não chama o modelo", () => {
  assertEquals(pareceTerPedido(["Bom dia, quanto é a passagem?"]), false);
  assertEquals(pareceTerPedido(["oi"]), false);
  assertEquals(pareceTerPedido([]), false);
});

Deno.test("filtro: datas relativas, dia da semana e dd/mm passam", () => {
  assert(pareceTerPedido(["quero uma passagem pra amanhã"]));
  assert(pareceTerPedido(["vou na SEXTA, moro no Cohatrac"]));
  assert(pareceTerPedido(["dia 12 por favor"]));
  assert(pareceTerPedido(["12/11 sai da rodoviária"]));
  assert(pareceTerPedido(["terça-feira cedo"]));
  assert(pareceTerPedido(["Amanhã"]));
});

Deno.test("só mensagens do cliente nas últimas 48h, em ordem", () => {
  const agora = new Date("2026-11-09T12:00:00Z");
  const msgs: MensagemDaConversa[] = [
    { quem: "cliente", texto: "b", em: "2026-11-09T11:00:00Z" },
    { quem: "equipe", texto: "oi", em: "2026-11-09T11:30:00Z" },
    { quem: "cliente", texto: "velha", em: "2026-11-01T11:00:00Z" },
    { quem: "cliente", texto: "a", em: "2026-11-09T10:00:00Z" },
    { quem: "cliente", texto: "  ", em: "2026-11-09T10:30:00Z" },
  ];
  assertEquals(mensagensRecentesDoCliente(msgs, agora).map((m) => m.texto), ["a", "b"]);
});

Deno.test("data + bairro na ida vira busca em casa", () => {
  const r = validarPedidoExtraido({ tipo: "passagem", data: "2026-11-10", direcao: "ida", bairro: "Cohatrac", endereco: "Rua 7, casa 12" }, ctx);
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.rascunho.route_point_code, "busca");
  assertEquals(r.rascunho.pickup_neighborhood, "Cohatrac");
  assertEquals(r.rascunho.pickup_detail, "Rua 7, casa 12");
  assertEquals(r.rascunho.quantity, 1);
  assertEquals(r.rascunho.type, "passagem");
});

Deno.test("ponto fixo já basta como endereço; o sentido sai do ponto", () => {
  const r = validarPedidoExtraido({ data: "2026-11-11", ponto: "Cantanhede", quantidade: 2 }, ctx);
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.rascunho.direction, "volta");
  assertEquals(r.rascunho.route_point_code, "cantanhede");
  assertEquals(r.rascunho.quantity, 2);
  assertEquals(r.rascunho.pickup_neighborhood, null);
});

Deno.test("sem data, data passada ou longe demais: não vira rascunho", () => {
  assertEquals(validarPedidoExtraido({ direcao: "ida", bairro: "Anil" }, ctx), { ok: false, motivo: "sem_data" });
  assertEquals(validarPedidoExtraido({ data: "amanhã", direcao: "ida", bairro: "Anil" }, ctx), { ok: false, motivo: "sem_data" });
  assertEquals(validarPedidoExtraido({ data: "2026-11-08", direcao: "ida", bairro: "Anil" }, ctx), {
    ok: false,
    motivo: "data_passada",
  });
  assertEquals(validarPedidoExtraido({ data: "2027-03-01", direcao: "ida", bairro: "Anil" }, ctx), {
    ok: false,
    motivo: "data_longe",
  });
});

Deno.test("hoje ainda vale", () => {
  assert(validarPedidoExtraido({ data: "2026-11-09", direcao: "ida", ponto: "rodoviaria" }, ctx).ok);
});

Deno.test("sem endereço nem ponto: não vira rascunho", () => {
  assertEquals(validarPedidoExtraido({ data: "2026-11-10", direcao: "ida" }, ctx), { ok: false, motivo: "sem_endereco" });
  assertEquals(validarPedidoExtraido({ data: "2026-11-10", direcao: "ida", ponto: "busca" }, ctx), {
    ok: false,
    motivo: "sem_endereco",
  });
  // volta sem ponto: o endereço de São Luís não diz de onde sai
  assertEquals(validarPedidoExtraido({ data: "2026-11-10", direcao: "volta", endereco: "Rua 3" }, ctx), {
    ok: false,
    motivo: "sem_endereco",
  });
});

Deno.test("sem sentido e sem ponto conhecido: não vira rascunho", () => {
  assertEquals(validarPedidoExtraido({ data: "2026-11-10", bairro: "Anil" }, ctx), { ok: false, motivo: "sem_sentido" });
  assertEquals(validarPedidoExtraido({ data: "2026-11-10", ponto: "marte" }, ctx), { ok: false, motivo: "sem_sentido" });
});

Deno.test("ponto do outro sentido é ignorado (vale o bairro)", () => {
  const r = validarPedidoExtraido({ data: "2026-11-10", direcao: "ida", ponto: "pirapemas", bairro: "Turu" }, ctx);
  assert(r.ok);
  if (r.ok) assertEquals(r.rascunho.route_point_code, "busca");
});

Deno.test("quantidade inválida vira 1", () => {
  for (const q of [0, -2, 2.5, 99, null]) {
    const r = validarPedidoExtraido({ data: "2026-11-10", ponto: "br", quantidade: q as number | null }, ctx);
    assert(r.ok);
    if (r.ok) assertEquals(r.rascunho.quantity, 1);
  }
});

Deno.test("encomenda: só onde buscar e a data; nunca ponto", () => {
  const r = validarPedidoExtraido(
    { tipo: "encomenda", data: "2026-11-10", direcao: "ida", bairro: "Centro", endereco: "Rua Grande 10", ponto: "rodoviaria" },
    ctx,
  );
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.rascunho.type, "encomenda");
  assertEquals(r.rascunho.route_point_code, null);
  assertEquals(r.rascunho.pickup_detail, "Centro, Rua Grande 10");
  assertEquals(validarPedidoExtraido({ tipo: "encomenda", data: "2026-11-10", direcao: "ida" }, ctx), {
    ok: false,
    motivo: "sem_endereco",
  });
});

Deno.test("desembarque vira área quando bate com a lista; textos são aparados", () => {
  const r = validarPedidoExtraido(
    {
      data: "2026-11-10",
      direcao: "ida",
      bairro: "  Anil  ",
      desembarque: "Pirapemas centro",
      nome_informado: "  Maria   da Silva ",
      trecho_do_cliente: "x".repeat(500),
    },
    { ...ctx, areaDoDesembarque: (t, d) => (d === "ida" && /pirapemas/i.test(t) ? "pirapemas" : null) },
  );
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.rascunho.pickup_neighborhood, "Anil");
  assertEquals(r.rascunho.dropoff_area, "pirapemas");
  assertEquals(r.rascunho.dropoff_location, "Pirapemas centro");
  assertEquals(r.rascunho.customer_name, "Maria da Silva");
  assertEquals(r.rascunho.client_excerpt?.length, 300);
});

Deno.test("a ferramenta pede no máximo dois pedidos e as instruções levam o calendário", () => {
  assertEquals(FERRAMENTA_PEDIDOS.input_schema.properties.pedidos.maxItems, 2);
  const t = instrucoesDaLeitura({ calendario: "Amanhã: terça (2026-11-10)", pontos: "busca = Buscar em Casa", desembarques: "-" });
  assert(t.includes("2026-11-10"));
  assert(t.includes("NÃO decide preço"));
  assert(!t.includes("ACABOU DE CONFIRMAR"));
  assert(t.includes("Nunca o nome do perfil") || t.includes("Nunca invente"));
});

Deno.test("marca da equipe: 'Agendado ☑️' e variações valem", () => {
  for (const t of [
    "Agendado ☑️",
    "agendado ☑",
    "AGENDADA ✅",
    "Certo, Maria! Agendado ☑️ amanhã 5h",
    "☑️ agendados",
    "Agendado ✔️",
  ]) {
    assert(ehMarcaDeAgendado(t), t);
  }
});

Deno.test("marca da equipe: sem o check, pergunta ou outra palavra não vale", () => {
  for (const t of [
    "Já está agendado",
    "Sua passagem está agendada pra hoje? ☑️",
    "Agendado ☑️?",
    "☑️ confirmado",
    "reagendamento ☑️",
    "",
    null,
  ]) {
    assertEquals(ehMarcaDeAgendado(t as string | null), false, String(t));
  }
});

Deno.test("instruções no modo confirmado pela equipe", () => {
  const t = instrucoesDaLeitura({ calendario: "-", pontos: "-", desembarques: "-", confirmadoPelaEquipe: true });
  assert(t.includes("ACABOU DE CONFIRMAR"));
  assert(!t.includes("Se a equipe já disse que reservou"));
});
