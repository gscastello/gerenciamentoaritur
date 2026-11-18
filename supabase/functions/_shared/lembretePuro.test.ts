import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  configDoLembrete,
  janelaDoLembrete,
  lembretesDevidos,
  noSilencio,
  type ReservaDoLembrete,
  textoDoLembrete,
  variaveisDoModelo,
} from "./lembretePuro.ts";

// Issue #458: lembrete da viagem (dados fictícios). 18/11/2026 é quarta; 23/11 é segunda.
const cfg = configDoLembrete({ ativo: true, ida_hora: "19:00", volta_antes_min: 60 });
const sl = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`);

const base: ReservaDoLembrete = {
  id: "r-ida",
  data: "2026-11-18",
  direcao: "ida",
  status: "confirmada",
  tipo: "passagem",
  criadaEm: "2026-11-16T12:00:00Z",
  peloAgendado: false,
  pontoCodigo: "busca",
  pontoNome: "Buscar em Casa",
  pontoHora: "05:00:00",
  nome: "Maria Teste",
  bairro: "Turu",
  endereco: "Rua das Flores, 10",
  quantidade: 1,
};
const volta: ReservaDoLembrete = {
  ...base,
  id: "r-volta",
  direcao: "volta",
  pontoCodigo: "cantanhede",
  pontoNome: "Cantanhede",
  pontoHora: "13:00:00",
  bairro: null,
  endereco: "Rua do Teste",
};

Deno.test("#458 config: padrão no que falta ou está errado; desligado por padrão", () => {
  assertEquals(configDoLembrete(null).ativo, false);
  const c = configDoLembrete({ ativo: true, ida_hora: "25:00", volta_antes_min: 5, silencio: { de: "x" } });
  assertEquals([c.ida_hora, c.volta_antes_min, c.silencio.de, c.silencio.ate], ["19:00", 60, "22:00", "06:00"]);
  assertEquals(configDoLembrete({ ida_hora: "20:30", volta_antes_min: 90 }).ida_hora, "20:30");
});

Deno.test("#458 janela: Ida na noite anterior; Volta 1 h antes do ponto; segunda a Ida sai 1 h mais cedo", () => {
  const ida = janelaDoLembrete(base, cfg, null)!;
  assertEquals([ida.desde, ida.ate, ida.horario], [sl("2026-11-17", "19:00").getTime(), sl("2026-11-18", "05:00").getTime(), "05:00"]);
  const v = janelaDoLembrete(volta, cfg, null)!;
  assertEquals([v.desde, v.ate], [sl("2026-11-18", "12:00").getTime(), sl("2026-11-18", "13:00").getTime()]);
  assertEquals(janelaDoLembrete({ ...base, data: "2026-11-23" }, cfg, { active: true, hours: 1 })!.horario, "04:00");
  assertEquals(janelaDoLembrete({ ...base, pontoHora: null }, cfg, null), null);
});

Deno.test("#458 devidos: na hora, uma vez, e quem agendou depois também recebe", () => {
  const todas = [base, volta];
  // antes das 19h da véspera: nada
  assertEquals(lembretesDevidos(todas, new Set(), sl("2026-11-17", "18:55"), cfg, null).length, 0);
  // 19h da véspera: só a Ida
  assertEquals(lembretesDevidos(todas, new Set(), sl("2026-11-17", "19:00"), cfg, null).map((x) => x.reserva.id), ["r-ida"]);
  // já avisada: não repete
  assertEquals(lembretesDevidos(todas, new Set(["r-ida"]), sl("2026-11-17", "19:05"), cfg, null).length, 0);
  // agendou às 21h (depois do envio das 19h), pelo app: recebe na rodada seguinte
  const tarde = { ...base, id: "r-tarde", criadaEm: sl("2026-11-17", "21:00").toISOString() };
  assertEquals(lembretesDevidos([tarde], new Set(), sl("2026-11-17", "21:05"), cfg, null).map((x) => x.reserva.id), ["r-tarde"]);
  // ...mas lançada pelo Agendado depois das 19h: a confirmação já valeu como lembrete
  assertEquals(lembretesDevidos([{ ...tarde, peloAgendado: true }], new Set(), sl("2026-11-17", "21:05"), cfg, null).length, 0);
  // Agendado ANTES das 19h recebe normalmente
  assertEquals(lembretesDevidos([{ ...base, peloAgendado: true }], new Set(), sl("2026-11-17", "19:00"), cfg, null).length, 1);
  // Volta: 12h05 recebe; 13h (o ponto) já passou
  assertEquals(lembretesDevidos([volta], new Set(), sl("2026-11-18", "12:05"), cfg, null).length, 1);
  assertEquals(lembretesDevidos([volta], new Set(), sl("2026-11-18", "13:00"), cfg, null).length, 0);
});

Deno.test("#458 devidos: silêncio, desligado, cancelada e encomenda", () => {
  // 23h (silêncio): espera; às 05h a Ida já está saindo → não manda de madrugada
  assertEquals(lembretesDevidos([base], new Set(), sl("2026-11-17", "23:00"), cfg, null).length, 0);
  assertEquals(lembretesDevidos([base], new Set(), sl("2026-11-17", "19:00"), { ...cfg, ativo: false }, null).length, 0);
  assertEquals(lembretesDevidos([{ ...base, status: "cancelada" }], new Set(), sl("2026-11-17", "19:00"), cfg, null).length, 0);
  assertEquals(lembretesDevidos([{ ...base, tipo: "encomenda" }], new Set(), sl("2026-11-17", "19:00"), cfg, null).length, 0);
  assert(noSilencio("23:59", cfg.silencio) && noSilencio("05:59", cfg.silencio) && !noSilencio("06:00", cfg.silencio));
  assert(noSilencio("13:00", { de: "12:00", ate: "14:00" }) && !noSilencio("15:00", { de: "12:00", ate: "14:00" }));
});

Deno.test("#458 texto: dia, sentido, onde embarca, horário e quantidade; nunca valor", () => {
  const t = textoDoLembrete({ ...base, quantidade: 2 }, "05:00", "2026-11-17");
  assertEquals(
    t,
    "Olá, Maria! Lembrete da sua viagem com a AriTur: Ida de amanhã, quarta (18/11) (2 passagens), embarque em casa (Turu, Rua das Flores, 10) a partir das 05:00. Está tudo certo? Se algo estiver diferente, é só responder aqui.",
  );
  assertStringIncludes(textoDoLembrete(volta, "13:00", "2026-11-18"), "Volta de hoje, quarta (18/11), embarque em Cantanhede (Rua do Teste) a partir das 13:00");
  const rod = { ...base, pontoCodigo: "rodoviaria", pontoNome: "Rodoviária", nome: null };
  assertStringIncludes(textoDoLembrete(rod, "05:40", "2026-11-17"), "Olá! Lembrete");
  assertStringIncludes(textoDoLembrete(rod, "05:40", "2026-11-17"), "embarque na Rodoviária às 05:40");
  const outro = { ...base, pontoCodigo: "outro", pontoNome: "Outros", endereco: "Posto Carone" };
  assertStringIncludes(textoDoLembrete(outro, "06:30", "2026-11-17"), "embarque em Posto Carone às 06:30");
  assertStringIncludes(textoDoLembrete({ ...base, bairro: null, endereco: null }, "05:00", "2026-11-17"), "embarque em casa a partir");
  assertStringIncludes(textoDoLembrete({ ...rod, pontoNome: null }, "05:40", "2026-11-17"), "no seu local de embarque");
  const ret = { ...rod, pontoCodigo: "retorno", pontoNome: "Retorno das Vans" };
  assertStringIncludes(textoDoLembrete(ret, "06:00", "2026-11-17"), "embarque no Retorno das Vans às 06:00");
  assertEquals(variaveisDoModelo(ret, "06:00", "2026-11-17").ponto, "Retorno das Vans");
  assertStringIncludes(textoDoLembrete({ ...volta, endereco: null }, "13:00", "2026-11-18"), "embarque em Cantanhede a partir");
  assertEquals(/R\$/.test(t), false);
  assertEquals(variaveisDoModelo(base, "05:00", "2026-11-17"), { nome: "Maria Teste", dia: "amanhã, quarta (18/11)", ponto: "casa (Turu, Rua das Flores, 10)", horario: "05:00" });
});
