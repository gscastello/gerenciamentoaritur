import { assertEquals } from "jsr:@std/assert";
import {
  comoEnviar,
  itensValidos,
  modelosDosAvisos,
  modeloValido,
  primeiroNome,
  respostaDePresenca,
  textoDoModelo,
  tipoValido,
} from "./avisoPuro.ts";

const ID = "6027bbfc-fa07-47a1-9f2d-dbfd8d2f7419";
const AGORA = new Date("2026-11-15T21:00:00Z");
const item = { reservation_id: ID, texto: "Olá! Amanhã a Ida sai mais cedo.", nome: "maria da silva", dia: "segunda, 16/11", ponto: "Rodoviária", horario: "04:40" };
const modelo = { nome: "aviso_horario", idioma: "pt_BR", categoria: "UTILITY" };

Deno.test("#432 dentro das 24 h vai o texto livre; fora, o modelo; sem modelo ou conversa, marca", () => {
  assertEquals(comoEnviar({ temConversa: true, ultimaDoClienteEm: "2026-11-15T10:00:00Z", agora: AGORA, modelo: null, item }), { modo: "texto" });
  assertEquals(comoEnviar({ temConversa: true, ultimaDoClienteEm: "2026-11-13T10:00:00Z", agora: AGORA, modelo, item }), {
    modo: "modelo",
    corpo: { "1": "Maria", "2": "segunda, 16/11", "3": "Rodoviária", "4": "04:40" },
  });
  assertEquals(comoEnviar({ temConversa: true, ultimaDoClienteEm: "2026-11-13T10:00:00Z", agora: AGORA, modelo: null, item }), {
    modo: "nenhum",
    status: "fora_da_janela",
  });
  // nunca escreveu: fora da janela
  assertEquals(comoEnviar({ temConversa: true, ultimaDoClienteEm: null, agora: AGORA, modelo: null, item }).modo, "nenhum");
  // modelo sem horário não vai
  assertEquals(
    comoEnviar({ temConversa: true, ultimaDoClienteEm: null, agora: AGORA, modelo, item: { ...item, horario: null } }),
    { modo: "nenhum", status: "fora_da_janela" },
  );
  assertEquals(comoEnviar({ temConversa: false, ultimaDoClienteEm: null, agora: AGORA, modelo, item }), { modo: "nenhum", status: "sem_conversa" });
  // 23 h 50 min: já fora da folga
  assertEquals(comoEnviar({ temConversa: true, ultimaDoClienteEm: "2026-11-14T21:10:00Z", agora: AGORA, modelo: null, item }).modo, "nenhum");
});

Deno.test("#432 modelo, nome e texto do modelo", () => {
  assertEquals(modeloValido({ nome: "aviso_horario" }), { nome: "aviso_horario", idioma: "pt_BR", categoria: "UTILITY" });
  assertEquals(modeloValido({ nome: "Aviso Horário" }), null);
  assertEquals(modeloValido(null), null);
  assertEquals(primeiroNome("JOÃO pedro"), "João");
  assertEquals(primeiroNome(""), "passageiro(a)");
  assertEquals(primeiroNome("98999990000"), "passageiro(a)");
  // tratamento vai junto do nome; "Passageiro (…)" não é nome
  assertEquals(primeiroNome("Dona maria das Graças"), "Dona Maria");
  assertEquals(primeiroNome("Sr. Antônio"), "Sr. Antônio");
  assertEquals(primeiroNome("Dona"), "passageiro(a)");
  assertEquals(primeiroNome("Passageiro (lá Belle Maiobão)"), "passageiro(a)");
  assertEquals(
    textoDoModelo({ "1": "Maria", "2": "segunda, 16/11", "3": "Rodoviária", "4": "04:40" }),
    "Olá, Maria! Lembrete da sua viagem com a AriTur: segunda, 16/11, embarque em Rodoviária às 04:40. Qualquer dúvida, é só responder esta mensagem.",
  );
});

Deno.test("#432 itens do pedido: id válido, texto, sem repetir, até 80", () => {
  assertEquals(itensValidos(null), []);
  const r = itensValidos([item, { ...item }, { reservation_id: "x", texto: "Olá mundo" }, { reservation_id: ID.replace("6", "7"), texto: "oi" }]);
  assertEquals(r.length, 1);
  assertEquals(r[0].ponto, "Rodoviária");
  const muitos = Array.from({ length: 100 }, (_, i) => ({ reservation_id: `${String(i).padStart(8, "0")}-fa07-47a1-9f2d-dbfd8d2f7419`, texto: "Aviso de teste" }));
  assertEquals(itensValidos(muitos).length, 80);
});

Deno.test("#434 tipos: confirmação e em rota com os seus modelos (mensagens curtas)", () => {
  const fora = { temConversa: true, ultimaDoClienteEm: "2026-11-13T10:00:00Z", agora: AGORA };
  assertEquals(comoEnviar({ ...fora, modelo, item, tipo: "em_rota" }), { modo: "modelo", corpo: { "1": "Maria" } });
  assertEquals(comoEnviar({ ...fora, modelo: null, item, tipo: "em_rota" }).modo, "nenhum");
  assertEquals(comoEnviar({ ...fora, modelo, item: { ...item, dia: "amanhã" }, tipo: "confirmacao" }), {
    modo: "modelo",
    corpo: { "1": "Maria", "2": "amanhã" },
  });
  assertEquals(comoEnviar({ ...fora, modelo, item: { ...item, dia: null }, tipo: "confirmacao" }).modo, "nenhum");
  assertEquals(textoDoModelo({ "1": "Maria", "2": "amanhã" }, "confirmacao"), "Olá, Maria! Sua passagem com a AriTur está confirmada pra amanhã?");
  assertEquals(
    textoDoModelo({ "1": "Maria" }, "em_rota"),
    "Olá, Maria! Já estamos em rota buscando os passageiros, aguarde no seu local de embarque que chegaremos em breve.",
  );
  assertEquals(tipoValido("em_rota"), "em_rota");
  assertEquals(tipoValido("qualquer"), "horario");
  const m = modelosDosAvisos({ confirmacao: { nome: "confirmar_viagem" } }, { nome: "aviso_horario" });
  assertEquals([m.horario?.nome, m.confirmacao?.nome, m.em_rota], ["aviso_horario", "confirmar_viagem", null]);
  assertEquals(modelosDosAvisos(null, null).horario, null);
});

Deno.test("#434 resposta ao 'você confirma a viagem?': só sim/não claros", () => {
  for (const t of ["SIM", "sim, confirmo", "Confirmado!", "ok", "vou sim", "Sim \u{1F44D}", "pode confirmar", "estarei lá"]) {
    assertEquals(respostaDePresenca(t), "sim", t);
  }
  for (const t of ["NÃO", "nao vou mais", "Não vou poder, desmarca por favor", "desisti", "cancela", "n"]) {
    assertEquals(respostaDePresenca(t), "nao", t);
  }
  for (const t of ["que horas vocês passam?", "", "oi", "talvez", "bom dia", "sim, mas não sei se vou"]) {
    assertEquals(respostaDePresenca(t), null, t);
  }
  assertEquals(respostaDePresenca("sim, não precisa trocar nada"), "sim");
  assertEquals(
    respostaDePresenca("Sim mas queria saber se posso levar uma mala grande e se tem lugar na frente pra minha mãe"),
    null,
  );
});
