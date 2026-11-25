import { assertEquals } from "jsr:@std/assert";
import { MUDOU_DEPOIS, compararCaso, resumoDaRodada, type ViagemDoCaso } from "./avaliacaoPura.ts";

const ida: ViagemDoCaso = { trip_date: "2026-11-16", direction: "ida", route_point_code: "busca", quantity: 1, pickup_neighborhood: "Cohatrac" };
const volta: ViagemDoCaso = { trip_date: "2026-11-17", direction: "volta", route_point_code: "cantanhede", quantity: 1 };

Deno.test("#419 avaliação: certo, errado, faltou, pendente", () => {
  assertEquals(compararCaso([ida, volta], [ida, volta]).resultado, "certo");
  // dia trocado (pediu segunda, lançaria domingo): lança uma que não foi pedida e falta a certa
  const domingo = { ...ida, trip_date: "2026-11-15" };
  const r = compararCaso([ida], [domingo]);
  assertEquals(r.resultado, "errado");
  assertEquals(r.diferencas, ["faltou Ida 16/11", "lançaria Ida 15/11 que não foi pedida"]);
  // ponto errado (busca em casa na Estiva em vez de Outros)
  const naBr = { ...ida, route_point_code: "outro", pickup_neighborhood: null };
  assertEquals(compararCaso([naBr], [ida]).diferencas, ["Ida 16/11 errada: ponto: busca ≠ outro"]);
  // bairro errado
  assertEquals(compararCaso([ida], [{ ...ida, pickup_neighborhood: "Turu" }]).resultado, "errado");
  // só a Ida: faltou a Volta
  assertEquals(compararCaso([ida, volta], [ida]).resultado, "faltou");
  // dúvida: pendência
  const p = compararCaso([ida], [{ ...ida, pendencia: { motivo: "cidade", codigo: "cidade" } }]);
  assertEquals(p.resultado, "pendente");
  // não lançou por falta do dia: pendência com o motivo; caso conferido em que perguntar é o certo
  assertEquals(compararCaso([ida], [], { motivos: ["sem_data"] }).resultado, "pendente");
  assertEquals(compararCaso([ida], [], { motivos: ["sem_data"], pendenteOk: true }).resultado, "certo");
  assertEquals(compararCaso([ida], [], { motivos: ["ja_reservado"] }).resultado, "faltou");
  // errado vence tudo
  assertEquals(compararCaso([ida, volta], [{ ...ida, quantity: 2 }]).resultado, "errado");
});

Deno.test("#419 resumo da rodada", () => {
  const r = resumoDaRodada(["certo", "certo", "errado", "pendente"]);
  assertEquals(r, { total: 4, certos: 2, errados: 1, faltaram: 0, pendentes: 1, acerto: 50, semErroGrave: 75 });
});

Deno.test("#494: bairros que são o mesmo na tabela não são erro; de preço diferente são", () => {
  const v = (b: string) => ({ trip_date: "2026-11-25", direction: "ida", route_point_code: "busca", quantity: 1, pickup_neighborhood: b });
  const tabela: Record<string, string> = { "Novo Aurora": "Aurora", Aurora: "Aurora", Turu: "Turu", "Jardim Turu": "Turu", "Alto do Turu": "Alto do Turu" };
  const bairroNaTabela = (b: string) => tabela[b] ?? null;
  assertEquals(compararCaso([v("Aurora")], [v("Novo Aurora")], { bairroNaTabela }).resultado, "certo");
  assertEquals(compararCaso([v("Jardim Turu")], [v("Turu")], { bairroNaTabela }).resultado, "certo");
  assertEquals(compararCaso([v("Alto do Turu")], [v("Turu")], { bairroNaTabela }).resultado, "errado");
  // fora da tabela, os dois: só o texto igual vale
  assertEquals(compararCaso([v("Bairro A")], [v("Bairro B")], { bairroNaTabela }).resultado, "errado");
  assertEquals(compararCaso([v("Aurora")], [v("Novo Aurora")]).resultado, "errado");
});

Deno.test("#508: caso que mudou depois da marca e não foi conferido: diferença vira pendente com o motivo", () => {
  // caso 8bfa7860: Agendado com Rodoviária; depois a cliente escreveu "É no retorno viu" e o revisor trocou
  const agora: ViagemDoCaso = { trip_date: "2026-11-24", direction: "ida", route_point_code: "retorno", quantity: 3 };
  const lida: ViagemDoCaso = { ...agora, route_point_code: "rodoviaria" };
  const r = compararCaso([agora], [lida], { mudouDepois: true });
  assertEquals(r.resultado, "pendente");
  assertEquals(r.diferencas, [MUDOU_DEPOIS, "Ida 24/11 errada: ponto: rodoviaria ≠ retorno"]);
  // nem o "pendente_ok" transforma em certo calado
  assertEquals(compararCaso([agora], [lida], { mudouDepois: true, pendenteOk: true }).resultado, "pendente");
  // faltou e lançaria a mais também ficam para conferir
  assertEquals(compararCaso([agora, volta], [agora], { mudouDepois: true }).resultado, "pendente");
  assertEquals(compararCaso([agora], [agora, volta], { mudouDepois: true }).diferencas[0], MUDOU_DEPOIS);
  // sem diferença continua certo
  assertEquals(compararCaso([agora], [agora], { mudouDepois: true }), { resultado: "certo", diferencas: [] });
  // sem a marca (ou já conferido), a régua de sempre
  assertEquals(compararCaso([agora], [lida]).resultado, "errado");
});
