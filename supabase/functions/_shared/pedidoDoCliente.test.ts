import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  type CamposDoPedido,
  bairroEscrito,
  conferirPeloCliente,
  datasEscritas,
  pontoEscrito,
  quantidadeEscrita,
  sentidoEscrito,
} from "./pedidoDoCliente.ts";

// 11/11/2026 é quarta-feira (12h em São Luís = 15h UTC)
const QUARTA = "2026-11-11T15:00:00Z";
const msg = (texto: string, em = QUARTA) => ({ texto, em });
const pontosIda = ["busca", "rodoviaria", "retorno", "outro"];
const bairros = [{ neighborhood: "Turu" }, { neighborhood: "Cohatrac" }, { neighborhood: "Estrada da Maioba" }, { neighborhood: "Alto do Turu" }];

Deno.test("sentido: pra São Luís é Volta, pra Pirapemas é Ida; 'sou de Pirapemas' não decide", () => {
  assertEquals(sentidoEscrito(["duas passagens para amanhã a tarde de Pirapemas a são Luis"]), "volta");
  assertEquals(sentidoEscrito(["quero ir pra São Luís sexta"]), "volta");
  assertEquals(sentidoEscrito(["venho de Cantanhede dia 14"]), "volta");
  assertEquals(sentidoEscrito(["uma passagem pra Cantanhede amanhã cedo"]), "ida");
  assertEquals(sentidoEscrito(["saindo de São Luís amanhã"]), "ida");
  assertEquals(sentidoEscrito(["sou de Pirapemas"]), null);
  assertEquals(sentidoEscrito(["ida pra Pirapemas e volta pra São Luís domingo"]), null);
});

Deno.test("dia: conta do dia de cada mensagem; erros comuns; 'quarto' e 'Domingos' não são dia", () => {
  assertEquals(datasEscritas([msg("pra amanhã")]), ["2026-11-12"]);
  assertEquals(datasEscritas([msg("amnh cedo")]), ["2026-11-12"]);
  assertEquals(datasEscritas([msg("hj a tarde")]), ["2026-11-11"]);
  assertEquals(datasEscritas([msg("depois de amanhã")]), ["2026-11-13"]);
  assertEquals(datasEscritas([msg("na sexta")]), ["2026-11-13"]);
  assertEquals(datasEscritas([msg("sesta feira")]), ["2026-11-13"]);
  assertEquals(datasEscritas([msg("quarta que vem")]), ["2026-11-18"]); // dito numa quarta = a próxima
  assertEquals(datasEscritas([msg("dia 14")]), ["2026-11-14"]);
  assertEquals(datasEscritas([msg("dia 2")]), ["2026-12-02"]); // dia que já passou no mês = mês que vem
  assertEquals(datasEscritas([msg("14/11")]), ["2026-11-14"]);
  // "amanhã" de uma mensagem de ontem é hoje
  assertEquals(datasEscritas([msg("pra amanhã", "2026-11-10T15:00:00Z")]), ["2026-11-11"]);
  assertEquals(datasEscritas([msg("moro no quarto andar"), msg("Rua Domingos Paiva")]), []);
});

Deno.test("quantidade: 'duas passagens', '3 pessoas'; 'um lugar perto do posto' não conta", () => {
  assertEquals(quantidadeEscrita(["gostaria de agendar duas passagens"]), 2);
  assertEquals(quantidadeEscrita(["somos 3 pessoas"]), 3);
  assertEquals(quantidadeEscrita(["uma vaga por favor"]), 1);
  assertEquals(quantidadeEscrita(["é um lugar perto do posto"]), null);
  assertEquals(quantidadeEscrita(["duas passagens", "não, três pessoas"]), null); // mudou: não decide
});

Deno.test("ponto: rodoviária, retorno, busca em casa, Outros; 'estou em casa' no meio da conversa não é busca", () => {
  assertEquals(pontoEscrito(["fico na rodoviária"], pontosIda), "rodoviaria");
  assertEquals(pontoEscrito(["espero no retorno do aeroporto"], pontosIda), "retorno");
  assertEquals(pontoEscrito(["chego no aeroporto às 4h"], pontosIda), "outro");
  assertEquals(pontoEscrito(["pode me pegar em casa"], pontosIda), "busca");
  assertEquals(pontoEscrito(["em casa"], pontosIda), "busca");
  assertEquals(pontoEscrito(["hoje estou em casa o dia todo esperando a confirmação"], pontosIda), null);
  assertEquals(pontoEscrito(["rodoviária ou retorno?"], pontosIda), null);
});

Deno.test("bairro: nome de duas palavras em qualquer frase; de uma palavra só em resposta curta", () => {
  assertEquals(bairroEscrito(["condomínio Belleville na estrada da Maioba"], bairros)?.neighborhood, "Estrada da Maioba");
  assertEquals(bairroEscrito(["Cohatrac"], bairros)?.neighborhood, "Cohatrac");
  assertEquals(bairroEscrito(["moro na rua do Turu perto da padaria e do mercado"], bairros), null);
  assertEquals(bairroEscrito(["Alto do Turu"], bairros)?.neighborhood, "Alto do Turu");
  assertEquals(bairroEscrito(["Cohatrac", "não, Turu"], bairros), null);
});

Deno.test("conferência: completa o que a IA deixou vazio com o que o cliente escreveu", () => {
  const mensagens = [
    msg("Bom dia gostaria de agendar duas passagens para amanhã a tarde de Pirapemas a são Luis"),
    msg("Adriana. Na descida da Inês uma casa com jardim na frente"),
  ];
  const r = conferirPeloCliente({ tipo: "passagem" } as CamposDoPedido, mensagens, { hoje: "2026-11-11", pontosIda, bairros, pedidosLidos: 1 });
  assertEquals(r.pedido.direcao, "volta");
  assertEquals(r.pedido.data, "2026-11-12");
  assertEquals(r.pedido.quantidade, 2);
  assertStringIncludes(r.pedido.duvida ?? "", "Completado pelo que o cliente escreveu");
  assertEquals(r.avisos, []);
});

Deno.test("conferência: o que contradiz o cliente vira aviso, não troca sozinho", () => {
  const mensagens = [msg("duas passagens pra Cantanhede na sexta, buscar em casa no Cohatrac")];
  const r = conferirPeloCliente(
    { tipo: "passagem", direcao: "ida", data: "2026-11-14", quantidade: 1, ponto: "rodoviaria", bairro: null } as CamposDoPedido,
    mensagens,
    { hoje: "2026-11-11", pontosIda, bairros, pedidosLidos: 1 },
  );
  assertEquals(r.pedido.data, "2026-11-14"); // não trocou
  assertEquals(r.pedido.quantidade, 1);
  assert(r.avisos.some((a) => a.includes("13/11")));
  assert(r.avisos.some((a) => a.includes("2 passagem")));
  assert(r.avisos.some((a) => a.includes("busca")));
  assertStringIncludes(r.pedido.duvida ?? "", "Conferir:");
});

Deno.test("conferência: dois pedidos (duas pessoas ou ida e volta) não recebem a quantidade nem o sentido do total", () => {
  const mensagens = [msg("duas passagens, eu e minha filha, ida pra Pirapemas amanhã e volta domingo")];
  const r = conferirPeloCliente({ tipo: "passagem", direcao: "ida" } as CamposDoPedido, mensagens, { hoje: "2026-11-11", pontosIda, bairros, pedidosLidos: 2 });
  assertEquals(r.pedido.quantidade, undefined);
  // duas datas ditas (amanhã e domingo): não completa o dia
  assertEquals(r.pedido.data, undefined);
});

Deno.test("conferência: encomenda não é mexida", () => {
  const r = conferirPeloCliente({ tipo: "encomenda" } as CamposDoPedido, [msg("mando amanhã pra São Luís")], { hoje: "2026-11-11", pontosIda, bairros, pedidosLidos: 1 });
  assertEquals(r.pedido.data, undefined);
  assertEquals(r.completados, []);
});

Deno.test("#309 conferência final: a Ida de amanhã não passa se o cliente escreveu hoje", async () => {
  const { conferenciaFinal } = await import("./pedidoDoCliente.ts");
  const msgs = [
    { texto: "Deixe minha vaga", em: "2026-11-11T12:33:00Z" },
    { texto: "Hoje", em: "2026-11-11T12:34:00Z" },
    { texto: "Indo pra Miranda por favor", em: "2026-11-11T12:34:30Z" },
  ];
  const ctx = { hoje: "2026-11-11", pedidosLidos: 1 };
  const errada = conferenciaFinal({ trip_date: "2026-11-12", direction: "ida", quantity: 1 }, msgs, ctx);
  assertEquals(errada.length, 1);
  assertStringIncludes(errada[0], "o cliente escreveu o dia 11/11 e a reserva ficou para 12/11");
  assertEquals(conferenciaFinal({ trip_date: "2026-11-11", direction: "volta", quantity: 1, route_point_code: "pirapemas" }, msgs, ctx), []);
});

Deno.test("#309 conferência final: sentido, quantidade e cidade da Volta", async () => {
  const { conferenciaFinal } = await import("./pedidoDoCliente.ts");
  const msgs = [{ texto: "duas passagens de Pirapemas pra São Luís amanhã", em: "2026-11-11T12:00:00Z" }];
  const ctx = { hoje: "2026-11-11", pedidosLidos: 1, cidadeEscrita: "pirapemas" };
  const certo = { trip_date: "2026-11-12", direction: "volta", quantity: 2, route_point_code: "pirapemas" };
  assertEquals(conferenciaFinal(certo, msgs, ctx), []);
  assertEquals(conferenciaFinal({ ...certo, direction: "ida", route_point_code: "busca" }, msgs, ctx).length, 1);
  assertEquals(conferenciaFinal({ ...certo, quantity: 1 }, msgs, ctx).length, 1);
  assertEquals(conferenciaFinal({ ...certo, route_point_code: "cantanhede" }, msgs, ctx).length, 1);
  // dois pedidos lidos: sentido e quantidade não se comparam (cada pedido tem o seu)
  assertEquals(conferenciaFinal({ ...certo, direction: "ida", quantity: 1, route_point_code: "busca" }, msgs, { ...ctx, pedidosLidos: 2 }), []);
  // encomenda e cliente que não escreveu nada claro: nada contra
  assertEquals(conferenciaFinal({ ...certo, type: "encomenda", quantity: 9 }, msgs, ctx), []);
  assertEquals(conferenciaFinal(certo, [{ texto: "Bom dia, deixa minha vaga", em: "2026-11-11T12:00:00Z" }], ctx), []);
});

Deno.test("#309 conferência final: ida e volta em dias diferentes passam", async () => {
  const { conferenciaFinal } = await import("./pedidoDoCliente.ts");
  const msgs = [{ texto: "vou sexta e volto domingo", em: "2026-11-11T12:00:00Z" }];
  const ctx = { hoje: "2026-11-11", pedidosLidos: 2 };
  assertEquals(conferenciaFinal({ trip_date: "2026-11-13", direction: "ida" }, msgs, ctx), []);
  assertEquals(conferenciaFinal({ trip_date: "2026-11-15", direction: "volta" }, msgs, ctx), []);
  assertEquals(conferenciaFinal({ trip_date: "2026-11-14", direction: "volta" }, msgs, ctx).length, 1);
});

Deno.test("#320: resposta à pergunta de embarque é embarque; 'não' para a sugestão da equipe tira a sugestão", async () => {
  const { desembarqueEraEmbarque, sugestoesRecusadas, semSugestoesRecusadas, assuntoDaResposta } = await import("./pedidoDoCliente.ts");
  const em = (min: number) => `2026-11-11T14:${String(min).padStart(2, "0")}:00Z`;
  const conversa = [
    { quem: "cliente", texto: "Tem vaga hoje", em: em(12) },
    { quem: "cliente", texto: "Cantanhede a São luis", em: em(12) },
    { quem: "equipe", texto: "Temos sim", em: em(27) },
    { quem: "equipe", texto: "Te buscamos aonde?", em: em(27) },
    { quem: "cliente", texto: "Cantanhede", em: em(29) },
    { quem: "cliente", texto: "Depois do portal sentido matoes", em: em(30) },
    { quem: "equipe", texto: "Na usina certo?", em: em(31) },
    { quem: "cliente", texto: "São 2 vaga", em: em(31) },
    { quem: "cliente", texto: "Nao", em: em(31) },
    { quem: "cliente", texto: "Alojamento da 100 metros da pista", em: em(32) },
    { quem: "equipe", texto: "Agendado ☑️", em: em(33) },
  ];
  assertEquals(assuntoDaResposta(conversa, 9), "embarque");
  assertEquals(desembarqueEraEmbarque("Alojamento a 100 metros da pista", conversa), true);
  assertEquals(sugestoesRecusadas(conversa), ["usina"]);
  assertEquals(semSugestoesRecusadas("Depois do portal sentido Matões, na usina", ["usina"]), {
    texto: "Depois do portal sentido Matões",
    tirou: ["na usina"],
  });

  // o cliente falou em descer, ou a pergunta era do desembarque: continua desembarque
  const desce = [
    { quem: "equipe", texto: "Te buscamos aonde?", em: em(10) },
    { quem: "cliente", texto: "Rua Grande, e desço no Cohatrac", em: em(11) },
  ];
  assertEquals(desembarqueEraEmbarque("Cohatrac", desce), false);
  const ondeDesce = [
    { quem: "equipe", texto: "Vai descer onde?", em: em(10) },
    { quem: "cliente", texto: "Alojamento perto da pista", em: em(11) },
  ];
  assertEquals(desembarqueEraEmbarque("Alojamento perto da pista", ondeDesce), false);
  // "sim" confirma a sugestão; desembarque que não veio de resposta não muda
  assertEquals(sugestoesRecusadas([{ quem: "equipe", texto: "Na usina, certo?", em: em(1) }, { quem: "cliente", texto: "Sim", em: em(2) }]), []);
  assertEquals(desembarqueEraEmbarque("Rodoviária", conversa), false);
  assertEquals(desembarqueEraEmbarque("", conversa), false);
});

Deno.test("#333: 'parada das vans' é o ponto Retorno", async () => {
  const { pontoEscrito } = await import("./pedidoDoCliente.ts");
  const pontos = ["busca", "rodoviaria", "retorno", "outro"];
  assertEquals(pontoEscrito(["Vou estar na parada das vans"], pontos), "retorno");
  assertEquals(pontoEscrito(["no ponto da van"], pontos), "retorno");
  assertEquals(pontoEscrito(["na rodoviária"], pontos), "rodoviaria");
});

Deno.test("#335: data confirmada à pergunta da equipe vale; dia pedido sem pedido lido aparece", async () => {
  const { datasConfirmadas, datasSemPedido, conferenciaFinal, datasEscritas } = await import("./pedidoDoCliente.ts");
  const em = (h: string) => `2026-11-11T${h}:00Z`; // quarta
  const falas = [
    { quem: "cliente", texto: "Quero uma passagem para pirapemas, irei aguardar na rodoviária. E de volta no domingo, rua do Sol.", em: em("17:02") },
    { quem: "equipe", texto: "A ida será no sábado certo?", em: em("17:03") },
    { quem: "cliente", texto: "Isso", em: em("17:04") },
    { quem: "equipe", texto: "Agendado ☑️", em: em("17:04") },
  ];
  assertEquals(datasConfirmadas(falas), ["2026-11-14"]);
  const msgs = falas.filter((f) => f.quem === "cliente").map((f) => ({ texto: f.texto, em: f.em }));
  const ctx = { hoje: "2026-11-11", pedidosLidos: 2, datasConfirmadas: datasConfirmadas(falas) };
  assertEquals(conferenciaFinal({ trip_date: "2026-11-14", direction: "ida" }, msgs, ctx), []);
  assertEquals(conferenciaFinal({ trip_date: "2026-11-14", direction: "ida" }, msgs, { ...ctx, datasConfirmadas: [] }).length, 1);
  // "não" não confirma
  assertEquals(datasConfirmadas([{ quem: "equipe", texto: "É pra sexta?", em: em("10:00") }, { quem: "cliente", texto: "Não, sábado", em: em("10:01") }]), []);

  // Ida de sábado e Volta de domingo pedidas; a leitura só achou a Volta
  const pedido = [
    { texto: "Marca um passagem para o dia 14 no sábado de Pedrinhas", em: em("20:01") },
    { texto: "De Pirapemas a São Luís na Rua do Sol outra passagem por dia 15", em: em("20:02") },
  ];
  const datas = datasEscritas(pedido);
  assertEquals(datasSemPedido(datas, ["2026-11-15"], [], "2026-11-11"), ["2026-11-14"]);
  assertEquals(datasSemPedido(datas, ["2026-11-15", "2026-11-14"], [], "2026-11-11"), []);
  // dia que já tem reserva, ou que já passou, não conta
  assertEquals(datasSemPedido(datas, ["2026-11-15"], ["2026-11-14"], "2026-11-11"), []);
  assertEquals(datasSemPedido(["2026-11-10"], [], [], "2026-11-11"), []);
});
