import { assertEquals, assertRejects } from "jsr:@std/assert";
import { acharOuCriar, FalhaAoResolverConversa, type Resultado } from "./conversaPura.ts";

type Conversa = { id: string };
const semEspera = { esperar: async () => {} };

function roteiro<T>(respostas: Resultado<T>[]) {
  let i = 0;
  const chamadas = { n: 0 };
  const fn = () => {
    chamadas.n++;
    return Promise.resolve(respostas[Math.min(i++, respostas.length - 1)]);
  };
  return { fn, chamadas };
}

Deno.test("regressão #280: busca falha, criação bate no índice único → busca de novo e acha", async () => {
  const buscar = roteiro<Conversa>([
    { data: null, error: { message: "fetch failed" } },
    { data: { id: "c1" }, error: null },
  ]);
  const criar = roteiro<Conversa>([{ data: null, error: { message: "duplicate key", code: "23505" } }]);
  const avisos: string[] = [];
  const c = await acharOuCriar(buscar.fn, criar.fn, { ...semEspera, avisar: (m) => avisos.push(m) });
  assertEquals(c.id, "c1");
  assertEquals(criar.chamadas.n, 0); // com a busca falhando, não tenta criar às cegas
  assertEquals(avisos, ["conversa_busca_falhou"]);
});

Deno.test("duas chamadas ao mesmo tempo: a criação que perde a corrida usa a conversa da outra", async () => {
  const buscar = roteiro<Conversa>([
    { data: null, error: null },
    { data: { id: "c2" }, error: null },
  ]);
  const criar = roteiro<Conversa>([{ data: null, error: { message: "duplicate key", code: "23505" } }]);
  const c = await acharOuCriar(buscar.fn, criar.fn, semEspera);
  assertEquals(c.id, "c2");
});

Deno.test("conversa nova: cria uma vez", async () => {
  const buscar = roteiro<Conversa>([{ data: null, error: null }]);
  const criar = roteiro<Conversa>([{ data: { id: "nova" }, error: null }]);
  assertEquals((await acharOuCriar(buscar.fn, criar.fn, semEspera)).id, "nova");
  assertEquals(criar.chamadas.n, 1);
});

Deno.test("erro de criação que não é duplicidade falha de verdade; busca sempre falhando também", async () => {
  const vazio = roteiro<Conversa>([{ data: null, error: null }]);
  const quebrado = roteiro<Conversa>([{ data: null, error: { message: "permission denied", code: "42501" } }]);
  await assertRejects(() => acharOuCriar(vazio.fn, quebrado.fn, semEspera), FalhaAoResolverConversa, "permission denied");
  assertEquals(quebrado.chamadas.n, 1);

  const fora = roteiro<Conversa>([{ data: null, error: { message: "timeout" } }]);
  const criar = roteiro<Conversa>([{ data: { id: "x" }, error: null }]);
  await assertRejects(() => acharOuCriar(fora.fn, criar.fn, semEspera), FalhaAoResolverConversa, "timeout");
  assertEquals(criar.chamadas.n, 0);
});
