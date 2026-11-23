import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { ehMarcaDeAgendado } from "./rascunhoPuro.ts";
import { notaDaSentinela, pedidoEncerrado, pedidosSemReserva, resumoDosPedidos } from "./sentinelaPura.ts";

// Issue #461: sentinela de pedido sem reserva (dados fictícios). 18/11/2026 é quarta.

Deno.test("#461 pedidos: de hoje a 3 dias, só o que ainda não saiu", () => {
  const lidas = [
    { type: "passagem", trip_date: "2026-11-18", direction: "ida", quantity: 1 }, // Ida de hoje já saiu às 10h
    { type: "passagem", trip_date: "2026-11-18", direction: "volta", quantity: 2 }, // Volta de hoje ainda sai
    { type: "passagem", trip_date: "2026-11-19", direction: "ida", quantity: null },
    { type: "passagem", trip_date: "2026-11-25", direction: "ida", quantity: 1 }, // longe demais
    { type: "passagem", trip_date: "2026-11-17", direction: "volta", quantity: 1 }, // passou
    { type: "encomenda", trip_date: "2026-11-20", direction: "volta", quantity: 1 },
    { trip_date: "x", direction: "ida" },
    { trip_date: "2026-11-19", direction: "?" },
  ];
  assertEquals(pedidosSemReserva(lidas, { hoje: "2026-11-18", horaAgora: "10:00" }), [
    { data: "2026-11-18", direcao: "volta", quantidade: 2, tipo: "passagem" },
    { data: "2026-11-19", direcao: "ida", quantidade: 1, tipo: "passagem" },
    { data: "2026-11-20", direcao: "volta", quantidade: 1, tipo: "encomenda" },
  ]);
  assertEquals(pedidosSemReserva([], { hoje: "2026-11-18", horaAgora: "10:00", dias: 1 }), []);
});

Deno.test("#461 pedido encerrado: lotado, só consulta ou desistência depois do pedido", () => {
  const f = (quem: string, texto: string, min: number) => ({ quem, texto, em: new Date(Date.UTC(2026, 10, 18, 12, min)).toISOString() });
  assertEquals(pedidoEncerrado([f("cliente", "Tem vaga pra amanhã?", 0), f("equipe", "Não temos mais vaga", 5)]), "a equipe disse que não há vaga");
  assertEquals(pedidoEncerrado([f("cliente", "Ainda tem vaga amanhã a tarde?", 0), f("equipe", "Temos sim, qual o endereço?", 2), f("cliente", "Era só pra confirmar", 3)]), "o cliente disse que era só consulta ou desistiu");
  assertEquals(pedidoEncerrado([f("cliente", "Guarda uma vaga pra mim amanhã", 0), f("equipe", "Qual o endereço?", 1)]), null);
  // lotado ANTES de um pedido novo não encerra o pedido novo
  assertEquals(pedidoEncerrado([f("cliente", "tem vaga hoje?", 0), f("equipe", "Pra hoje não temos mais vaga", 1), f("cliente", "Então marca uma vaga pra amanhã", 2)]), null);
  assertEquals(pedidoEncerrado([]), null);
});

Deno.test("#461 nota e resumo: o que foi pedido, sem virar marca de Agendado", () => {
  const pedidos = [
    { data: "2026-11-19", direcao: "ida" as const, quantidade: 2, tipo: "passagem" },
    { data: "2026-11-21", direcao: "volta" as const, quantidade: 1, tipo: "passagem" },
    { data: "2026-11-18", direcao: "volta" as const, quantidade: 1, tipo: "encomenda" },
  ];
  assertEquals(resumoDosPedidos(pedidos, "2026-11-18"), "Ida de amanhã (19/11), 2 passagens; Volta de sábado (21/11); Encomenda de hoje (18/11)");
  const nota = notaDaSentinela(pedidos, "2026-11-18");
  assertStringIncludes(nota, "PEDIDO SEM RESERVA");
  assertEquals(ehMarcaDeAgendado(nota), false);
  assertEquals(/☑|✅/.test(nota), false);
});

Deno.test("#461 pedido sem dia: só pedido de reserva com todas as letras, depois do último Agendado", async () => {
  const { pedidoDeReservaSemDia } = await import("./sentinelaPura.ts");
  const f = (quem: string, texto: string, min: number) => ({ quem, texto, em: new Date(Date.UTC(2026, 10, 17, 13, min)).toISOString() });
  // caso real (fictício): a Ida foi agendada, a Volta pedida depois ficou no "Ok"
  assertEquals(
    pedidoDeReservaSemDia([f("cliente", "Tem passagem amanhã?", 0), f("equipe", "Agendado ☑️", 5), f("cliente", "Deixa agendada já a volta pra mim, na quarta pela manhã", 10), f("equipe", "Ok", 11)]),
    "Deixa agendada já a volta pra mim, na quarta pela manhã",
  );
  // pergunta não é pedido
  assertEquals(pedidoDeReservaSemDia([f("cliente", "Tem passagem para Pirapemas", 0), f("equipe", "Tem sim", 1)]), null);
  // o pedido de antes do Agendado já foi lançado
  assertEquals(pedidoDeReservaSemDia([f("cliente", "Quero uma passagem amanhã", 0), f("equipe", "Agendado ☑️", 1), f("cliente", "O número da casa é 10", 2)]), null);
  assertEquals(pedidoDeReservaSemDia([f("cliente", "marca uma vaga pra mim", 0)]), "marca uma vaga pra mim");
  const nota = notaDaSentinela([], "2026-11-18", "Deixa agendada já a volta pra mim");
  assertStringIncludes(nota, "o dia (ou o sentido) não ficou claro");
  assertEquals(ehMarcaDeAgendado(nota), false);
});

Deno.test("#467 sentinela: pergunta solta não é pedido; endereço ou pedido com todas as letras é", async () => {
  const { clienteConcretizou } = await import("./sentinelaPura.ts");
  const f = (quem: string, texto: string, min: number) => ({ quem, texto, em: new Date(Date.UTC(2026, 10, 18, 13, min)).toISOString() });
  // casos reais (fictícios) de 18/11: só perguntaram
  assertEquals(clienteConcretizou([f("cliente", "Bom dia,tem vaga pra Cantanhede amanhã,se tiver qual o valor e que horas sai?", 0), f("equipe", "Temos sim", 1), f("cliente", "Ta bom, obrigada", 2)]), false);
  assertEquals(clienteConcretizou([f("cliente", "Tem vaga amanhã pra São Luís??", 0), f("equipe", "Qual o endereço pra lhe buscar", 1), f("cliente", "Sou do interior, mas sai q horas pela manhã??", 2)]), false);
  // deu onde embarca
  assertEquals(clienteConcretizou([f("cliente", "Ainda tem vaga de Pirapemas pra São Luís?", 0), f("cliente", "Aqui na rua da torre, em frente ao primeiro quebra-mola", 1)]), true);
  // pediu com todas as letras
  assertEquals(clienteConcretizou([f("cliente", "Deixa agendada já a volta pra mim", 0)]), true);
  // a equipe marcou o Agendado e ele não lançou (a simulação achou a viagem sem reserva): é pedido
  assertEquals(clienteConcretizou([f("cliente", "Quero marcar uma passagem de São Luís a Pirapemas", 0), f("equipe", "Agendado ☑️", 1), f("cliente", "Amanhã", 2)]), true);
  assertEquals(clienteConcretizou([f("cliente", "Tem vaga amanhã?", 0), f("equipe", "Agendado ☑️", 1)]), true);
});

Deno.test("#472 endereço picado numa pergunta de preço não é pedido", async () => {
  const { clienteConcretizou } = await import("./sentinelaPura.ts");
  const f = (quem: string, texto: string, seg: number) => ({ quem, texto, em: new Date(Date.UTC(2026, 10, 19, 15, 0, seg)).toISOString() });
  // caso real (fictício): o cliente perguntou quanto custa deixar num endereço
  assertEquals(clienteConcretizou([f("cliente", "Quanto é pra me deixar nesse endereço", 0), f("cliente", "Rua das Flores - Pindaí", 5), f("cliente", "?", 9), f("equipe", "90 reais", 300)]), false);
  assertEquals(clienteConcretizou([f("cliente", "Rua das Flores, casa 3", 0), f("cliente", "?", 4)]), false);
  // endereço depois de "tem vaga? quanto é?" é pedido
  assertEquals(clienteConcretizou([f("cliente", "Tem vaga amanhã? quanto é?", 0), f("cliente", "Aqui na rua da torre, casa azul", 30)]), true);
  // a pergunta longe (mais de 2 min) não conta
  assertEquals(clienteConcretizou([f("cliente", "Rua das Flores, casa 3", 0), f("cliente", "?", 200)]), true);
});

Deno.test("#482 pedido novo depois do 'lotado' não é pedido encerrado", () => {
  const f = (quem: string, texto: string, min: number) => ({ quem, texto, em: new Date(Date.UTC(2026, 10, 22, 18, min)).toISOString() });
  // caso real (fictício): amanhã lotado; o cliente pede terça e a equipe diz "ok"
  const falas = [
    f("cliente", "[áudio: Marcar duas passagens pra Pirapemas pra amanhã.]", 0),
    f("equipe", "[áudio: Então, pra amanhã a gente não tem mais vaga, já tá lotado.]", 10),
    f("equipe", "[áudio: Tem vaga só na terça agora.]", 11),
    f("cliente", "[áudio: Pois terça-feira eu vou com vocês, já deixa minhas duas passagens agendadas aí, tá bom?]", 30),
    f("equipe", "Ok", 31),
  ];
  assertEquals(pedidoEncerrado(falas), null);
  // o lotado depois do pedido continua encerrando
  assertEquals(pedidoEncerrado(falas.slice(0, 2)), "a equipe disse que não há vaga");
});
