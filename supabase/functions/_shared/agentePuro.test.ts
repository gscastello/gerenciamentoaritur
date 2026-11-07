import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  afirmaTerMexidoEmReserva,
  bairroDaTabela,
  trechoDoPedido,
  recadosDaViagem,
  calcularTotal,
  calendarioParaOPrompt,
  contemDadoInterno,
  converterMensagensDoChatwoot,
  areaDoDesembarque,
  blocosDoSistema,
  converterObservacoes,
  costumeParaFerramenta,
  nomeDeveSerCompletado,
  numerosPorExtenso,
  problemasDaResposta,
  somarUso,
  USO_ZERADO,
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
    { data: "2026-11-01", direcao: "meio", ponto: "", quantidade: 0, desembarque: "", forma_pagamento: "cheque" },
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

Deno.test("números por extenso viram dígitos para a trava de números", () => {
  assertEquals(numerosPorExtenso("quero duas passagens pra amanhã"), "2");
  assertEquals(numerosPorExtenso("Três pessoas e uma criança"), "3 1");
  assertEquals(numerosPorExtenso("bom dia"), "");
  // "uma" como artigo também entra: só afrouxa o número 1, nunca valores nem horários
  assertEquals(numerosPorExtenso("tem uma vaga?"), "1");
});

Deno.test("plano B: observações do banco viram conversa (rascunho conta como fala do bot)", () => {
  const r = converterObservacoes([
    { author: "bot_rascunho", content: "Tem sim!", created_at: "2026-11-03T12:01:00Z", chatwoot_message_id: null },
    { author: "cliente", content: "tem vaga?", created_at: "2026-11-03T12:00:00Z", chatwoot_message_id: 7 },
    { author: "equipe", content: "   ", created_at: "2026-11-03T12:02:00Z", chatwoot_message_id: 8 },
    { author: "equipe", content: "já vejo", created_at: "2026-11-03T12:03:00Z", chatwoot_message_id: 9 },
  ]);
  assertEquals(r.map((x) => x.quem), ["cliente", "bot", "equipe"]);
  assertEquals(r[0].id, 7);
});

// Cenário real: o app diz que há 5 vagas na Ida de amanhã e a Rodoviária sai às 05:40 por R$ 60.
const FONTES = [
  "PONTOS: Ida: Rodoviária às 05:40, R$ 60,00 por passagem",
  '{"ok":true,"data":"2026-11-04","direcao":"ida","capacidade":31,"vagas_disponiveis":5,"status_da_viagem":"ainda nao iniciada"}',
  "quero duas passagens amanhã",
  numerosPorExtenso("quero duas passagens amanhã"),
  '{"ok":true,"preco_por_passagem":60,"quantidade":2,"total":120}',
];
const LIVRE = { mexeuEmReserva: false, consultouReservas: false };

Deno.test("trava: resposta com números das ferramentas passa (vaga, horário, total, 'duas' → 2)", () => {
  assertEquals(
    problemasDaResposta("Amanhã na Ida tem 5 vagas! Saímos da Rodoviária às 5h40 e as 2 passagens dão R$ 120.", FONTES, LIVRE),
    [],
  );
  assertEquals(problemasDaResposta("Tem vaga sim, 5 disponíveis. Quer que eu reserve?", FONTES, LIVRE), []);
});

Deno.test("trava: vaga, valor ou horário inventados são barrados", () => {
  const vaga = problemasDaResposta("Tem 8 vagas amanhã.", FONTES, LIVRE);
  assertEquals(vaga.length, 1);
  assertStringIncludes(vaga[0], "8");
  assertEquals(problemasDaResposta("A passagem custa R$ 70.", FONTES, LIVRE).length, 1);
  assertEquals(problemasDaResposta("Saímos às 7h30.", FONTES, LIVRE).length, 1);
});

Deno.test("trava: 'reserva confirmada' sem ferramenta que deu certo é barrado; com ela passa", () => {
  const txt = "Pronto! Sua reserva está confirmada para amanhã.";
  assertEquals(problemasDaResposta(txt, FONTES, LIVRE).length, 1);
  assertEquals(problemasDaResposta(txt, FONTES, { mexeuEmReserva: true, consultouReservas: false }), []);
  // descrever uma reserva que já existe (depois de ver_minhas_reservas) também é válido
  assertEquals(problemasDaResposta(txt, FONTES, { mexeuEmReserva: false, consultouReservas: true }), []);
  // perguntar/oferecer não é afirmar
  assertEquals(problemasDaResposta("Posso confirmar a reserva se você disser sim.", FONTES, LIVRE), []);
});

Deno.test("trava: identificador interno e resposta longa demais", () => {
  assertEquals(problemasDaResposta("Sua reserva 3f2b8c1e-1a2b-4c3d-9e8f-0a1b2c3d4e5f", FONTES, LIVRE).length >= 1, true);
  assertEquals(problemasDaResposta("a".repeat(1600), FONTES, LIVRE).length, 1);
});

const AREAS_VOLTA = [
  { code: "bacabeira", label: "Bacabeira" },
  { code: "br", label: "BR (ponto de referência)" },
  { code: "casa", label: "Em casa (bairro)" },
  { code: "matoes", label: "Matões do Norte" },
  { code: "retorno", label: "Retorno" },
  { code: "rodoviaria", label: "Rodoviária" },
  { code: "santa_rita", label: "Santa Rita" },
];

Deno.test("desembarque: o que o cliente escreveu vira o local cadastrado", () => {
  assertEquals(areaDoDesembarque("Retorno do Aeroporto", AREAS_VOLTA), "retorno");
  assertEquals(areaDoDesembarque("na rodoviária de são luís", AREAS_VOLTA), "rodoviaria");
  assertEquals(areaDoDesembarque("Matões", AREAS_VOLTA), "matoes");
  assertEquals(areaDoDesembarque("Santa Rita", AREAS_VOLTA), "santa_rita");
  assertEquals(areaDoDesembarque("vou ficar em casa mesmo", AREAS_VOLTA), "casa");
});

Deno.test("desembarque: só palavra inteira e sem correspondência não inventa local", () => {
  assertEquals(areaDoDesembarque("Brasília", AREAS_VOLTA), null); // "br" dentro de outra palavra não conta
  assertEquals(areaDoDesembarque("Rua dos Pinheiros, 12", AREAS_VOLTA), null);
  assertEquals(areaDoDesembarque("", AREAS_VOLTA), null);
  assertEquals(areaDoDesembarque("BR 135", AREAS_VOLTA), "br");
});

Deno.test("nome completo completa o cadastro sem trocar um nome por outro", () => {
  assertEquals(nomeDeveSerCompletado("Cândido", "Amparo Rocha Cândido"), true);
  assertEquals(nomeDeveSerCompletado("Passageiro (calhau)", "Tayara Abreu Lima"), true);
  assertEquals(nomeDeveSerCompletado(null, "Ana Lima"), true);
  assertEquals(nomeDeveSerCompletado("Maria Silva", "Maria Silva"), false);
  assertEquals(nomeDeveSerCompletado("Maria Silva", "Joana Souza"), false);
  assertEquals(nomeDeveSerCompletado("Maria", "Maria Silva Santos"), true);
  assertEquals(nomeDeveSerCompletado("Ana", "Ana"), false);
  assertEquals(nomeDeveSerCompletado("Maria Silva", "Maria"), false); // novo precisa ser nome completo
});

Deno.test("costume: devolve por sentido o local de costume, sem nenhum valor", () => {
  const r = costumeParaFerramenta({
    sentido_sugerido: "volta",
    ida: {
      fonte: "historico",
      vezes: 4,
      route_point_code: "busca",
      route_point_name: "Buscar em Casa",
      neighborhood: "Prime Calhau",
      detail: "Quadra 3",
      dropoff_location: "Pirapemas",
    },
    volta: { fonte: "manual", route_point_code: "cantanhede", route_point_name: "Cantanhede", detail: "Rua do Sol" },
  });
  assertEquals(r.tem_endereco_de_costume, true);
  assertEquals(r.sentido_provavel, "volta");
  assertEquals(r.ida?.origem, "visto 4 vezes no histórico");
  assertEquals(r.ida?.codigo_do_ponto, "busca");
  assertEquals(r.ida?.bairro, "Prime Calhau");
  assertEquals(r.ida?.endereco_de_embarque, "Quadra 3");
  assertEquals(r.ida?.desembarque, "Pirapemas");
  assertEquals(r.volta?.origem, "fixado pela equipe");
  assertEquals(r.volta?.bairro, null);
  assertEquals(r.volta?.desembarque, null);
  // o resultado vira fonte da trava de números: não pode carregar preço
  assertEquals(/preco|valor|total/i.test(JSON.stringify(r)), false);
});

Deno.test("costume: uma viagem só vira 'última viagem'; sem costume avisa que não há", () => {
  const um = costumeParaFerramenta({
    ida: { fonte: "historico", vezes: 1, route_point_code: "rodoviaria" },
    volta: null,
  });
  assertEquals(um.ida?.origem, "última viagem do cliente");
  assertEquals(um.ida?.ponto, "rodoviaria");
  assertEquals(um.volta, null);
  assertEquals(um.sentido_provavel, null);

  const nada = costumeParaFerramenta({ ida: null, volta: null, sentido_sugerido: "sabado" });
  assertEquals(nada.tem_endereco_de_costume, false);
  assertEquals(nada.sentido_provavel, null);
  assertEquals(costumeParaFerramenta({}).tem_endereco_de_costume, false);
});

Deno.test("cache: o que varia fica depois do ponto de cache", () => {
  const blocos = blocosDoSistema(["REGRAS", "", "FATOS"], ["Agora são 14:32", "", "CLIENTE: Ana"]);
  assertEquals(blocos, [
    { type: "text", text: "REGRAS\n\nFATOS", cache_control: { type: "ephemeral" } },
    { type: "text", text: "Agora são 14:32\n\nCLIENTE: Ana" },
  ]);
});

Deno.test("cache: o bloco estável é idêntico para qualquer horário e cliente", () => {
  const manha = blocosDoSistema(["REGRAS"], ["Agora são 08:00", "CLIENTE: Ana"]);
  const tarde = blocosDoSistema(["REGRAS"], ["Agora são 17:45", "CLIENTE: João"]);
  assertEquals(manha[0], tarde[0]);
});

Deno.test("cache: sem conteúdo variável não manda bloco vazio (a API recusaria)", () => {
  assertEquals(blocosDoSistema(["REGRAS"], ["", ""]).length, 1);
});

Deno.test("uso: soma cada tipo de token e aguenta campos ausentes", () => {
  const um = somarUso(USO_ZERADO, {
    input_tokens: 100,
    output_tokens: 20,
    cache_creation_input_tokens: 11000,
    cache_read_input_tokens: 0,
  });
  const dois = somarUso(um, { input_tokens: 50, output_tokens: 5, cache_read_input_tokens: 11000 });
  assertEquals(dois, { entrada: 150, saida: 25, cacheEscrita: 11000, cacheLeitura: 11000 });
  assertEquals(somarUso(dois, undefined), dois);
  assertEquals(somarUso(dois, null), dois);
  assertEquals(USO_ZERADO, { entrada: 0, saida: 0, cacheEscrita: 0, cacheLeitura: 0 });
});

Deno.test("pedido: aceita dinheiro, pix e cartão; outra forma volta como erro", () => {
  const pedido = {
    data: "2026-11-10",
    direcao: "ida",
    ponto: "rodoviaria",
    quantidade: 1,
    desembarque: "Pirapemas",
    cliente_confirmou: true,
  };
  for (const forma of ["dinheiro", "pix", "cartao"] as const) {
    const r = validarPedidoDeReserva({ ...pedido, forma_pagamento: forma }, "2026-11-07");
    assertEquals(r.ok && r.pedido.formaPagamento, forma);
  }
  const ruim = validarPedidoDeReserva({ ...pedido, forma_pagamento: "cheque" }, "2026-11-07");
  assertEquals(ruim.ok ? [] : ruim.erros, ["forma_pagamento deve ser dinheiro, pix ou cartao"]);
});

const TRECHOS = [
  { origem: "Pirapemas", destino: "Miranda", price: 30 },
  { origem: "Vila Embratel", destino: "Matões do Norte", price: 70 },
  { origem: "Pirapemas", destino: "Jordoa", price: 80 },
];

Deno.test("trecho: compara onde sobe e onde desce, nos dois sentidos", () => {
  assertEquals(trechoDoPedido(["Pirapemas"], "Miranda do Norte", TRECHOS)?.price, 30);
  assertEquals(trechoDoPedido(["Miranda", null], "desço em Pirapemas", TRECHOS)?.price, 30);
  assertEquals(trechoDoPedido(["Buscar em Casa", "Vila Embratel"], "Matões", TRECHOS)?.price, 70);
  assertEquals(trechoDoPedido(["Pirapemas"], "Jordoa, Rua 7", TRECHOS)?.price, 80);
});

Deno.test("trecho: sem os dois lados na tabela, não há trecho", () => {
  assertEquals(trechoDoPedido(["Cantanhede"], "Miranda", TRECHOS), null);
  assertEquals(trechoDoPedido(["Pirapemas"], "Cohama", TRECHOS), null);
  assertEquals(trechoDoPedido(["Pirapemas"], null, TRECHOS), null);
  assertEquals(trechoDoPedido([], "Miranda", TRECHOS), null);
  assertEquals(trechoDoPedido(["Pirapemas"], "Mira", TRECHOS), null);
});

Deno.test("trecho: palavra solta não vale, e o mais específico vence", () => {
  assertEquals(trechoDoPedido(["Pirapemas"], "Mirandinha", TRECHOS), null);
  const t = [
    { origem: "Pirapemas", destino: "Vila", price: 10 },
    { origem: "Pirapemas", destino: "Vila Nova", price: 20 },
  ];
  assertEquals(trechoDoPedido(["Pirapemas"], "Vila Nova", t)?.price, 20);
});

Deno.test("bairro da tabela: acha pelo nome dentro do texto; o mais longo vence", () => {
  const tabela = [
    { neighborhood: "Anil", price: 80 },
    { neighborhood: "Cruzeiro do Anil", price: 85 },
    { neighborhood: "Cohatrac", price: 80 },
  ];
  assertEquals(bairroDaTabela("Cohatrac Condomínio Mazil", tabela)?.neighborhood, "Cohatrac");
  assertEquals(bairroDaTabela("cruzeiro do anil", tabela)?.price, 85);
  assertEquals(bairroDaTabela("Maiobão", tabela), null);
  assertEquals(bairroDaTabela("Coroadinho", [{ neighborhood: "Coroado" }]), null);
  assertEquals(bairroDaTabela(null, tabela), null);
Deno.test("recados da viagem: só o que a equipe disse sobre a viagem, nas últimas horas", () => {
  const agora = new Date("2026-11-07T17:00:00Z"); // 14:00 em São Luís
  const obs = (author: string, content: string, created_at: string) => ({ author, content, created_at });
  const r = recadosDaViagem(
    [
      obs("equipe", "Estou passando em Miranda", "2026-11-07T16:40:00Z"),
      obs("equipe", "Chegando   em Cantanhede", "2026-11-07T16:55:00Z"),
      obs("equipe", "Saindo da onde?", "2026-11-07T16:56:00Z"),
      obs("equipe", "Ok, reservado", "2026-11-07T16:57:00Z"),
      obs("cliente", "Estou chegando", "2026-11-07T16:58:00Z"),
      obs("bot", "A van está a caminho", "2026-11-07T16:58:00Z"),
      obs("bot_rascunho", "Estamos em rota", "2026-11-07T16:58:00Z"),
      obs("equipe", "Saímos cedo", "2026-11-07T10:59:00Z"),
      obs("equipe", "Estamos em rota", "2026-11-07T17:30:00Z"),
    ],
    agora,
  );
  assertEquals(r, [
    { hora: "13:55", ha_minutos: 5, disse: "Chegando em Cantanhede" },
    { hora: "13:40", ha_minutos: 20, disse: "Estou passando em Miranda" },
  ]);
});

Deno.test("recados da viagem: entende as frases reais da equipe, com ou sem acento", () => {
  const agora = new Date("2026-11-07T17:00:00Z");
  const frases = [
    "Bom dia já saímos",
    "Estamos saindo de são Luís",
    "Está a caminho",
    "Estamos em rota",
    "Passando",
    "A primeira plataforma ao lado do café",
    "Estou chegando",
    "Teve trânsito, atrasado um pouco",
  ];
  const r = recadosDaViagem(
    frases.map((content, i) => ({
      author: "equipe",
      content,
      created_at: new Date(agora.getTime() - (i + 1) * 60000).toISOString(),
    })),
    agora,
  );
  assertEquals(r.map((x) => x.disse), frases);
});

Deno.test("recados da viagem: sem repetir, sem telefone, com limite de quantidade e tamanho", () => {
  const agora = new Date("2026-11-07T17:00:00Z");
  const em = (min: number) => new Date(agora.getTime() - min * 60000).toISOString();
  const r = recadosDaViagem(
    [
      { author: "equipe", content: "A caminho", created_at: em(1) },
      { author: "equipe", content: "a caminho", created_at: em(2) },
      { author: "equipe", content: "Chegando, me liga 98 98101-2388", created_at: em(3) },
      { author: "equipe", content: `Passando ${"x".repeat(50)}`, created_at: em(4) },
    ],
    agora,
    { max: 3, maxChars: 20 },
  );
  assertEquals(r.map((x) => x.disse), ["A caminho", "Chegando, me liga [t", "Passando xxxxxxxxxxx"]);
});

Deno.test("recados da viagem: janela em horas é configurável; data inválida fica de fora", () => {
  const agora = new Date("2026-11-07T17:00:00Z");
  const o = [
    { author: "equipe", content: "Passando", created_at: "2026-11-07T15:30:00Z" },
    { author: "equipe", content: "A caminho", created_at: "nada" },
  ];
  assertEquals(recadosDaViagem(o, agora, { horas: 1 }), []);
  assertEquals(recadosDaViagem(o, agora, { horas: 2 }).length, 1);
});
