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
