import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  type MensagemDaConversa,
} from "./agentePuro.ts";
import {
  ehMarcaDeAgendado,
  FERRAMENTA_PEDIDOS,
  instrucoesDaLeitura,
  mensagensRecentesDoCliente,
  pareceTerPedido,
  telefoneDoPassageiro,
  validarPedidoExtraido,
  cidadeDaVolta,
  avisoDaCidadePelaBase,
  avisoDosLugares,
  cidadePelaBase,
  agendadoPrecisaReler,
  cidadeEscritaPeloCliente,
  lugarDeOutraCidade,
  viagemDeHojeJaSaiu,
  A_CONFIRMAR,
  avisoDoAgendado,
  comMarcaDoDia,
  pendenciasAtuais,
  planejarAtualizacao,
  semMarcaDoDia,
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
  // volta sem ponto nem cidade dita: a rua não diz de onde sai (issue #272)
  assertEquals(validarPedidoExtraido({ data: "2026-11-10", direcao: "volta", endereco: "Rua 3" }, ctx), {
    ok: false,
    motivo: "sem_cidade",
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

Deno.test("a ferramenta pede até quatro pedidos e as instruções levam o calendário", () => {
  // ida e volta de duas pessoas (a cliente e o contato que ela mandou)
  assertEquals(FERRAMENTA_PEDIDOS.input_schema.properties.pedidos.maxItems, 4);
  const t = instrucoesDaLeitura({ calendario: "Amanhã: terça (2026-11-10)", pontos: "busca = Buscar em Casa", desembarques: "-" });
  assert(t.includes("2026-11-10"));
  assert(t.includes("NÃO decide preço"));
  assert(!t.includes("ACABOU DE CONFIRMAR"));
  assert(t.includes("Nunca o nome do perfil") || t.includes("Nunca invente"));
});

Deno.test("Outros (issue #261): ponto 'outro' precisa do local citado", () => {
  const p = { ...pontos, ida: [...pontos.ida] };
  const r = validarPedidoExtraido({ data: "2026-11-10", direcao: "ida", ponto: "outro", endereco: "Aeroporto de São Luís" }, { ...ctx, pontos: p });
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.rascunho.route_point_code, "outro");
    assertEquals(r.rascunho.pickup_detail, "Aeroporto de São Luís");
  }
  assertEquals(validarPedidoExtraido({ data: "2026-11-10", direcao: "ida", ponto: "outro" }, { ...ctx, pontos: p }), {
    ok: false,
    motivo: "sem_endereco",
  });
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

Deno.test("viagem de hoje já saiu: Ida depois das 07:00, Volta depois das 14:00 (issue #266)", () => {
  assertEquals(viagemDeHojeJaSaiu("ida", "06:59"), false);
  assertEquals(viagemDeHojeJaSaiu("ida", "07:00"), true);
  assertEquals(viagemDeHojeJaSaiu("volta", "13:30"), false);
  assertEquals(viagemDeHojeJaSaiu("volta", "15:33"), true);
  assertEquals(viagemDeHojeJaSaiu("volta", null), false);
  assertEquals(viagemDeHojeJaSaiu("volta", "15h"), false);
});

Deno.test("pedido para hoje depois que a Volta saiu vira amanhã, com aviso", () => {
  const r = validarPedidoExtraido(
    { data: "2026-11-09", direcao: "volta", ponto: "pirapemas" },
    { ...ctx, horaAgora: "15:33" },
  );
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.rascunho.trip_date, "2026-11-10");
  assert(r.rascunho.notes?.includes("considerei amanhã (10/11)"));
});

Deno.test("pedido para hoje antes da saída continua hoje", () => {
  const r = validarPedidoExtraido({ data: "2026-11-09", direcao: "volta", ponto: "pirapemas" }, { ...ctx, horaAgora: "10:00" });
  assert(r.ok);
  if (r.ok) assertEquals(r.rascunho.trip_date, "2026-11-09");
});

const COSTUME = {
  ida: { route_point_code: "rodoviaria", route_point_name: "Rodoviária", neighborhood: null, detail: null, dropoff_location: "Cantanhede" },
  volta: { route_point_code: "cantanhede", route_point_name: "Cantanhede", neighborhood: null, detail: "Praça da Cruz", dropoff_location: null },
};

Deno.test("sem embarque dito: usa o endereço de costume do sentido, com aviso (issue #266)", () => {
  const ida = validarPedidoExtraido({ data: "2026-11-10", direcao: "ida" }, { ...ctx, costume: COSTUME });
  assert(ida.ok);
  if (ida.ok) {
    assertEquals(ida.rascunho.route_point_code, "rodoviaria");
    assertEquals(ida.rascunho.dropoff_location, "Cantanhede");
    assert(ida.rascunho.notes?.includes("endereço de costume"));
  }
  const volta = validarPedidoExtraido({ data: "2026-11-10", direcao: "volta" }, { ...ctx, costume: COSTUME });
  assert(volta.ok);
  if (volta.ok) {
    assertEquals(volta.rascunho.route_point_code, "cantanhede");
    assertEquals(volta.rascunho.pickup_detail, "Praça da Cruz");
  }
});

Deno.test("embarque dito pelo cliente vence o costume; sem costume continua sem endereço", () => {
  const r = validarPedidoExtraido({ data: "2026-11-10", direcao: "ida", ponto: "retorno" }, { ...ctx, costume: COSTUME });
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.rascunho.route_point_code, "retorno");
    assertEquals(r.rascunho.notes, null);
  }
  assertEquals(validarPedidoExtraido({ data: "2026-11-10", direcao: "ida" }, ctx), { ok: false, motivo: "sem_endereco" });
  // costume num ponto que não existe mais: não inventa
  assertEquals(
    validarPedidoExtraido({ data: "2026-11-10", direcao: "ida" }, { ...ctx, costume: { ida: { route_point_code: "ponto-extinto" } } }),
    { ok: false, motivo: "sem_endereco" },
  );
});

Deno.test("instruções: separar embarque e desembarque com a lista de bairros de São Luís (issue #266)", () => {
  const t = instrucoesDaLeitura({ calendario: "-", pontos: "-", desembarques: "-", bairrosSaoLuis: "Anil, Cidade Operária, Cohatrac" });
  assert(t.includes("BAIRROS DE SÃO LUÍS: Anil, Cidade Operária, Cohatrac"));
  assert(t.includes("separe onde ele SOBE de onde ele DESCE"));
  assert(!instrucoesDaLeitura({ calendario: "-", pontos: "-", desembarques: "-" }).includes("BAIRROS DE SÃO LUÍS:"));
});

Deno.test("telefone do passageiro: só dígitos, sem 55, 10 ou 11 dígitos (issue #268)", () => {
  assertEquals(telefoneDoPassageiro("+55 98 98888-7777"), "98988887777");
  assertEquals(telefoneDoPassageiro("5598988887777"), "98988887777");
  assertEquals(telefoneDoPassageiro("9888887777"), "9888887777");
  assertEquals(telefoneDoPassageiro("123"), null);
  assertEquals(telefoneDoPassageiro(null), null);
});

Deno.test("marcando para outra pessoa: o rascunho leva o passageiro (nome e telefone)", () => {
  const r = validarPedidoExtraido(
    {
      data: "2026-11-10",
      direcao: "volta",
      ponto: "pirapemas",
      endereco: "Estrada Matões, em frente à quadra",
      desembarque: "Cidade Operária, rua 2, casa 16",
      nome_informado: "Quem pediu",
      passageiro_nome: "Dede Silva",
      passageiro_telefone: "+55 98 98888-7777",
    },
    ctx,
  );
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.passageiro, { nome: "Dede Silva", telefone: "98988887777" });
  assertEquals(r.rascunho.customer_name, "Dede Silva");
});

Deno.test("passageiro com telefone inválido: sem passageiro e com aviso", () => {
  const r = validarPedidoExtraido({ data: "2026-11-10", direcao: "volta", ponto: "pirapemas", passageiro_telefone: "123" }, ctx);
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.passageiro, null);
  assert(r.rascunho.notes?.includes("Telefone do passageiro inválido"));
});

Deno.test("cidade da volta: Pirapemas ou Cantanhede pelo nome dito (issue #272)", () => {
  assertEquals(cidadeDaVolta("Pirapemas"), "pirapemas");
  assertEquals(cidadeDaVolta("aqui em CANTANHEDE-MA"), "cantanhede");
  assertEquals(cidadeDaVolta("Rua Lister Caldas"), null);
  assertEquals(cidadeDaVolta("Pirapemas ou Cantanhede"), null);
  assertEquals(cidadeDaVolta(null), null);
});

Deno.test("volta: a cidade dita manda no ponto; sem ela, aviso e o Agendado não lança (issue #272)", () => {
  const rua = { data: "2026-11-10", direcao: "volta", endereco: "Rua Lister Caldas, próximo à choperia" };
  // modelo chutou Pirapemas pela rua, mas ninguém disse a cidade
  const chute = validarPedidoExtraido({ ...rua, ponto: "pirapemas" }, ctx);
  assert(chute.ok);
  if (chute.ok) {
    assertEquals(chute.cidadeIncerta, true);
    assertStringIncludes(chute.rascunho.notes ?? "", "Pirapemas ou Cantanhede");
  }
  // cliente disse Cantanhede: vale a cidade dita, mesmo que o modelo tenha posto outro ponto
  const dita = validarPedidoExtraido({ ...rua, ponto: "pirapemas", cidade_dita: "Cantanhede" }, ctx);
  assert(dita.ok);
  if (dita.ok) {
    assertEquals(dita.rascunho.route_point_code, "cantanhede");
    assertEquals(dita.cidadeIncerta, false);
  }
  // endereço de costume conta como cidade conhecida
  const costume = validarPedidoExtraido(
    { data: "2026-11-10", direcao: "volta" },
    { ...ctx, costume: { volta: { route_point_code: "cantanhede", detail: "Praça da Cruz" } } },
  );
  assert(costume.ok);
  if (costume.ok) assertEquals(costume.cidadeIncerta, false);
  // ida não é afetada
  const ida = validarPedidoExtraido({ data: "2026-11-10", direcao: "ida", ponto: "rodoviaria" }, ctx);
  assert(ida.ok);
  if (ida.ok) assertEquals(ida.cidadeIncerta, false);
});

Deno.test("lugares das cidades: rua, referência e casa nas duas cidades ou só na outra (issue #274)", () => {
  const lister = {
    tipo: "rua",
    nome: "Rua Deputado Lister Caldas",
    em_pirapemas: true,
    em_cantanhede: true,
    reservas_pirapemas: 10,
    reservas_cantanhede: 6,
  };
  const cruz = { tipo: "referencia", nome: "Praça da Cruz", em_pirapemas: false, em_cantanhede: true, reservas_pirapemas: 0, reservas_cantanhede: 4 };
  const choperia = {
    tipo: "referencia",
    nome: "Choperia do Riba",
    em_pirapemas: true,
    em_cantanhede: false,
    reservas_pirapemas: 2,
    reservas_cantanhede: 0,
    junto_pirapemas: "Rua Deputado Lister Caldas",
  };
  const posto = { tipo: "referencia", nome: "Posto Maria", em_pirapemas: false, em_cantanhede: true, reservas_pirapemas: 0, reservas_cantanhede: 1 };
  const povoado = { tipo: "povoado", nome: "Povoado Galvão", em_pirapemas: false, em_cantanhede: true, reservas_pirapemas: 0, reservas_cantanhede: 0 };

  assertEquals(
    avisoDosLugares([lister], "pirapemas"),
    "Rua Deputado Lister Caldas existe em Pirapemas e em Cantanhede (10 e 6 reservas): confirme a cidade.",
  );
  assertEquals(avisoDosLugares([cruz], "pirapemas"), "Praça da Cruz costuma ser Cantanhede (4 reservas), não Pirapemas: confira.");
  assertEquals(avisoDosLugares([cruz], "cantanhede"), null);
  // só a referência, sem cidade dita: diz onde fica e com o que anda junto
  assertEquals(avisoDosLugares([choperia], null), "Choperia do Riba é em Pirapemas, junto da Rua Deputado Lister Caldas (2 reservas).");
  assertEquals(avisoDosLugares([povoado], null), "Povoado Galvão é em Cantanhede.");
  // reconhecido com erro de escrita: mostra como o cliente escreveu (issue #276)
  assertEquals(
    avisoDosLugares([{ ...choperia, escrito: "choparia do riba" }], null),
    'Choperia do Riba (escrito "choparia do riba") é em Pirapemas, junto da Rua Deputado Lister Caldas (2 reservas).',
  );
  assertEquals(avisoDosLugares([], "pirapemas"), null);

  // atendente: só barra com evidência (mapa ou 2+ reservas) na OUTRA cidade
  assertEquals(lugarDeOutraCidade([cruz], "pirapemas"), { nome: "Praça da Cruz", cidade: "Cantanhede", junto: null });
  assertEquals(lugarDeOutraCidade([povoado], "pirapemas")?.cidade, "Cantanhede");
  assertEquals(lugarDeOutraCidade([posto], "pirapemas"), null);
  assertEquals(lugarDeOutraCidade([cruz], "cantanhede"), null);
  assertEquals(lugarDeOutraCidade([lister], "cantanhede"), null);
});

Deno.test("cidade pela base de lugares no Agendado (issue #286): casos de 10/11", () => {
  const L = (nome: string, p: number, c: number, emP = p > 0, emC = c > 0) => ({
    tipo: "rua",
    nome,
    em_pirapemas: emP,
    em_cantanhede: emC,
    reservas_pirapemas: p,
    reservas_cantanhede: c,
  });
  // conversa 1320: Av. João Castelo só em Pirapemas (9 reservas) → Pirapemas
  assertEquals(cidadePelaBase([L("Avenida João Castelo", 9, 0)])?.cidade, "pirapemas");
  // conversa 1322: Rua da Mônica no mapa e em 3 reservas de Pirapemas → Pirapemas
  assertEquals(cidadePelaBase([L("Rua da Monica", 3, 0)])?.cidade, "pirapemas");
  // só no mapa (0 reservas) também vale
  assertEquals(cidadePelaBase([L("Povoado Galvão", 0, 0, false, true)])?.cidade, "cantanhede");
  // conversa 1314: casa da Maria Padeiro em 1 reserva só → fraco, não decide
  assertEquals(cidadePelaBase([L("Maria Padeiro", 1, 0)]), null);
  // conversa 325: Lister Caldas nas duas + lugar fraco → não decide
  assertEquals(cidadePelaBase([L("Rua Deputado Lister Caldas", 10, 6), L("Casa da Dona Daluz", 1, 0)]), null);
  // lugar das duas cidades não atrapalha um forte; um lugar só da OUTRA cidade, sim
  assertEquals(cidadePelaBase([L("Rua Deputado Lister Caldas", 10, 6), L("Praça da Cruz", 0, 4)])?.cidade, "cantanhede");
  assertEquals(cidadePelaBase([L("Avenida João Castelo", 9, 0), L("Posto Maria", 0, 1)]), null);
  assertEquals(cidadePelaBase([]), null);
  assertStringIncludes(avisoDaCidadePelaBase({ cidade: "pirapemas", nome: "Avenida João Castelo", reservas: 9 }), "só aparece em Pirapemas (9 reservas)");
});

Deno.test("instruções do Agendado: data pela mensagem, horário da equipe e o que o cliente completou (issue #286)", () => {
  const t = instrucoesDaLeitura({ calendario: "-", pontos: "-", desembarques: "-", confirmadoPelaEquipe: true });
  assertStringIncludes(t, "contam a partir do DIA EM QUE AQUELA MENSAGEM FOI ESCRITA");
  assertStringIncludes(t, "\"12 horas\", \"meio-dia\", \"após às 12\", \"à tarde\" = Volta");
  assertStringIncludes(t, "logo DEPOIS do \"Agendado ☑️\"");
  const semEquipe = instrucoesDaLeitura({ calendario: "-", pontos: "-", desembarques: "-" });
  assertStringIncludes(semEquipe, "contam a partir do DIA EM QUE AQUELA MENSAGEM FOI ESCRITA");
  assert(!semEquipe.includes("HORÁRIO que a equipe disse"));
});

Deno.test("ida e volta sem o dia da volta = volta no mesmo dia (dono, 10/11)", () => {
  const t = instrucoesDaLeitura({ calendario: "-", pontos: "-", desembarques: "-", confirmadoPelaEquipe: true });
  assertStringIncludes(t, "registre a Volta no MESMO DIA da Ida");
  assertStringIncludes(t, "Volta no mesmo dia da Ida: confirme com o cliente");
});

// ---------------------------------------------------------------------------
// Agendado ☑️ = reservar como está (dono, 10/11)
// ---------------------------------------------------------------------------
const ag = { ...ctx, agendado: true };

Deno.test("agendado: Ida sem endereço reserva só com o nome, em Outros, endereço a confirmar", () => {
  const r = validarPedidoExtraido({ data: "2026-11-10", direcao: "ida", nome_informado: "Maria" }, ag);
  assert(r.ok);
  assertEquals(r.rascunho.route_point_code, "outro");
  assertEquals(r.rascunho.pickup_detail, A_CONFIRMAR.endereco);
  assertEquals(r.aConfirmar, ["endereco"]);
  assertStringIncludes(r.rascunho.notes ?? "", "sem valor");
  // fora do Agendado continua sem rascunho
  assertEquals(validarPedidoExtraido({ data: "2026-11-10", direcao: "ida" }, ctx), { ok: false, motivo: "sem_endereco" });
});

Deno.test("agendado: ponto fixo da Ida não precisa de endereço (valor do ponto)", () => {
  const r = validarPedidoExtraido({ data: "2026-11-10", direcao: "ida", ponto: "rodoviaria" }, ag);
  assert(r.ok);
  assertEquals(r.aConfirmar, []);
  assertEquals(r.rascunho.pickup_detail, null);
});

Deno.test("agendado: busca sem bairro fica com o bairro a confirmar", () => {
  const r = validarPedidoExtraido({ data: "2026-11-10", direcao: "ida", ponto: "busca", endereco: "Rua 7" }, ag);
  assert(r.ok);
  assertEquals(r.rascunho.pickup_detail, "Rua 7 (bairro a confirmar)");
  assertEquals(r.aConfirmar, ["endereco"]);
});

Deno.test("agendado: Volta com cidade e sem endereço reserva; sem cidade fica pendente", () => {
  const r = validarPedidoExtraido({ data: "2026-11-10", direcao: "volta", cidade_dita: "Cantanhede" }, ag);
  assert(r.ok);
  assertEquals(r.rascunho.route_point_code, "cantanhede");
  assertEquals(r.cidadeIncerta, false);
  assertEquals(r.aConfirmar, ["endereco"]);
  const s = validarPedidoExtraido({ data: "2026-11-10", direcao: "volta" }, ag);
  assert(s.ok);
  assertEquals(s.cidadeIncerta, true);
  assertEquals(s.rascunho.route_point_code, null);
  assertEquals(validarPedidoExtraido({ data: "2026-11-10", direcao: "volta" }, ctx), { ok: false, motivo: "sem_cidade" });
});

Deno.test("agendado: volta no mesmo dia suposta vai marcada para confirmar", () => {
  const r = validarPedidoExtraido(
    { data: "2026-11-10", direcao: "volta", cidade_dita: "pirapemas", endereco: "Rua do Campo", duvida: "Volta no mesmo dia da Ida: confirme com o cliente" },
    ag,
  );
  assert(r.ok);
  assertEquals(r.aConfirmar, ["dia_da_volta"]);
  assertEquals(r.rascunho.pickup_detail, comMarcaDoDia("Rua do Campo"));
  assertEquals(semMarcaDoDia(r.rascunho.pickup_detail), "Rua do Campo");
});

Deno.test("pendências: o que a equipe já preencheu no app não conta mais", () => {
  assertEquals(pendenciasAtuais(["endereco", "valor"], A_CONFIRMAR.endereco), ["endereco", "valor"]);
  assertEquals(pendenciasAtuais(["endereco"], "Rua 7, Cohatrac"), []);
  assertEquals(pendenciasAtuais(["dia_da_volta"], comMarcaDoDia("Rua 1")), ["dia_da_volta"]);
  assertEquals(pendenciasAtuais(["dia_da_volta"], "Rua 1"), []);
  assertEquals(pendenciasAtuais(null, "x"), []);
});

Deno.test("atualização: cliente diz outro dia da volta, a reserva muda de dia", () => {
  const p = planejarAtualizacao(
    { data: "2026-11-10", direcao: "volta", ponto: "pirapemas", pickupDetail: comMarcaDoDia("Rua 1"), pendentes: ["dia_da_volta"] },
    { reserva: 1, nova_data: "2026-11-13" },
    ctx,
  );
  assert(p);
  assertEquals(p.novaData, "2026-11-13");
  assertEquals(p.pickupDetail, "Rua 1");
  assertEquals(p.restante, []);
});

Deno.test("atualização: confirmou o mesmo dia só tira a marca", () => {
  const p = planejarAtualizacao(
    { data: "2026-11-10", direcao: "volta", ponto: "pirapemas", pickupDetail: comMarcaDoDia(null), pendentes: ["dia_da_volta"] },
    { reserva: 1, mesmo_dia_confirmado: true },
    ctx,
  );
  assert(p);
  assertEquals(p.novaData, undefined);
  assertEquals(p.pickupDetail, A_CONFIRMAR.endereco);
});

Deno.test("atualização: endereço informado vira busca em casa e recalcula o valor", () => {
  const p = planejarAtualizacao(
    { data: "2026-11-10", direcao: "ida", ponto: "outro", pickupDetail: A_CONFIRMAR.endereco, pendentes: ["endereco", "valor"] },
    { reserva: 1, endereco: "Rua 7, casa 12", bairro: "Cohatrac" },
    ctx,
  );
  assert(p);
  assertEquals(p.novoPonto, "busca");
  assertEquals(p.pickupNeighborhood, "Cohatrac");
  assertEquals(p.pickupDetail, "Rua 7, casa 12");
  assertEquals(p.recalcularValor, true);
  assertEquals(p.restante, []);
});

Deno.test("atualização: nada novo, data passada ou longe demais não mexe", () => {
  const res = { data: "2026-11-10", direcao: "volta" as const, ponto: "pirapemas", pickupDetail: comMarcaDoDia("Rua 1"), pendentes: ["dia_da_volta" as const] };
  assertEquals(planejarAtualizacao(res, { reserva: 1 }, ctx), null);
  assertEquals(planejarAtualizacao(res, { reserva: 1, nova_data: "2026-11-01" }, ctx), null);
  assertEquals(planejarAtualizacao(res, { reserva: 1, nova_data: "2027-06-01" }, ctx), null);
  assertEquals(planejarAtualizacao(res, { reserva: 1, nova_data: "2026-11-10" }, ctx), null);
  // endereço só mexe se estava faltando
  assertEquals(planejarAtualizacao(res, { reserva: 1, endereco: "Outra rua" }, ctx), null);
});

Deno.test("atualização: cidade dita na Volta troca o ponto", () => {
  const p = planejarAtualizacao(
    { data: "2026-11-10", direcao: "volta", ponto: "pirapemas", pickupDetail: A_CONFIRMAR.endereco, pendentes: ["endereco"] },
    { reserva: 1, cidade: "cantanhede", endereco: "Praça da Cruz" },
    ctx,
  );
  assert(p);
  assertEquals(p.novoPonto, "cantanhede");
  assertEquals(p.pickupDetail, "Praça da Cruz");
});

Deno.test("leitura (dono, 10/11): 'pra São Luís' é Volta e card só vira passagem se pediram para ele", () => {
  const t = instrucoesDaLeitura({ calendario: "-", pontos: "-", desembarques: "-" });
  assertStringIncludes(t, '"pra São Luís"');
  assertStringIncludes(t, "VOLTA");
  assertStringIncludes(t, "PARA São Luís é Volta");
  assertStringIncludes(t, "Card de contato só vira passagem quando o cliente pediu passagem PARA aquela pessoa");
  assertStringIncludes(t, "UM pedido por passageiro");
});

Deno.test("aviso do Agendado: lançou tudo ou já estava reservado não avisa", () => {
  assertEquals(avisoDoAgendado({ lancadas: 2, pedidos: 2, motivos: [], pendentes: [] }), null);
  assertEquals(avisoDoAgendado({ lancadas: 0, pedidos: 1, motivos: ["ja_reservado"], pendentes: [] }), null);
});

Deno.test("aviso do Agendado: erro, nada lido, motivo e pendência viram pendência legível", () => {
  const e = avisoDoAgendado({ lancadas: 0, pedidos: 0, motivos: [], pendentes: [], erro: "Error: Leitura do pedido cortada (max_tokens)." });
  assert(e);
  assertStringIncludes(e.detalhe, "A leitura da conversa falhou");
  const n = avisoDoAgendado({ lancadas: 0, pedidos: 0, motivos: [], pendentes: [] });
  assert(n);
  assertStringIncludes(n.detalhe, "não achou o pedido");
  const m = avisoDoAgendado({ lancadas: 0, pedidos: 1, motivos: ["sem_data", "ja_reservado"], pendentes: [] });
  assert(m);
  assertStringIncludes(m.detalhe, "o dia da viagem não aparece");
  const p = avisoDoAgendado({ lancadas: 1, pedidos: 2, motivos: [], pendentes: ["cidade"] });
  assert(p);
  assertEquals(p.assunto, "Agendado ☑️ lançou só parte");
  assertStringIncludes(p.detalhe, "1 reserva(s) lançada(s)");
  assertStringIncludes(p.detalhe, "Pirapemas ou Cantanhede");
});

Deno.test("#299 regressão: a cidade escrita pelo cliente é reconhecida no trecho dele", () => {
  assertEquals(cidadeDaVolta("Bom dia gostaria de agendar duas passagens para amanhã a tarde de Pirapemas a são Luis"), "pirapemas");
  assertEquals(cidadeDaVolta("venho de Catanhede dia 14 a tarde pra Sao luis"), "cantanhede");
  // as duas cidades: não decide
  assertEquals(cidadeDaVolta("moro em Cantanhede mas embarco em Pirapemas"), null);
  assertEquals(cidadeDaVolta("Na descida da Inês uma casa com jardim na frente"), null);
});

Deno.test("#301 regressão: a cidade escrita em QUALQUER mensagem do cliente vale (não só no trecho copiado)", () => {
  // caso real: a cidade na 1ª mensagem, o endereço na 2ª
  assertEquals(
    cidadeEscritaPeloCliente(["Bom dia gostaria de agendar duas passagens para amanhã a tarde de Pirapemas a são Luis", "Adriana. Na descida da Inês uma casa com jardim na frente"]),
    "pirapemas",
  );
  assertEquals(cidadeEscritaPeloCliente(["vou sair de Catanhede", "rua do campinho"]), "cantanhede");
  // as duas cidades no pedido: não decide sozinho
  assertEquals(cidadeEscritaPeloCliente(["moro em Pirapemas", "mas vou embarcar em Cantanhede"]), null);
  assertEquals(cidadeEscritaPeloCliente(["descida da Inês"]), null);
  assertEquals(cidadeEscritaPeloCliente([]), null);
});

Deno.test("#301: o Agendado relê com o modelo capaz antes de ficar pendente por falta de leitura", () => {
  assert(agendadoPrecisaReler({ pedidos: 0, motivos: [], codigosPendentes: [] }));
  assert(agendadoPrecisaReler({ pedidos: 1, motivos: [], codigosPendentes: ["cidade"] }));
  assert(agendadoPrecisaReler({ pedidos: 1, motivos: ["sem_cidade"], codigosPendentes: [] }));
  assert(agendadoPrecisaReler({ pedidos: 1, motivos: ["sem_data"], codigosPendentes: [] }));
  // o lido contradiz o que o cliente escreveu (#303): relê
  assert(agendadoPrecisaReler({ pedidos: 1, motivos: [], codigosPendentes: ["conferir"] }));
  // motivos que não são de leitura: não relê
  assert(!agendadoPrecisaReler({ pedidos: 1, motivos: ["ja_reservado"], codigosPendentes: [] }));
  assert(!agendadoPrecisaReler({ pedidos: 2, motivos: [], codigosPendentes: ["vespera"] }));
});

Deno.test("#301: o leitor é orientado a ler tudo e interpretar, sem confundir nome próprio", () => {
  const t = instrucoesDaLeitura({ calendario: "-", pontos: "-", desembarques: "-" });
  assertStringIncludes(t, "LEIA TODAS AS MENSAGENS DO CLIENTE");
  assertStringIncludes(t, "descida da Inês");
  assertStringIncludes(t, "Beco do Hospital");
  assertStringIncludes(t, "NOMES de lugares");
});
