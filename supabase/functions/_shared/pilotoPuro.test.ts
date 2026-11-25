import { assertEquals } from "jsr:@std/assert@1";

Deno.test("#537: notas da equipe que param e religam o atendente", async () => {
  const { comandoDoPiloto } = await import("./pilotoPuro.ts");
  assertEquals(comandoDoPiloto("#parar"), "parar");
  assertEquals(comandoDoPiloto(" #PARAR agora"), "parar");
  assertEquals(comandoDoPiloto("#religar"), "religar");
  assertEquals(comandoDoPiloto("vou parar"), null);
  assertEquals(comandoDoPiloto("#testar oi"), null);
  assertEquals(comandoDoPiloto(null), null);
});

Deno.test("#537: a trava de custo", async () => {
  const { semCusto, travarCusto } = await import("./semCusto.ts");
  assertEquals(semCusto(), false);
  travarCusto(true);
  assertEquals(semCusto(), true);
  travarCusto(false);
});
