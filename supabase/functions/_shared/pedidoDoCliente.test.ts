import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  type CamposDoPedido,
  bairroEscrito,
  conferirPeloCliente,
  datasEscritas,
  pontoEscrito,
  quantidadeEscrita,
  embarqueNoInteriorEscrito,
  quantidadeIncerta,
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
  // o singular "passagem" termina em M: "passagens?" não pegava (issue #504)
  assertEquals(quantidadeEscrita(["quero uma passagem pra amanhã"]), 1);
  assertEquals(quantidadeEscrita(["Quero uma. Passagem. Prá. A. Manhã"]), 1);
  assertEquals(quantidadeEscrita(["1 passagem"]), 1);
  // a correção do cliente vence o que ele disse antes (issue #504, caso a71f0cbb)
  assertEquals(quantidadeEscrita(["Pra 3 pessoas", "Marca só uma tá", "É aqui na estrada matoes"]), 1);
  assertEquals(quantidadeEscrita(["quero 3 passagens", "só 2 passagens"]), 2);
  assertEquals(quantidadeEscrita(["duas passagens", "só uma"]), 1);
  // "só uma dúvida" não é quantidade
  assertEquals(quantidadeEscrita(["duas passagens", "só uma dúvida, que horas sai?"]), 2);
  assertEquals(quantidadeEscrita(["uma vaga por favor"]), 1);
  assertEquals(quantidadeEscrita(["é um lugar perto do posto"]), null);
  assertEquals(quantidadeEscrita(["duas passagens", "não, três pessoas"]), null); // mudou: não decide
});

Deno.test("ponto: rodoviária, retorno, busca em casa, Outros; 'estou em casa' no meio da conversa não é busca", () => {
  assertEquals(pontoEscrito(["espero na rodoviária"], pontosIda), "rodoviaria");
  // "ficar" é onde desce ("Onde você vai ficar?"): não diz o embarque (issue #454)
  assertEquals(pontoEscrito(["fico na rodoviária"], pontosIda), null);
  assertEquals(pontoEscrito(["Ficar no retorno do Tirirical"], pontosIda), null);
  assertEquals(pontoEscrito(["fico esperando no retorno"], pontosIda), "retorno");
  assertEquals(pontoEscrito(["Até no retorno"], pontosIda), null);
  assertEquals(pontoEscrito(["aguardo até as 5h no retorno"], pontosIda), "retorno");
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
  // dois pedidos lidos: a quantidade não se compara (cada pedido tem a sua), mas uma Ida que o cliente
  // não pediu (ele só escreveu a Volta e não falou em ida) não passa calada (issue #351)
  const doisPedidos = conferenciaFinal({ ...certo, direction: "ida", quantity: 1, route_point_code: "busca" }, msgs, { ...ctx, pedidosLidos: 2 });
  assertEquals(doisPedidos.length, 1);
  assertStringIncludes(doisPedidos[0], "a Ida não foi pedida");
  assertEquals(conferenciaFinal({ ...certo, quantity: 1 }, msgs, { ...ctx, pedidosLidos: 2 }), []);
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

Deno.test("#351: reagendar só a Ida não lança uma Volta que o cliente não pediu", async () => {
  const { conferenciaFinal } = await import("./pedidoDoCliente.ts");
  const msgs = [
    { texto: "Vou querer uma passagem pra pirapemas", em: "2026-11-11T16:32:00Z" },
    { texto: "Sexta feira", em: "2026-11-11T16:55:00Z" },
    { texto: "Condomínio village del mar", em: "2026-11-11T16:58:00Z" },
    { texto: "Vou ficar na casa do professor lu", em: "2026-11-11T16:58:30Z" },
    { texto: "Pirapemas", em: "2026-11-11T16:58:40Z" },
    { texto: "Gostaria de agendar de novo! Agora certeza!", em: "2026-11-12T19:06:00Z" },
    { texto: "Sim", em: "2026-11-12T19:08:00Z" },
  ];
  const ctx = { hoje: "2026-11-12", pedidosLidos: 2 };
  const volta = conferenciaFinal({ trip_date: "2026-11-13", direction: "volta", quantity: 1, route_point_code: "pirapemas" }, msgs, ctx);
  assertEquals(volta.length, 1);
  assertStringIncludes(volta[0], "a Volta não foi pedida");
  assertEquals(conferenciaFinal({ trip_date: "2026-11-13", direction: "ida", quantity: 1 }, msgs, ctx), []);
  // falou da volta: as duas valem
  const comVolta = [...msgs, { texto: "e volto domingo", em: "2026-11-12T19:09:00Z" }];
  assertEquals(conferenciaFinal({ trip_date: "2026-11-15", direction: "volta", quantity: 1, route_point_code: "pirapemas" }, comVolta, { ...ctx, hoje: "2026-11-12" }).filter((x) => x.includes("não foi pedida")), []);
});

Deno.test("#401: pergunta e fala de onde desce não dizem o embarque; 'e retorno segunda' é a outra viagem", async () => {
  const { falouDasDuasViagens } = await import("./pedidoDoCliente.ts");
  // caso real: "Desce na rodoviária ou na casa?" era sobre a Volta; o pedido novo é busca em casa
  assertEquals(pontoEscrito(["Desce na rodoviária ou na casa?", "Pode confirmar minha ida pra Cantanhde na segunda"], pontosIda), null);
  assertEquals(pontoEscrito(["me deixa na rodoviária"], pontosIda), null);
  assertEquals(pontoEscrito(["vou estar na rodoviária"], pontosIda), "rodoviaria");
  assert(falouDasDuasViagens(["passagem pra São Luís amanhã a tarde e retorno segunda-feira de manhã"]));
  assert(falouDasDuasViagens(["Uma de Ida para Cantanhede e outra de volta..."]));
  assert(!falouDasDuasViagens(["vou estar no retorno das vans"]));
});

Deno.test("#401: formulário de Ida colado duas vezes + 'outra de volta': a segunda vira a Volta com os endereços trocados", async () => {
  const { segundaViagemEhAOutra } = await import("./pedidoDoCliente.ts");
  const ida = (data: string) => ({
    tipo: "passagem",
    data,
    direcao: "ida",
    ponto: "busca",
    bairro: "Cohab Anil III",
    endereco: "Condomínio Home Practice",
    desembarque: "Praça da Cruz",
  });
  const lidos = [ida("2026-11-22"), ida("2026-11-20")];
  const textos = ["Data da viagem: 20/11 de São Luís para Cantanhede.", "Data da viagem: 22/11 de São Luís para Cantanhede.", "Uma de Ida para Cantanhede e outra de volta..."];
  const r = segundaViagemEhAOutra(lidos, textos);
  const volta = r.find((p) => p.data === "2026-11-22");
  const primeira = r.find((p) => p.data === "2026-11-20");
  assertEquals(primeira?.direcao, "ida");
  assertEquals(volta?.direcao, "volta");
  assertEquals(volta?.endereco, "Praça da Cruz");
  assertEquals(volta?.desembarque, "Condomínio Home Practice, Cohab Anil III");
  assertEquals(volta?.bairro, null);
  // sem falar em volta, ou já em sentidos diferentes: não mexe
  assertEquals(segundaViagemEhAOutra(lidos, ["20/11 e 22/11 pra Cantanhede"]), lidos);
  const certos = [ida("2026-11-20"), { ...ida("2026-11-22"), direcao: "volta" }];
  assertEquals(segundaViagemEhAOutra(certos, textos), certos);
});

Deno.test("#406/#407: o sentido sai da ordem das paradas (São Luís … Cantanhede → Campestre → Pirapemas)", async () => {
  const { origemEscrita, origemDoPedido, pedidosPelaOrigem, conferenciaFinal, sentidoDoTrecho } = await import("./pedidoDoCliente.ts");
  // destino depois da origem na Ida = Ida; antes = Volta
  assertEquals(sentidoDoTrecho("pirapemas", "cantanhede"), "volta");
  assertEquals(sentidoDoTrecho("cantanhede", "pirapemas"), "ida"); // a Volta já passou por Cantanhede vinda de Pirapemas
  assertEquals(sentidoDoTrecho("cantanhede", "miranda"), "volta");
  assertEquals(sentidoDoTrecho("miranda", "cantanhede"), "ida");
  assertEquals(sentidoDoTrecho("campestre", "pirapemas"), "ida");
  assertEquals(sentidoDoTrecho("sao luis", "matoes"), "ida");

  assertEquals(sentidoEscrito(["uma passagem de Pirapemas para Cantanhede"]), "volta");
  assertEquals(sentidoEscrito(["de Cantanhede pra Pirapemas amanhã"]), "ida");
  assertEquals(sentidoEscrito(["de Cantanhede para Matões do Norte"]), "volta");
  assertEquals(sentidoEscrito(["saindo de Cantanhede"]), "volta");
  assertEquals(sentidoEscrito(["de São Luís pra Miranda"]), "ida");
  assertEquals(sentidoEscrito(["saindo de slz"]), "ida");
  // sem origem, o destino diz
  assertEquals(sentidoEscrito(["Pra Cantanhede"]), "ida");
  assertEquals(sentidoEscrito(["quero ir pra São Luís"]), "volta");
  // "sou de Pirapemas" não é origem do trecho
  assertEquals(origemEscrita("sou de Pirapemas"), null);
  assertEquals(origemEscrita("de Cantanhede pra Pirapemas"), { sentido: "ida", de: "cantanhede", para: "pirapemas" });

  // caso real (#406): o cliente só escreveu "Pra Cantanhede"; a equipe disse o trecho e ele confirmou
  const falas = [
    { quem: "cliente", texto: "Agenda minha passagem pra amanhã, por favor!" },
    { quem: "cliente", texto: "Pra Cantanhede" },
    { quem: "equipe", texto: "Buscar na rua do Sol certo? De pirapemas pra Cantanhede" },
    { quem: "cliente", texto: "Isso" },
    { quem: "equipe", texto: "Agendado ☑️" },
  ];
  const origem = origemDoPedido(falas);
  assertEquals(origem, { sentido: "volta", de: "pirapemas", para: "cantanhede" });
  // a equipe sugeriu e o cliente negou: não vale a sugestão
  assertEquals(
    origemDoPedido([{ quem: "equipe", texto: "De pirapemas pra Cantanhede?" }, { quem: "cliente", texto: "não, de São Luís pra Cantanhede" }])?.sentido,
    "ida",
  );

  type Lido = { tipo: string; data: string; direcao: string; ponto: string | null; bairro: string | null; endereco: string | null; desembarque: string | null; cidade_dita?: string | null };
  const lidos: Lido[] = [{ tipo: "passagem", data: "2026-11-15", direcao: "ida", ponto: "busca", bairro: "Turu", endereco: "Rua do Sol", desembarque: "Cantanhede" }];
  const [p] = pedidosPelaOrigem(lidos, origem);
  assertEquals([p.direcao, p.cidade_dita, p.bairro, p.ponto, p.endereco, p.desembarque], ["volta", "pirapemas", null, null, "Rua do Sol", "Cantanhede"]);
  // sem trecho dito, não mexe
  assertEquals(pedidosPelaOrigem(lidos, origemDoPedido(falas.slice(0, 2))), lidos);

  // de Cantanhede pra Pirapemas: Ida, embarque Outros em Cantanhede, desembarque Pirapemas
  const [c] = pedidosPelaOrigem(
    [{ ...lidos[0], direcao: "volta", ponto: "cantanhede", bairro: null, endereco: "Praça da Cruz", desembarque: null, cidade_dita: "cantanhede" }],
    origemDoPedido([{ quem: "cliente", texto: "de Cantanhede pra Pirapemas" }]),
  );
  assertEquals([c.direcao, c.ponto, c.endereco, c.desembarque, c.cidade_dita], ["ida", "outro", "Cantanhede, Praça da Cruz", "Pirapemas", null]);
  // de Miranda pra São Luís: Volta no ponto Cantanhede com a cidade no endereço (#326)
  const [m] = pedidosPelaOrigem([{ ...lidos[0], endereco: "perto do posto", desembarque: null }], origemDoPedido([{ quem: "cliente", texto: "de Miranda pra São Luís" }]));
  assertEquals([m.direcao, m.cidade_dita, m.endereco, m.desembarque], ["volta", "cantanhede", "Miranda do Norte, perto do posto", "São Luís"]);

  // a conferência final não trava a Volta de Pirapemas pelo "pra Cantanhede" do cliente
  const msgs = [msg("Agenda minha passagem pra amanhã, por favor!"), msg("Pra Cantanhede")];
  const r = { trip_date: "2026-11-12", direction: "volta", quantity: 1, route_point_code: "pirapemas" };
  const base = { hoje: "2026-11-11", pedidosLidos: 1, cidadeEscrita: "cantanhede" };
  assert(conferenciaFinal(r, msgs, base).length > 0);
  assertEquals(conferenciaFinal(r, msgs, { ...base, origem }), []);
});

Deno.test("#415: 'segunda pra ir e terça pra volta' — monta a Volta que faltou; 'Volta na terça de Cantanhede pro X' é Volta", async () => {
  const { outraViagemDoPar, pedidosPeloSentidoDoDia, origemEscrita } = await import("./pedidoDoCliente.ts");
  // sexta 14/11/2026, 18h em São Luís
  const SEXTA = "2026-11-14T21:43:00Z";
  const m = (texto: string, em = SEXTA) => ({ texto, em });
  const conversa = [
    m("Ainda tem vaga de são Luís pra Cantanhede na segunda feira"),
    m("Agenda uma passagem na segunda feira pra ir e na terça feira pra volta"),
    m("Condomínio masil"),
  ];
  type Lido = { tipo: string; data: string; direcao: string; ponto: string | null; bairro: string | null; endereco: string | null; desembarque: string | null; cidade_dita?: string | null };
  const ida: Lido = { tipo: "passagem", data: "2026-11-16", direcao: "ida", ponto: "busca", bairro: "Cohatrac", endereco: "Condomínio Marsil", desembarque: "Cantanhede" };
  const [i, v] = outraViagemDoPar([ida], conversa, "2026-11-14");
  assertEquals(i, ida);
  assertEquals([v.data, v.direcao, v.cidade_dita, v.endereco, v.desembarque], ["2026-11-17", "volta", "cantanhede", null, "Condomínio Marsil, Cohatrac"]);
  // sem falar das duas viagens, ou com as duas já lidas: não mexe
  assertEquals(outraViagemDoPar([ida], [m("segunda e terça pra Cantanhede")], "2026-11-14").length, 1);
  assertEquals(outraViagemDoPar([ida, { ...ida, data: "2026-11-17", direcao: "volta" }], conversa, "2026-11-14").length, 2);

  // "Volta na terça feira de Cantanhede pro marsil" (lida como Ida de terça) → Volta saindo de Cantanhede
  assertEquals(origemEscrita("Volta na terça feira de Cantanhede pro marsil")?.sentido, "volta");
  assertEquals(sentidoEscrito(["Volta na terça feira de Cantanhede pro marsil"]), "volta");
  assertEquals(sentidoEscrito(["segunda pra ir e terça pra volta"]), null);
  const lidaErrada: Lido = { tipo: "passagem", data: "2026-11-17", direcao: "ida", ponto: "busca", bairro: null, endereco: "Cantanhede", desembarque: "Condomínio Marsil" };
  const [c] = pedidosPeloSentidoDoDia([lidaErrada], [...conversa, m("Volta na terça feira de Cantanhede pro marsil")]);
  assertEquals([c.direcao, c.cidade_dita, c.endereco, c.ponto], ["volta", "cantanhede", null, null]);
  // a mensagem que cita os dois dias não decide nenhum deles
  assertEquals(pedidosPeloSentidoDoDia([ida], conversa), [ida]);
});

Deno.test("#451 o dia de uma mensagem sobre encomenda não trava as passagens pedidas depois", async () => {
  const { conferenciaFinal, conferirPeloCliente, semFalaDeEncomenda } = await import("./pedidoDoCliente.ts");
  // 16/11/2026 (segunda): de manhã fala de uma encomenda "hoje"; à tarde pede duas passagens sem dia
  const msgs = [
    { texto: "Bom dia", em: "2026-11-16T13:44:00Z" },
    { texto: "Pra pegar hoje a encomenda", em: "2026-11-16T13:44:30Z" },
    { texto: "Eu já quero marcar duas passagens", em: "2026-11-16T19:08:00Z" },
    { texto: "Daqui de São Luís pra Pirapemas", em: "2026-11-16T19:09:00Z" },
    { texto: "São duas passagens", em: "2026-11-16T19:10:00Z" },
    { texto: "Rua Exemplo, 10 Bairro Fictício", em: "2026-11-16T19:34:00Z" },
  ];
  const ctx = { hoje: "2026-11-16", pedidosLidos: 1 };
  assertEquals(semFalaDeEncomenda(msgs).length, 5);
  // a reserva da Ida de amanhã com 2 passagens passa na conferência final
  assertEquals(
    conferenciaFinal({ type: "passagem", trip_date: "2026-11-17", direction: "ida", quantity: 2, route_point_code: "busca" }, msgs, ctx),
    [],
  );
  // e o "hoje" da encomenda não vira o dia da passagem nem aviso de dia diferente
  const ctxPedido = { ...ctx, pontosIda, bairros };
  const r = conferirPeloCliente({ data: "2026-11-17", direcao: "ida", quantidade: 2 } as CamposDoPedido, msgs, ctxPedido);
  assertEquals(r.avisos.filter((a) => a.includes("dia")), []);
  const semDia = conferirPeloCliente({ direcao: "ida", quantidade: 2 } as CamposDoPedido, msgs, ctxPedido);
  assertEquals(semDia.pedido.data, undefined);
  // dia escrito junto do pedido de passagem continua valendo
  const comDia = [...msgs, { texto: "É pra quarta", em: "2026-11-16T19:40:00Z" }];
  assertEquals(conferenciaFinal({ type: "passagem", trip_date: "2026-11-17", direction: "ida", quantity: 2 }, comDia, ctx).length, 1);
});

Deno.test("#454 conferência final: 'Ficar no retorno' numa Volta é onde desce, não trava", async () => {
  const { conferenciaFinal } = await import("./pedidoDoCliente.ts");
  const msgs = [
    { texto: "Tem uma vaga amanhã pra são Luís???", em: "2026-11-17T23:29:45Z" },
    { texto: "Cantanhede", em: "2026-11-17T23:32:48Z" },
    { texto: "Em Cantanhede pra são Luís", em: "2026-11-17T23:35:54Z" },
    { texto: "Ficar no retorno do Tirirical", em: "2026-11-17T23:36:07Z" },
  ];
  const ctx = { hoje: "2026-11-17", pedidosLidos: 1 };
  const volta = { trip_date: "2026-11-18", direction: "volta", quantity: 1, route_point_code: "cantanhede" };
  assertEquals(conferenciaFinal(volta, msgs, ctx), []);
  // "aguardo vcs no retorno" continua sendo embarque em São Luís (issue #419)
  const espera = [{ texto: "Aguardo vcs no retorno", em: "2026-11-17T23:40:00Z" }];
  assertEquals(conferenciaFinal({ ...volta, route_point_code: null }, espera, ctx).length, 1);
});

Deno.test("#465 origem com o nome da parada escrito errado", async () => {
  const { origemEscrita, origemDoPedido, paradasCorrigidas } = await import("./pedidoDoCliente.ts");
  assertEquals(origemEscrita("Qual o valor da passagem de entrocamento a Pirapemas?")?.de, "entroncamento");
  assertEquals(origemEscrita("de catanhede pra são luis")?.sentido, "volta");
  // caso real (fictício): esperam na rodoviária de Entroncamento — Ida saindo de lá, não a Rodoviária de São Luís
  const o = origemDoPedido([
    { quem: "cliente", texto: "Qual o valor da passagem de entrocamento a Pirapemas?" },
    { quem: "equipe", texto: "40" },
    { quem: "cliente", texto: "Vou lhe aguardar na rodoviária!" },
  ]);
  assertEquals(o, { sentido: "ida", de: "entroncamento", para: "pirapemas" });
  // palavra comum não vira cidade
  assertEquals(paradasCorrigidas("mirandinha matos cantando campeao"), "mirandinha matos cantando campeao");
});

Deno.test("#486: 'espero no posto Carone' é o ponto Posto Carone (Outros se ele não existir)", () => {
  assertEquals(pontoEscrito(["espero no posto Carone"], ["busca", "rodoviaria", "retorno", "postocarone", "outro"]), "postocarone");
  assertEquals(pontoEscrito(["espero no posto Carone"], ["busca", "rodoviaria", "retorno", "outro"]), "outro");
  assertEquals(pontoEscrito(["fico esperando no aeroporto"], ["busca", "rodoviaria", "retorno", "postocarone", "outro"]), "outro");
});

Deno.test("#494: onde DEIXAR é o destino ('buscar em casa e deixar … em Cantanhede' = Ida)", () => {
  assertEquals(sentidoEscrito(["[áudio: quanto é pra buscar em casa e deixar aqui em casa, aqui na minha, em Cantanhede?]"]), "ida");
  assertEquals(sentidoEscrito(["pode deixar ela em Pirapemas"]), "ida");
  assertEquals(sentidoEscrito(["é pra deixar em casa em São Luís"]), "volta");
  // busca e deixa no interior: esta regra não decide
  assertEquals(sentidoEscrito(["buscar em Pirapemas e deixar na casa dela em Cantanhede"]), null);
  // "deixar agendado/uma vaga" não é desembarque
  assertEquals(sentidoEscrito(["pode deixar agendado em Pirapemas"]), null);
  assertEquals(sentidoEscrito(["deixar uma vaga saindo em Cantanhede"]), null);
});

Deno.test("#494: 'mesmo endereço que me deixou hoje' = sentido contrário da última viagem", async () => {
  const { pedeDeOndeDeixou, viagemDeOndeDeixou } = await import("./pedidoDoCliente.ts");
  const ida = { data: "2026-11-20", direcao: "ida", desembarque: "Cantanhede" };
  assert(pedeDeOndeDeixou(["Msm endereço q me deixou hj"]));
  assert(pedeDeOndeDeixou(["no mesmo lugar onde vocês me deixaram"]));
  assert(!pedeDeOndeDeixou(["o mesmo endereço de sempre"]));
  assertEquals(viagemDeOndeDeixou(["Msm endereço q me deixou hj"], [ida], "2026-11-20"), { direcao: "volta", cidade: "cantanhede", ultima: "ida 2026-11-20" });
  assertEquals(viagemDeOndeDeixou(["mesmo local que me deixou"], [{ ...ida, direcao: "volta", desembarque: "Rodoviária" }], "2026-11-21"), {
    direcao: "ida",
    cidade: null,
    ultima: "volta 2026-11-20",
  });
  // foi e voltou no mesmo dia: a última é a Volta
  assertEquals(viagemDeOndeDeixou(["mesmo lugar que me deixou"], [ida, { ...ida, direcao: "volta" }], "2026-11-20")?.direcao, "ida");
  // viagem futura ou antiga não conta; sem a frase, nada
  assertEquals(viagemDeOndeDeixou(["mesmo lugar que me deixou"], [{ ...ida, data: "2026-11-22" }, { ...ida, data: "2026-11-01" }], "2026-11-20"), null);
  assertEquals(viagemDeOndeDeixou(["no mesmo endereço"], [ida], "2026-11-20"), null);
});

Deno.test("#504 sentido: endereço de onde ele sai no interior é Volta", () => {
  assertEquals(embarqueNoInteriorEscrito(["Bom dia seu Ari tem vaga quero 2 Cantanhede rua do cajueiro bar nascer do sol manda a resposta"]), true);
  assertEquals(embarqueNoInteriorEscrito(["to aqui em Pirapemas, perto da praça"]), true);
  // quem mora lá também vai para casa (Ida); "Cantanhede no sábado" é data, não endereço
  assertEquals(embarqueNoInteriorEscrito(["moro em Cantanhede"]), false);
  assertEquals(embarqueNoInteriorEscrito(["Cantanhede no sábado"]), false);
  // destino no interior (Ida) não conta
  assertEquals(embarqueNoInteriorEscrito(["quero ir pra Pirapemas, rua do cajueiro"]), false);
  assertEquals(embarqueNoInteriorEscrito(["me deixa em Cantanhede na rua da areia"]), false);
  assertEquals(embarqueNoInteriorEscrito(["saindo de São Luís, vou pra Cantanhede rua nova"]), false);
  // só a cidade, sem endereço, não diz nada
  assertEquals(embarqueNoInteriorEscrito(["Cantanhede"]), false);
  assertEquals(embarqueNoInteriorEscrito(["tem vaga amanhã?"]), false);
});

Deno.test("#506: criança de até 5 anos vai no colo; a partir de 6 ocupa vaga", async () => {
  const { passagensComCrianca } = await import("./pedidoDoCliente.ts");
  const total = (...t: string[]) => passagensComCrianca(t)?.total ?? null;
  // o caso que não lançou: o áudio, o pedido e a idade respondida
  assertEquals(
    total("[áudio: São dois pessoas, eu, minha esposa e meu filho de três anos. Queria saber o horário]", "2 Adulto e uma criança", "Aeroporto", "Isso", "3 anos"),
    2,
  );
  assertEquals(total("1 adulto e 1 criança", "5 anos"), 1);
  assertEquals(total("1 adulto e 1 criança", "6 anos"), 2);
  assertEquals(total("2 adultos e um bebê"), 2);
  assertEquals(total("2 adultos e 1 criança de colo"), 2);
  assertEquals(total("2 adultos e 2 crianças", "3 anos e 4 anos"), 2);
  // não afirma: sem idade, idades misturadas ou faltando, mais crianças que colos, passagens ou lugar pedidos
  assertEquals(total("2 adultos e 1 criança"), null);
  assertEquals(total("2 adultos e 2 crianças", "3 anos e 8 anos"), null);
  assertEquals(total("2 adultos e 2 crianças", "3 anos"), null);
  assertEquals(total("1 adulto e 2 crianças", "2 anos e 3 anos"), null);
  assertEquals(total("3 passageiros (uma criança de colo)", "2 adultos e 1 criança"), null);
  assertEquals(total("1 adulto e 1 criança", "5 anos", "quero as duas"), null);
  assertEquals(total("1 adulto e 1 criança", "5 anos", "2"), null);
  assertEquals(total("1 adulto e 1 criança", "2 adultos e 1 criança", "5 anos"), null);
  assertEquals(total("2 passagens"), null);
});

Deno.test("#506: 2 adultos e criança de 3 anos lança 2 e não trava", async () => {
  const { conferirPeloCliente, conferenciaFinal } = await import("./pedidoDoCliente.ts");
  const msgs = ["Campestre", "Dia 30", "2 Adulto e uma criança", "Aeroporto", "3 anos"].map((texto) => ({ texto, em: "2026-11-23T22:59:00Z" }));
  const r = conferirPeloCliente(
    { tipo: "passagem", data: "2026-11-30", direcao: "volta", ponto: "pirapemas", quantidade: 3 },
    msgs,
    { hoje: "2026-11-23", pontosIda: [], bairros: [], pedidosLidos: 1 },
  );
  assertEquals(r.pedido.quantidade, 2);
  assertEquals(r.avisos, []);
  assert(String((r.pedido as { duvida?: string }).duvida).includes("no colo"));
  // deno-lint-ignore no-explicit-any
  const reserva: any = { type: "passagem", trip_date: "2026-11-30", direction: "volta", route_point_code: "pirapemas", quantity: 2 };
  // deno-lint-ignore no-explicit-any
  assertEquals(conferenciaFinal(reserva, msgs, { hoje: "2026-11-23", pedidosLidos: 1 } as any), []);
});

Deno.test("#504 quantidade falada no áudio e estragada pela transcrição: pergunta", () => {
  // caso 6a90bb67: "duas passagens" virou "despassar"
  assertEquals(quantidadeIncerta(["[áudio: Bom dia, eu quero despassar daqui de Pirapemba Miranda, viu? Aqui perto do Bar do Pepe]"]), true);
  assertEquals(quantidadeIncerta(["[áudio: quero duspassagem pra amanhã]"]), true);
  // palavras de verdade com "pass" e quantidade legível não são dúvida
  assertEquals(quantidadeIncerta(["[áudio: vou passar aí amanhã cedo]"]), false);
  assertEquals(quantidadeIncerta(["[áudio: quero duas passagens pra amanhã]"]), false);
  assertEquals(quantidadeIncerta(["[áudio: quero despassar]", "são 2 passagens"]), false);
  // fora de áudio, o cliente escreveu: não é erro de transcrição
  assertEquals(quantidadeIncerta(["quero despassar"]), false);
  // "Que hora que vocês passam aqui" é o verbo (caso 66c97996); "uma passagem" no singular é quantidade
  assertEquals(quantidadeIncerta(["[áudio: Que hora que vocês passam aqui e quanto é?]", "Quero uma. Passagem. Prá. A. Manhã"]), false);
  assertEquals(quantidadeIncerta(["[áudio: que horas vocês passariam aqui?]"]), false);
  // respondeu a pergunta só com o número: resolvido
  assertEquals(quantidadeIncerta(["[áudio: quero despassar daqui]", "Duas"]), false);
  assertEquals(quantidadeIncerta(["[áudio: quero despassar daqui]", "são 2"]), false);
  assertEquals(quantidadeIncerta(["[áudio: quero despassar daqui]", "ok obrigada"]), true);
});

Deno.test("#514: 'vindo de Pirapemas antes da entrada' é o lado da pista, não a origem", async () => {
  const { origemEscrita } = await import("./pedidoDoCliente.ts");
  assertEquals(origemEscrita("Vindo de pirapemas  antes da entrada  da rua das Flores."), null);
  assertEquals(origemEscrita("vindo de Cantanhede, logo depois da ponte"), null);
  // continua origem quando é a viagem
  assertEquals(origemEscrita("vindo de Pirapemas")?.de, "pirapemas");
  assertEquals(origemEscrita("vindo de Pirapemas para São Luís")?.sentido, "volta");
  assertEquals(origemEscrita("saindo de Cantanhede amanhã")?.de, "cantanhede");
});

Deno.test("#514: a cidade da resposta ao endereço decide o ponto da Volta", async () => {
  const { cidadeNaRespostaDoEndereco } = await import("./pedidoDoCliente.ts");
  const c = (...f: [string, string][]) => cidadeNaRespostaDoEndereco(f.map(([quem, texto]) => ({ quem, texto })));
  assertEquals(
    c(["cliente", "Ainda tem vaga pra ir sao Luís?"], ["equipe", "Qual o endereço pra lhe buscar?"], ["cliente", "Vila Exemplo Cantanhede"], ["cliente", "Vindo de pirapemas  antes da entrada  da rua das Flores."], ["equipe", "Agendado ☑️"]),
    "cantanhede",
  );
  assertEquals(c(["equipe", "Onde te pegamos?"], ["cliente", "Rua da Areia, Pirapema"]), "pirapemas");
  // sem cidade na resposta, duas cidades, destino, ou sem a pergunta: não decide
  assertEquals(c(["equipe", "Qual o endereço pra lhe buscar?"], ["cliente", "Rua da Areia"]), null);
  assertEquals(c(["equipe", "Qual o endereço pra lhe buscar?"], ["cliente", "Cantanhede ou Pirapemas, tanto faz"]), null);
  assertEquals(c(["equipe", "Qual o endereço pra lhe buscar?"], ["cliente", "Cohab, vou pra Cantanhede"]), null);
  assertEquals(c(["cliente", "Vila Exemplo Cantanhede"]), null);
  // a pergunta seguinte da equipe já é outro assunto
  assertEquals(c(["equipe", "Qual o endereço pra lhe buscar?"], ["cliente", "Vila Exemplo Cantanhede"], ["equipe", "Vai descer onde?"], ["cliente", "Pirapemas"]), "cantanhede");
});

Deno.test("#521: dia só perguntado e trocado por outro não é pedido que faltou", async () => {
  const { diasSoPerguntados } = await import("./pedidoDoCliente.ts");
  const em = "2026-11-22T13:00:00Z"; // domingo
  const d = (lidas: string[], ...t: string[]) => diasSoPerguntados(t.map((texto) => ({ texto, em })), lidas);
  assertEquals(d(["2026-11-23"], "Tem vaga pra slz hoje ?", "Marca uma pra amanhã pra mim"), ["2026-11-22"]);
  assertEquals(d(["2026-11-27"], "Na sexta também vem?", "No sábado tem?", "Deixa marcada duas na sexta de manhã"), ["2026-11-28"]);
  // pedido de verdade, dois dias na mesma pergunta, ou sem pedido depois: continua contando
  assertEquals(d(["2026-11-28"], "Gostaria de reservar uma vaga para domingo 29/11", "quero dia 28/11"), []);
  assertEquals(d(["2026-11-27"], "Tem vaga pra sexta e domingo?", "pode marcar sexta"), []);
  assertEquals(d(["2026-11-27"], "quero ir sexta", "E no domingo tem vaga?"), []);
  assertEquals(d(["2026-11-27"], "quero ir domingo?", "quero sexta"), []);
  assertEquals(d([], "Tem vaga hoje?", "amanhã"), []);
});

Deno.test("#531: 'pesagem' sem nada de encomenda é passagem; encomenda de verdade continua", async () => {
  const { passagemSemProvaDeEncomenda, cidadeNaRespostaDoEndereco } = await import("./pedidoDoCliente.ts");
  const tipo = (...t: string[]) =>
    passagemSemProvaDeEncomenda([{ tipo: "encomenda" }], t.map((texto) => ({ quem: "cliente", texto })))[0].tipo;
  assertEquals(tipo("quero marcar uma pesagem pra sexta dia 27", "De pirapemas pra slz", "Na casa da professora"), "passagem");
  assertEquals(tipo("Tem vaga amanhã?", "rua do exemplo"), "passagem");
  assertEquals(tipo("Preciso mandar um documento pra sao luis hj", "tem vaga?"), "encomenda");
  assertEquals(tipo("quero uma passagem e levar uma caixa"), "encomenda");
  assertEquals(tipo("pode deixar a sacola na rodoviária, tem lugar?"), "encomenda");
  assertEquals(tipo("rua do exemplo"), "encomenda");
  // a estrada que leva à cidade não é a cidade
  const resposta = (t: string) => cidadeNaRespostaDoEndereco([{ quem: "equipe", texto: "Qual o endereço pra lhe buscar" }, { quem: "cliente", texto: t }]);
  // "estrada de Pirapemas" fica entre as duas, mais perto de Cantanhede (dono, 24/11)
  assertEquals(resposta("Av. Exemplo (estrada de pirapemas"), "cantanhede");
  assertEquals(resposta("Estrada de Pirapemas, em Pirapemas"), null);
  assertEquals(resposta("Estrada de Cantanhede, em Pirapemas"), "pirapemas");
  assertEquals(resposta("Vila Exemplo Cantanhede"), "cantanhede");
});

Deno.test("#523: 'Onde você vai ficar' do formulário é desembarque, não resposta a onde buscar", async () => {
  const { desembarqueEraEmbarque } = await import("./pedidoDoCliente.ts");
  const em = "2026-11-10T12:00:00Z";
  const conversa = [
    { quem: "equipe", texto: "Local de embarque (Retorno/Rodoviária, Buscar em casa?)", em },
    { quem: "cliente", texto: "Local de embarque: Rua Exemplo, 58. Onde você vai ficar: Cantanhede, Rua Outra", em },
  ];
  assertEquals(desembarqueEraEmbarque("Cantanhede, Rua Outra", conversa), false);
});
