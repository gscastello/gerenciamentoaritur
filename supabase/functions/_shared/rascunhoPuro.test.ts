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

Deno.test("#307: 'hoje, indo pra Miranda' às 9h é a Volta de hoje, não a Ida de amanhã", () => {
  const areaDoDesembarque = (t: string, _d: "ida" | "volta") => (/miranda/i.test(t) ? "miranda" : null);
  const r = validarPedidoExtraido(
    { data: "2026-11-09", direcao: "ida", ponto: "busca", desembarque: "Miranda do Norte", cidade_dita: "pirapemas" },
    { ...ctx, horaAgora: "09:51", hojeDito: true, areaDoDesembarque },
  );
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.rascunho.trip_date, "2026-11-09");
  assertEquals(r.rascunho.direction, "volta");
  assertEquals(r.rascunho.route_point_code, "pirapemas");
  assertEquals(r.rascunho.dropoff_area, "miranda");
  assert(r.rascunho.notes?.includes("Volta de hoje"));
  // sem a cidade dita, o Agendado não chuta Pirapemas ou Cantanhede: fica para confirmar
  const semCidade = validarPedidoExtraido(
    { data: "2026-11-09", direcao: "ida", ponto: "busca", desembarque: "Miranda do Norte" },
    { ...ctx, horaAgora: "09:51", hojeDito: true, areaDoDesembarque, agendado: true },
  );
  assert(semCidade.ok && semCidade.cidadeIncerta && semCidade.rascunho.trip_date === "2026-11-09");
});

Deno.test("#307: disse hoje, a Ida saiu e a Volta não serve: fica para a equipe, nunca amanhã calado", () => {
  const areaDoDesembarque = (t: string, d: "ida" | "volta") => (d === "ida" && /pirapemas/i.test(t) ? "pirapemas" : null);
  const semDestinoNaVolta = validarPedidoExtraido(
    { data: "2026-11-09", direcao: "ida", desembarque: "Pirapemas" },
    { ...ctx, horaAgora: "09:51", hojeDito: true, areaDoDesembarque },
  );
  assertEquals(semDestinoNaVolta, { ok: false, motivo: "hoje_ja_saiu" });
  const embarcaEmSaoLuis = validarPedidoExtraido(
    { data: "2026-11-09", direcao: "ida", ponto: "busca", bairro: "Turu", desembarque: "Miranda" },
    { ...ctx, horaAgora: "09:51", hojeDito: true, areaDoDesembarque: () => "miranda" },
  );
  assertEquals(embarcaEmSaoLuis, { ok: false, motivo: "hoje_ja_saiu" });
  const asDuasSairam = validarPedidoExtraido(
    { data: "2026-11-09", direcao: "volta", desembarque: "Miranda" },
    { ...ctx, horaAgora: "15:00", hojeDito: true, areaDoDesembarque: () => "miranda" },
  );
  assertEquals(asDuasSairam, { ok: false, motivo: "hoje_ja_saiu" });
});

Deno.test("#314: lugar de Cantanhede depois que a Ida saiu é a Volta de hoje; nome que também é bairro de São Luís pergunta", async () => {
  const { proximaViagemPeloLugar, perguntaAoCliente } = await import("./rascunhoPuro.ts");
  const santaBarbara = { tipo: "rua", nome: "Rua Santa Bárbara", em_pirapemas: false, em_cantanhede: true, reservas_pirapemas: 0, reservas_cantanhede: 2 };
  assertEquals(proximaViagemPeloLugar({ lugares: [santaBarbara], bairroDeSaoLuis: false, costumeVolta: false }), "volta");
  assertEquals(proximaViagemPeloLugar({ lugares: [santaBarbara], bairroDeSaoLuis: true, costumeVolta: false }), "qual_viagem");
  assertEquals(proximaViagemPeloLugar({ lugares: [santaBarbara], bairroDeSaoLuis: true, costumeVolta: true }), "volta");
  assertEquals(proximaViagemPeloLugar({ lugares: [], bairroDeSaoLuis: true, costumeVolta: false }), null);
  assertEquals(
    proximaViagemPeloLugar({ lugares: [{ ...santaBarbara, em_cantanhede: false }], bairroDeSaoLuis: false, costumeVolta: false }),
    null,
  );

  const p1 = perguntaAoCliente(["cidade", "qual_viagem"], [], "Joel Silva");
  assertEquals(p1?.codigo, "qual_viagem");
  assertEquals(p1?.texto, "Joel, só pra confirmar sua vaga: é a Volta de hoje (saindo daí para São Luís) ou a Ida de amanhã (saindo de São Luís)? 😊");
  assertEquals(perguntaAoCliente(["cidade", "qual_viagem"], ["qual_viagem"], null)?.texto, "Só pra confirmar sua vaga: você embarca em Pirapemas ou em Cantanhede? 😊");
  assertEquals(perguntaAoCliente(["cidade"], ["cidade"], "Ana"), null);
  assertEquals(perguntaAoCliente(["conferir", "vespera"], [], "Ana"), null);
});

Deno.test("#324: cidade da Volta cruzando as pistas (Campestre, base, histórico, conversas antigas)", async () => {
  const { cidadeDaVoltaPelasPistas } = await import("./rascunhoPuro.ts");
  const lugar = (nome: string, p: boolean, c: boolean, rp = 0, rc = 0) => ({
    tipo: "rua", nome, em_pirapemas: p, em_cantanhede: c, reservas_pirapemas: rp, reservas_cantanhede: rc,
  });
  const vazio = { lugares: [], historico: [], textosAntigos: [] };
  // Campestre: cidade do caminho, ponto Pirapemas (dono, 11/11), mesmo valor
  const campestre = cidadeDaVoltaPelasPistas({ ...vazio, textoDoEmbarque: "Campestre", lugares: [lugar("Campestre", true, true, 2, 2)] });
  assertEquals(campestre?.cidade, "pirapemas");
  assertStringIncludes(campestre?.aviso ?? "", "entre Pirapemas e Cantanhede");
  assertEquals(cidadeDaVoltaPelasPistas({ ...vazio, textoDoEmbarque: "no campestri" })?.cidade, "pirapemas");
  // Rua 1º de Maio: só em Cantanhede, com 2 reservas (antes exigia 3)
  const maio = cidadeDaVoltaPelasPistas({ ...vazio, textoDoEmbarque: "Rua 1° de maio", lugares: [lugar("1 de Maio", false, true, 0, 2)] });
  assertEquals(maio?.cidade, "cantanhede");
  // atrás da igreja: a igreja só em Pirapemas e, nas conversas antigas, ele só cita Pirapemas
  const igreja = cidadeDaVoltaPelasPistas({
    textoDoEmbarque: "Aqui atrás da igreja",
    lugares: [lugar("Igreja", true, false, 1, 0)],
    historico: [],
    textosAntigos: ["Tem passagem para Pirapemas no domingo?", "Não vou conseguir ir para São Luís"],
  });
  assertEquals(igreja?.cidade, "pirapemas");
  assertStringIncludes(igreja?.aviso ?? "", "nas conversas o cliente só cita Pirapemas");
  // só o histórico de reservas também vale
  assertEquals(cidadeDaVoltaPelasPistas({ ...vazio, textoDoEmbarque: "em casa", historico: ["pirapemas", "pirapemas"] })?.cidade, "pirapemas");
  // pistas que discordam: pergunta ao cliente
  assertEquals(
    cidadeDaVoltaPelasPistas({ textoDoEmbarque: "Rua A", lugares: [lugar("Rua A", false, true, 0, 1)], historico: ["pirapemas"], textosAntigos: [] }),
    null,
  );
  assertEquals(cidadeDaVoltaPelasPistas({ ...vazio, textoDoEmbarque: "x", historico: ["pirapemas", "cantanhede"] }), null);
  assertEquals(cidadeDaVoltaPelasPistas({ ...vazio, textoDoEmbarque: "Lister Caldas", lugares: [lugar("Lister Caldas", true, true, 3, 3)] }), null);
  assertEquals(cidadeDaVoltaPelasPistas({ ...vazio, textoDoEmbarque: "" }), null);
});

Deno.test("#326: toda cidade do caminho é embarque válido da Volta (ponto Cantanhede)", async () => {
  const { cidadeDaVoltaPelasPistas, cidadeDoCaminhoNoTexto } = await import("./rascunhoPuro.ts");
  const vazio = { lugares: [], historico: [], textosAntigos: [] };
  for (const [texto, nome] of [["Matões", "Matões do Norte"], ["em miranda", "Miranda do Norte"], ["Santa Rita, perto do posto", "Santa Rita"], ["bacabeira", "Bacabeira"]]) {
    const r = cidadeDaVoltaPelasPistas({ ...vazio, textoDoEmbarque: texto });
    assertEquals(r?.cidade, "cantanhede", texto);
    assertStringIncludes(r?.aviso ?? "", nome);
    assertStringIncludes(r?.aviso ?? "", "valor do trecho");
  }
  assertStringIncludes(cidadeDaVoltaPelasPistas({ ...vazio, textoDoEmbarque: "Campestre" })?.aviso ?? "", "mesmo valor");
  // rua com nome de cidade é rua (issue #341)
  assertEquals(cidadeDoCaminhoNoTexto("Rua Santa Rita de Cássia, nº 28 - Vila Isabel"), null);
  assertEquals(cidadeDoCaminhoNoTexto("Av. Colombo 120"), null);
  assertEquals(cidadeDoCaminhoNoTexto("Travessa Miranda, perto da escola"), null);
  assertEquals(cidadeDoCaminhoNoTexto("Rua Grande, em Santa Rita"), { chave: "santa rita", ponto: "cantanhede", nome: "Santa Rita" });
  assertEquals(cidadeDoCaminhoNoTexto("Rua Grande"), null);
});

Deno.test("#328: desembarque de costume fixado vale mesmo com o embarque variando", () => {
  const costume = {
    ida: { fonte: "manual", route_point_code: null, route_point_name: null, neighborhood: null, detail: null, dropoff_location: "Beco do Hospital" },
    volta: null,
  };
  const r = validarPedidoExtraido(
    { data: "2026-11-10", direcao: "ida", ponto: "outro", endereco: "Posto Carone" },
    { ...ctx, costume, areaDoDesembarque: () => "pirapemas" },
  );
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.rascunho.route_point_code, "outro");
  assertEquals(r.rascunho.dropoff_location, "Beco do Hospital");
  assert(r.rascunho.notes?.includes("Desembarque pelo endereço de costume"));
  // embarque varia (sem ponto de costume) e o cliente não disse: o embarque não é chutado
  const semEmbarque = validarPedidoExtraido({ data: "2026-11-10", direcao: "ida" }, { ...ctx, costume, agendado: true });
  assert(semEmbarque.ok);
  if (semEmbarque.ok) assertEquals(semEmbarque.rascunho.dropoff_location, "Beco do Hospital");
  // costume que veio só do histórico não força o desembarque
  const doHistorico = validarPedidoExtraido(
    { data: "2026-11-10", direcao: "ida", ponto: "outro", endereco: "Posto Carone" },
    { ...ctx, costume: { ida: { ...costume.ida, fonte: "historico" }, volta: null } },
  );
  assert(doHistorico.ok);
  if (doHistorico.ok) assertEquals(doHistorico.rascunho.dropoff_location, null);
});

Deno.test("#333: Volta com só o nome da cidade completa o embarque pelo costume", () => {
  const costume = {
    ida: null,
    volta: { fonte: "historico", route_point_code: "cantanhede", route_point_name: "Cantanhede", neighborhood: null, detail: "Av. Rio Branco, Comercial Pinto", dropoff_location: null },
  };
  const r = validarPedidoExtraido(
    { data: "2026-11-10", direcao: "volta", ponto: "cantanhede", endereco: "Cantanhede", cidade_dita: "cantanhede" },
    { ...ctx, costume, agendado: true },
  );
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.rascunho.route_point_code, "cantanhede");
  assertEquals(r.rascunho.pickup_detail, "Av. Rio Branco, Comercial Pinto");
  assert(r.rascunho.notes?.includes("Embarque pelo endereço de costume"));
  // costume de OUTRA cidade não entra; sem costume, a cidade não vira endereço
  const outra = validarPedidoExtraido(
    { data: "2026-11-10", direcao: "volta", ponto: "pirapemas", endereco: "Pirapemas", cidade_dita: "pirapemas" },
    { ...ctx, costume, agendado: true },
  );
  assert(outra.ok);
  if (outra.ok) assertEquals(outra.rascunho.pickup_detail, "Endereço a confirmar");
  // endereço dito pelo cliente vale sobre o costume
  const dito = validarPedidoExtraido(
    { data: "2026-11-10", direcao: "volta", ponto: "cantanhede", endereco: "Rua Nova, 10", cidade_dita: "cantanhede" },
    { ...ctx, costume, agendado: true },
  );
  assert(dito.ok);
  if (dito.ok) assertEquals(dito.rascunho.pickup_detail, "Rua Nova, 10");
});

Deno.test("#335: dia pedido sem pedido lido faz o Agendado reler", () => {
  assertEquals(agendadoPrecisaReler({ pedidos: 1, motivos: [], codigosPendentes: [], diasSemPedido: ["2026-11-14"] }), true);
  assertEquals(agendadoPrecisaReler({ pedidos: 1, motivos: [], codigosPendentes: [], diasSemPedido: [] }), false);
});

Deno.test("#337: resposta rápida do cliente não relê o Agendado enquanto a 1ª leitura roda", async () => {
  const { deveRelerAgendado } = await import("./rascunhoPuro.ts");
  // "Bgd" 9 s depois do Agendado: a primeira leitura ainda está lançando
  assertEquals(deveRelerAgendado({ idadeDaMarcaMs: 9_000, lancadas: 0, pendentes: 0, pendenciaAberta: false }), false);
  assertEquals(deveRelerAgendado({ idadeDaMarcaMs: 9_000, lancadas: 0, pendentes: 1, pendenciaAberta: true }), false);
  // depois: relê o que ficou pendente
  assertEquals(deveRelerAgendado({ idadeDaMarcaMs: 600_000, lancadas: 1, pendentes: 1, pendenciaAberta: true }), true);
  // terminou sem lançar e abriu pendência: o cliente completou, relê
  assertEquals(deveRelerAgendado({ idadeDaMarcaMs: 600_000, lancadas: 0, pendentes: 0, pendenciaAberta: true }), true);
  // já lançou tudo, ou não há nada pendente nem pendência: não relê
  assertEquals(deveRelerAgendado({ idadeDaMarcaMs: 600_000, lancadas: 1, pendentes: 0, pendenciaAberta: false }), false);
  assertEquals(deveRelerAgendado({ idadeDaMarcaMs: 600_000, lancadas: 0, pendentes: 0, pendenciaAberta: false }), false);
  assertEquals(deveRelerAgendado({ idadeDaMarcaMs: Number.NaN, lancadas: 0, pendentes: 1, pendenciaAberta: true }), false);
});

Deno.test("#337: o que o cliente manda durante a leitura do Agendado não se perde", async () => {
  const { deveLerDeNovoNoFim } = await import("./rascunhoPuro.ts");
  // ficou pendente (ex.: faltava o endereço) e ele mandou mensagem nesses segundos: lê de novo
  assertEquals(deveLerDeNovoNoFim({ pendentes: 1, lidos: 1, novasDoCliente: 1 }), true);
  assertEquals(deveLerDeNovoNoFim({ pendentes: 0, lidos: 0, novasDoCliente: 2 }), true);
  // lançou tudo ("Obrigado" no meio): nada a fazer; sem mensagem nova também não
  assertEquals(deveLerDeNovoNoFim({ pendentes: 0, lidos: 1, novasDoCliente: 1 }), false);
  assertEquals(deveLerDeNovoNoFim({ pendentes: 1, lidos: 1, novasDoCliente: 0 }), false);
});

Deno.test("#345: 4 passagens com dois desembarques na mesma viagem viram UMA reserva de 4", async () => {
  const { juntarPedidosDaMesmaViagem } = await import("./rascunhoPuro.ts");
  const base = { data: "2026-11-13", direcao: "volta", ponto: "pirapemas", endereco: "Pira Lanches, próximo ao SESCIBA" };
  const r = juntarPedidosDaMesmaViagem([
    { ...base, quantidade: 2, desembarque: "Santo Antônio" },
    { ...base, quantidade: 2, desembarque: "Estrada da Maioba" },
  ]);
  assertEquals(r.length, 1);
  assertEquals(r[0].quantidade, 4);
  assertEquals(r[0].desembarque, "2 em Santo Antônio; 2 em Estrada da Maioba");
  assertEquals(r[0].endereco, "Pira Lanches, próximo ao SESCIBA");
  // Ida e Volta, ou outro dia, continuam separados; passageiro de outra pessoa também
  assertEquals(juntarPedidosDaMesmaViagem([{ ...base, quantidade: 1 }, { ...base, direcao: "ida", ponto: "busca", quantidade: 1 }]).length, 2);
  assertEquals(juntarPedidosDaMesmaViagem([{ ...base, quantidade: 1 }, { ...base, data: "2026-11-14", quantidade: 1 }]).length, 2);
  assertEquals(juntarPedidosDaMesmaViagem([{ ...base, quantidade: 1 }, { ...base, quantidade: 1, passageiro_nome: "Outra Pessoa", passageiro_telefone: "98999990000" }]).length, 2);
  // mesmo desembarque: soma e mantém o texto
  assertEquals(juntarPedidosDaMesmaViagem([{ ...base, quantidade: 1, desembarque: "Rodoviária" }, { ...base, desembarque: "rodoviaria" }])[0], { ...base, quantidade: 2, desembarque: "Rodoviária", bairro: null, cidade_dita: null, nome_informado: null, trecho_do_cliente: null, duvida: null });
});

Deno.test("#345: complemento (apto/bloco) completa o endereço, não substitui", async () => {
  const { ehComplementoDoEndereco, planejarAtualizacao } = await import("./rascunhoPuro.ts");
  assertEquals(ehComplementoDoEndereco("Apartamento 108 bloco 11"), true);
  assertEquals(ehComplementoDoEndereco("casa 5"), true);
  assertEquals(ehComplementoDoEndereco("qd 3 lt 10"), true);
  assertEquals(ehComplementoDoEndereco("Rua do Sol, 10"), false);
  assertEquals(ehComplementoDoEndereco("bloco"), false);
  const pontos = { ida: ["busca", "rodoviaria", "retorno", "outro"], volta: ["pirapemas", "cantanhede"] };
  const res = { data: "2026-11-13", direcao: "ida" as const, ponto: "busca", pickupDetail: "Professora Concita, Condomínio Ponta Verde, próximo ao Pátio Norte ()", pendentes: ["endereco" as const] };
  const p = planejarAtualizacao(res, { reserva: 1, endereco: "Apartamento 108 bloco 11" }, { hoje: "2026-11-12", pontos });
  assertEquals(p?.pickupDetail, "Professora Concita, Condomínio Ponta Verde, próximo ao Pátio Norte, Apartamento 108 bloco 11");
  // endereço de verdade troca o que estava
  const q = planejarAtualizacao({ ...res, pickupDetail: "Endereço a confirmar" }, { reserva: 1, endereco: "Apartamento 108 bloco 11" }, { hoje: "2026-11-12", pontos });
  assertEquals(q?.pickupDetail, "Apartamento 108 bloco 11");
  const r = planejarAtualizacao(res, { reserva: 1, endereco: "Rua do Sol, 10" }, { hoje: "2026-11-12", pontos });
  assertEquals(r?.pickupDetail, "Rua do Sol, 10");
});

Deno.test("#387: 'quero uma passagem para hoje' depois que a Ida saiu é a Volta de hoje (cidade pelo costume)", () => {
  const costume = { volta: { fonte: "historico", route_point_code: "pirapemas", route_point_name: "Pirapemas", detail: "Rua Eurico Ribeiro, casa amarela" } };
  const r = validarPedidoExtraido(
    { data: "2026-11-13", direcao: "ida", ponto: "busca" },
    { ...ctx, hoje: "2026-11-13", horaAgora: "07:58", hojeDito: true, sentidoDito: null, costume, agendado: true },
  );
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.rascunho.trip_date, "2026-11-13");
  assertEquals(r.rascunho.direction, "volta");
  assertEquals(r.rascunho.route_point_code, "pirapemas");
  assert(r.rascunho.notes?.includes("sem dizer o sentido"));
  // o bot sozinho (sem o Agendado da equipe): só com o hábito do cliente (costume na Volta)
  const soBot = validarPedidoExtraido(
    { data: "2026-11-13", direcao: "ida" },
    { ...ctx, hoje: "2026-11-13", horaAgora: "07:58", hojeDito: true, sentidoDito: null, costume },
  );
  assert(soBot.ok && soBot.rascunho.direction === "volta");
  // sem hábito e sem o Agendado da equipe: não decide (pergunta / equipe confere)
  assertEquals(
    validarPedidoExtraido(
      { data: "2026-11-13", direcao: "ida" },
      { ...ctx, hoje: "2026-11-13", horaAgora: "07:58", hojeDito: true, sentidoDito: null },
    ),
    { ok: false, motivo: "hoje_ja_saiu" },
  );
  // com o Agendado da equipe e sem hábito: é a Volta de hoje (a cidade fica para confirmar)
  const agendadoSemHabito = validarPedidoExtraido(
    { data: "2026-11-13", direcao: "ida" },
    { ...ctx, hoje: "2026-11-13", horaAgora: "07:58", hojeDito: true, sentidoDito: null, agendado: true },
  );
  assert(agendadoSemHabito.ok && agendadoSemHabito.rascunho.direction === "volta");
  // escreveu que é a Ida ("saindo de São Luís hoje"): não troca, a equipe confere
  assertEquals(
    validarPedidoExtraido(
      { data: "2026-11-13", direcao: "ida" },
      { ...ctx, hoje: "2026-11-13", horaAgora: "07:58", hojeDito: true, sentidoDito: "ida", costume },
    ),
    { ok: false, motivo: "hoje_ja_saiu" },
  );
  // disse onde embarca em São Luís: também não troca
  assertEquals(
    validarPedidoExtraido(
      { data: "2026-11-13", direcao: "ida", ponto: "busca", bairro: "Turu" },
      { ...ctx, hoje: "2026-11-13", horaAgora: "07:58", hojeDito: true, sentidoDito: null },
    ),
    { ok: false, motivo: "hoje_ja_saiu" },
  );
  // depois que a Volta também saiu: fica para a equipe
  assertEquals(
    validarPedidoExtraido(
      { data: "2026-11-13", direcao: "ida" },
      { ...ctx, hoje: "2026-11-13", horaAgora: "15:00", hojeDito: true, sentidoDito: null, costume },
    ),
    { ok: false, motivo: "hoje_ja_saiu" },
  );
});

Deno.test("#387: o Agendado anterior fecha o pedido de antes; correção logo depois continua no mesmo pedido", async () => {
  const { inicioDoPedidoAtual } = await import("./rascunhoPuro.ts");
  const m = (quem: string, texto: string, em: string) => ({ quem, texto, em });
  // caso real: pedido da Ida em 11/11 (lançado), pedido da Volta em 13/11
  const conversa = [
    m("cliente", "ainda têm vaga amanhã? De Slz pra Pirapemas", "2026-11-11T11:46:00Z"),
    m("cliente", "Buscar em casa, Forquilha", "2026-11-11T12:15:00Z"),
    m("equipe", "Agendado ☑️", "2026-11-11T12:32:00Z"),
    m("cliente", "ainda têm vaga pra Slz amanhã?", "2026-11-13T11:20:00Z"),
    m("cliente", "Reserva uma vaga pra mim, no Domingo", "2026-11-13T12:07:00Z"),
    m("equipe", "Agendado ☑️", "2026-11-13T12:21:00Z"),
    m("cliente", "Obrigada", "2026-11-13T12:21:30Z"),
  ];
  // disparo = o Agendado de 13/11: o pedido começa depois do de 11/11
  assertEquals(inicioDoPedidoAtual(conversa, "2026-11-13T12:21:00Z"), "2026-11-11T12:32:00Z");
  // correção 20 min depois de um Agendado + novo Agendado: é o mesmo pedido, sem corte
  const correcao = [
    m("cliente", "Quero ida amanhã, Cohatrac", "2026-11-13T10:00:00Z"),
    m("equipe", "Agendado ☑️", "2026-11-13T10:05:00Z"),
    m("cliente", "na verdade é no Turu", "2026-11-13T10:25:00Z"),
    m("equipe", "Agendado ✅", "2026-11-13T10:26:00Z"),
  ];
  assertEquals(inicioDoPedidoAtual(correcao, "2026-11-13T10:26:00Z"), null);
  // sem Agendado anterior, ou pergunta "está agendado?": sem corte
  assertEquals(inicioDoPedidoAtual([m("cliente", "oi", "2026-11-13T10:00:00Z")], null), null);
  assertEquals(
    inicioDoPedidoAtual(
      [m("equipe", "está agendado ☑️?", "2026-11-10T10:00:00Z"), m("cliente", "oi", "2026-11-13T10:00:00Z")],
      null,
    ),
    null,
  );
  // leitura disparada por mensagem do cliente (sem Agendado): corta no último Agendado antigo
  assertEquals(inicioDoPedidoAtual(conversa.slice(0, 5), "2026-11-13T12:07:00Z"), "2026-11-11T12:32:00Z");
});

Deno.test("#387: o Agendado só lança o que a leitura final confirmou; sobra da 1ª leitura vira pendência", async () => {
  const { rascunhosDoAgendado, avisoDoAgendado } = await import("./rascunhoPuro.ts");
  // caso real: 1ª leitura criou Ida (não bate com o cliente) e Volta; a releitura só gravou a Volta
  const prontos = [
    { id: "ida-1a-leitura", direction: "ida" },
    { id: "volta", direction: "volta" },
  ];
  const r = rascunhosDoAgendado(prontos, ["volta"]);
  assertEquals(r.lancar.map((d) => d.id), ["volta"]);
  assertEquals(r.naoConfirmados.map((d) => d.id), ["ida-1a-leitura"]);
  assertEquals(rascunhosDoAgendado(prontos, ["volta", "ida-1a-leitura"]).naoConfirmados, []);
  assertEquals(rascunhosDoAgendado([], ["x"]), { lancar: [], naoConfirmados: [] });
  const aviso = avisoDoAgendado({ lancadas: 1, pedidos: 1, motivos: [], pendentes: ["nao_confirmado"] });
  assertEquals(aviso?.assunto, "Agendado ☑️ lançou só parte");
  assertStringIncludes(aviso?.detalhe ?? "", "leitura final do Agendado não a confirmou");
});

Deno.test("#401: o que veio logo depois do Agendado antigo ('desce na rodoviária?') fica no pedido de antes", async () => {
  const { inicioDoPedidoAtual } = await import("./rascunhoPuro.ts");
  const m = (quem: string, texto: string, em: string) => ({ quem, texto, em });
  const conversa = [
    m("cliente", "Amanhã vou com vocês de Cantanhede pra São Luís", "2026-11-12T18:54:00Z"),
    m("equipe", "Agendado ☑️", "2026-11-12T19:30:00Z"),
    m("cliente", "Desce na rodoviária ou na casa?", "2026-11-12T19:31:00Z"),
    m("equipe", "Ok tranquilo", "2026-11-12T20:50:00Z"),
    m("cliente", "Pode confirmar minha ida pra Cantanhde na segunda, tudo bem?", "2026-11-14T13:03:00Z"),
    m("equipe", "Agendado ☑️", "2026-11-14T13:26:00Z"),
  ];
  assertEquals(inicioDoPedidoAtual(conversa, "2026-11-14T13:26:00Z"), "2026-11-12T20:50:00Z");
});

Deno.test("#401: bairro achado tira a marca e a nota de 'reservada sem endereço'; recusa do banco legível", async () => {
  const { enderecoSemMarcaDeBairro, notasSemReservaSemEndereco, codigoDaRecusa, avisoDoAgendado } = await import("./rascunhoPuro.ts");
  assertEquals(enderecoSemMarcaDeBairro("Residencial Mali, Ap 202 (bairro a confirmar)"), "Residencial Mali, Ap 202");
  assertEquals(enderecoSemMarcaDeBairro(" (bairro a confirmar)"), null);
  const n = notasSemReservaSemEndereco("Reservada sem endereço (Agendado ☑️): sem valor até o cliente confirmar onde embarca. Bairro pelos lugares.", "Turu");
  assert(!n.includes("sem valor"));
  assertStringIncludes(n, "bairro Turu");
  assertEquals(codigoDaRecusa(undefined, "CAPACIDADE_EXCEDIDA: viagem x já tem 31 de 31 lugares ocupados", "rejected"), "LOTADO");
  assertEquals(codigoDaRecusa(undefined, "algo", "rejected"), "recusada");
  assertEquals(codigoDaRecusa("RESERVA_DUPLICADA", "", "rejected"), "RESERVA_DUPLICADA");
  const aviso = avisoDoAgendado({ lancadas: 0, pedidos: 1, motivos: [], pendentes: ["LOTADO"] });
  assertStringIncludes(aviso?.detalhe ?? "", "lotada");
});

Deno.test("#410: 'Atualizado ☑️' é a marca de correção; não é Agendado; pergunta não conta", async () => {
  const { ehMarcaDeCorrecao, ehMarcaDeAgendado } = await import("./rascunhoPuro.ts");
  for (const t of ["Atualizado ☑️", "atualizado ✅", "Corrigido ☑️", "Alterado ✅", "Remarcado ☑️", "Reserva atualizada ☑️"]) {
    assert(ehMarcaDeCorrecao(t), t);
    assert(!ehMarcaDeAgendado(t), t);
  }
  assert(!ehMarcaDeCorrecao("Atualizado"), "sem o ☑️ não é a marca");
  assert(!ehMarcaDeCorrecao("Atualizado ☑️?"), "pergunta");
  assert(!ehMarcaDeCorrecao("Agendado ☑️"));
});

Deno.test("#416: passageiro recorrente — 'guarde uma vaga pra mim amanhã' sai pelo hábito, com embarque e desembarque de costume", async () => {
  const { sentidoPeloHabito, validarPedidoExtraido } = await import("./rascunhoPuro.ts");
  const costume = {
    ida: { fonte: "manual", route_point_code: "busca", neighborhood: "Cohatrac", detail: "Condomínio Marsil", dropoff_location: "São Patrício, Cantanhede" },
    volta: { fonte: "manual", route_point_code: "cantanhede", detail: "São Patrício", dropoff_location: "Condomínio Marsil, Cohatrac" },
  };
  const viagens = [{ data: "2026-11-16", direcao: "ida" }];
  // depois da Ida de segunda, "amanhã" (terça) é a Volta
  assertEquals(sentidoPeloHabito("2026-11-17", viagens, costume), "volta");
  // já tem a Ida no dia: é a Volta do mesmo dia
  assertEquals(sentidoPeloHabito("2026-11-16", viagens, costume), "volta");
  // sem viagem antes e costume dos dois lados: não chuta
  assertEquals(sentidoPeloHabito("2026-11-20", [], costume), null);
  // costume de um lado só: esse
  assertEquals(sentidoPeloHabito("2026-11-20", [], { volta: costume.volta }), "volta");
  // sem costume: nada
  assertEquals(sentidoPeloHabito("2026-11-17", viagens, null), null);

  const v = validarPedidoExtraido(
    { tipo: "passagem", data: "2026-11-17", quantidade: 1 },
    {
      hoje: "2026-11-14",
      pontos: { ida: ["busca", "rodoviaria", "retorno", "outro"], volta: ["pirapemas", "cantanhede"] },
      costume,
      sentidoDoHabito: "volta",
      agendado: true,
    },
  );
  assert(v.ok);
  if (v.ok) {
    assertEquals(v.rascunho.direction, "volta");
    assertEquals(v.rascunho.route_point_code, "cantanhede");
    assertEquals(v.rascunho.pickup_detail, "São Patrício");
    assertEquals(v.rascunho.dropoff_location, "Condomínio Marsil, Cohatrac");
    assertEquals(v.cidadeIncerta, false);
    assertEquals(v.aConfirmar, []);
  }
});

Deno.test("#417: mensagem que o bot não lê fica marcada; editada vira texto novo; pendência legível", async () => {
  const { MENSAGEM_ILEGIVEL, ehMensagemIlegivel, textoEditado, avisoDoAgendado } = await import("./rascunhoPuro.ts");
  assert(ehMensagemIlegivel(MENSAGEM_ILEGIVEL));
  assert(!ehMensagemIlegivel("Se tiver vaga para Cantanhede, guarde uma pra mim"));
  assertEquals(textoEditado("é pra segunda"), "(editou a mensagem anterior) é pra segunda");
  const aviso = avisoDoAgendado({ lancadas: 0, pedidos: 1, motivos: [], pendentes: ["dia_ilegivel"] });
  assertStringIncludes(aviso?.detalhe ?? "", "confira o dia no WhatsApp");
});
