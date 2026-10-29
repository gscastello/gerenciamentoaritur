import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  blocoDeLicoes,
  blocoDoCliente,
  conteudoAtualizadoValido,
  deveAprender,
  mascararDados,
  montarTranscricoes,
  normalizarTitulo,
  pontuacaoDaLicao,
  statusInicial,
  validarLicoesNovas,
  validarNotasDeClientes,
  type LicaoGuardada,
  type Observacao,
} from "./aprendizado.ts";

Deno.test("mascara telefone, e-mail e link", () => {
  assertEquals(mascararDados("me liga 98 99999-8888 ok"), "me liga [telefone] ok");
  assertEquals(mascararDados("+55 (98) 98101-2388"), "[telefone]");
  assertEquals(mascararDados("maria@exemplo.com.br"), "[email]");
  assertEquals(mascararDados("veja https://site.com/x?y=1 agora"), "veja [link] agora");
});

Deno.test("não mascara números curtos (quantidade, hora, valor)", () => {
  assertEquals(mascararDados("2 passagens às 6h por R$ 80,00"), "2 passagens às 6h por R$ 80,00");
});

const obs = (conv: number, author: Observacao["author"], content: string, t: string): Observacao => ({
  chatwoot_conversation_id: conv,
  author,
  content,
  created_at: t,
});

Deno.test("transcrição agrupa por conversa, ordena no tempo e rotula quem falou", () => {
  const t = montarTranscricoes([
    obs(1, "equipe", "Qual o endereço?", "2026-10-28T10:01:00Z"),
    obs(1, "cliente", "quero ir amanhã, 98999998888", "2026-10-28T10:00:00Z"),
    obs(2, "cliente", "bom dia", "2026-10-28T09:00:00Z"),
    obs(1, "bot_rascunho", "Qual o endereço de embarque?", "2026-10-28T10:01:30Z"),
  ]);
  assertEquals(t.length, 2);
  const c1 = t.find((x) => x.conversa === 1)!;
  assertEquals(c1.texto.split("\n"), [
    "CLIENTE: quero ir amanhã, [telefone]",
    "ATENDENTE: Qual o endereço?",
    "BOT (rascunho, não enviado): Qual o endereço de embarque?",
  ]);
});

Deno.test("transcrição respeita o limite de tamanho e de conversas", () => {
  const muitas = Array.from({ length: 5 }, (_, i) => obs(i + 1, "cliente", "oi", `2026-10-28T10:0${i}:00Z`));
  assertEquals(montarTranscricoes(muitas, { maxConversas: 3 }).length, 3);
  const longa = [obs(1, "cliente", "a".repeat(300), "2026-10-28T10:00:00Z"), obs(1, "cliente", "b".repeat(300), "2026-10-28T10:01:00Z")];
  const [c] = montarTranscricoes(longa, { maxCharsPorConversa: 400 });
  assertEquals(c.texto.includes("bbb"), false);
});

Deno.test("fato e negócio nascem proposta; situação com número também; o resto nasce ativa", () => {
  assertEquals(statusInicial("fato"), "proposta");
  assertEquals(statusInicial("negocio"), "proposta");
  assertEquals(statusInicial("situacao", "Se pedem desconto, o atendente diz que não há."), "ativa");
  assertEquals(statusInicial("situacao", "Se pedem desconto, o atendente faz por R$ 10."), "proposta");
  assertEquals(statusInicial("linguagem_cliente"), "ativa");
  assertEquals(statusInicial("estilo_atendente"), "ativa");
  assertEquals(statusInicial("fluxo_agendamento"), "ativa");
});

Deno.test("normaliza título (acentos, caixa, pontuação)", () => {
  assertEquals(normalizarTitulo("  Pedido de 'Retorno'!  "), "pedido de retorno");
  assertEquals(normalizarTitulo("Endereço"), "endereco");
});

Deno.test("valida lições: tipo, tamanhos, dado pessoal e repetidas", () => {
  const ok = { kind: "linguagem_cliente", title: "Pedem 'pra amanhã cedo'", content: "Dizem 'pra amanhã cedo' querendo a viagem do dia seguinte de manhã." };
  const r = validarLicoesNovas(
    [
      ok,
      { ...ok }, // repetida no lote
      { kind: "inventado", title: "Tipo ruim", content: "conteúdo suficientemente longo" },
      { kind: "fato", title: "Curto", content: "x" },
      { kind: "fato", title: "Tem telefone", content: "Ligue para 98 99999-8888 para combinar." },
      { kind: "fato", title: "Tem marca", content: "Falar com [telefone] da central de vendas." },
      { kind: "estilo_atendente", title: "Já existia", content: "Cumprimenta com bom dia e pergunta o destino." },
    ],
    [{ kind: "estilo_atendente", title: "já existia" }],
  );
  assertEquals(r.length, 1);
  assertEquals(r[0].title, "Pedem 'pra amanhã cedo'");
});

Deno.test("entrada que não é lista vira lista vazia", () => {
  assertEquals(validarLicoesNovas(undefined), []);
  assertEquals(validarLicoesNovas("x"), []);
});

Deno.test("atualização válida precisa de texto no tamanho e sem dado pessoal", () => {
  assertEquals(conteudoAtualizadoValido("  Texto novo com tamanho bom.  "), "Texto novo com tamanho bom.");
  assertEquals(conteudoAtualizadoValido("curto"), null);
  assertEquals(conteudoAtualizadoValido("Ligue 98 99999-8888 agora mesmo ok"), null);
  assertEquals(conteudoAtualizadoValido(undefined), null);
});

Deno.test("bloco do prompt: tipos pedidos, mais vistas primeiro, com limite", () => {
  const licoes: LicaoGuardada[] = [
    { id: "1", kind: "linguagem_cliente", title: "Rara", content: "Aparece pouco nas conversas.", evidence_count: 1 },
    { id: "2", kind: "linguagem_cliente", title: "Comum", content: "Aparece muito nas conversas.", evidence_count: 9 },
    { id: "3", kind: "estilo_atendente", title: "Tom", content: "Cumprimenta e pergunta o destino.", evidence_count: 4 },
  ];
  const bloco = blocoDeLicoes(licoes, ["linguagem_cliente"]);
  assertStringIncludes(bloco, "COMO OS CLIENTES COSTUMAM ESCREVER:");
  assertEquals(bloco.indexOf("Comum") < bloco.indexOf("Rara"), true);
  assertEquals(bloco.includes("Tom"), false);
  assertEquals(blocoDeLicoes(licoes, ["fato"]), "");
  assertEquals(blocoDeLicoes(licoes, ["linguagem_cliente"], { maxChars: 40 }).includes("Rara"), false);
});

Deno.test("bloco do prompt traz negócio e situação com os títulos certos", () => {
  const licoes: LicaoGuardada[] = [
    { id: "1", kind: "negocio", title: "Busca em casa", content: "A van passa nas casas antes de seguir viagem.", evidence_count: 2 },
    { id: "2", kind: "situacao", title: "Pedem desconto", content: "O atendente explica que o valor é fixo.", evidence_count: 3 },
  ];
  assertStringIncludes(blocoDeLicoes(licoes, ["negocio"]), "COMO A EMPRESA FUNCIONA (aprovado pelo dono):");
  assertStringIncludes(blocoDeLicoes(licoes, ["situacao"]), "O QUE RESPONDER EM CADA SITUAÇÃO");
});

Deno.test("anotações de clientes: só de conversas conhecidas, sem dado pessoal, uma por cliente", () => {
  const mapa = new Map([
    [1, "cli-a"],
    [2, "cli-b"],
  ]);
  const r = validarNotasDeClientes(
    [
      { conversa: 1, resumo: "Costuma embarcar na Rodoviária, às sextas, com duas pessoas." },
      { conversa: 1, resumo: "Outra anotação repetida para o mesmo cliente." },
      { conversa: 2, resumo: "Liga no 98 99999-8888 sempre que atrasa." },
      { conversa: 9, resumo: "Conversa que não existe no lote lido." },
      { conversa: 2, resumo: "curta" },
    ],
    mapa,
  );
  assertEquals(r, [{ customerId: "cli-a", notes: "Costuma embarcar na Rodoviária, às sextas, com duas pessoas." }]);
  assertEquals(validarNotasDeClientes("nada", mapa), []);
});

Deno.test("bloco do cliente: vazio sem anotação, com aviso de confirmar quando há", () => {
  assertEquals(blocoDoCliente(null), "");
  assertEquals(blocoDoCliente("   "), "");
  assertStringIncludes(blocoDoCliente("Costuma ir na Rodoviária."), "nunca presuma");
});

Deno.test("aprende com bastante material, ou com pouco material esperando há mais de um dia", () => {
  const agora = new Date("2026-10-30T12:00:00Z");
  assertEquals(deveAprender({ pendentes: 25, maisAntigaEm: "2026-10-30T11:00:00Z", agora }), true);
  assertEquals(deveAprender({ pendentes: 5, maisAntigaEm: "2026-10-30T08:00:00Z", agora }), false);
  assertEquals(deveAprender({ pendentes: 5, maisAntigaEm: "2026-10-29T11:59:00Z", agora }), true);
  assertEquals(deveAprender({ pendentes: 0, maisAntigaEm: null, agora }), false);
  assertEquals(deveAprender({ pendentes: 3, maisAntigaEm: null, agora }), false);
});

Deno.test("lição nova e recente não fica de fora do prompt só por ter pouca evidência", () => {
  const agora = new Date("2026-10-30T12:00:00Z");
  const velha: LicaoGuardada = { id: "1", kind: "situacao", title: "Antiga", content: "Já era assim há muito tempo.", evidence_count: 4, last_seen_at: "2026-05-01T00:00:00Z" };
  const nova: LicaoGuardada = { id: "2", kind: "situacao", title: "Nova", content: "Começou a aparecer esta semana.", evidence_count: 2, last_seen_at: "2026-10-29T00:00:00Z" };
  assertEquals(pontuacaoDaLicao(nova, agora) > pontuacaoDaLicao(velha, agora), true);
  assertEquals(pontuacaoDaLicao({ ...velha, last_seen_at: undefined }, agora), 4);
  const bloco = blocoDeLicoes([velha, nova], ["situacao"], { max: 1 });
  assertStringIncludes(bloco, "Nova");
  assertEquals(bloco.includes("Antiga"), false);
});
