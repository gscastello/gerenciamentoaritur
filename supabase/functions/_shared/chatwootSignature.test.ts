import { assertEquals } from "jsr:@std/assert";
import { assinaturaChatwootValida } from "./chatwootSignature.ts";

const SECRET = "segredo-de-teste";
const CORPO = JSON.stringify({ event: "message_created", id: 1 });
const AGORA = 1_760_000_000;

async function assinar(secret: string, ts: string, corpo: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${corpo}`));
  return `sha256=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

Deno.test("assinatura correta e recente é aceita", async () => {
  const ts = String(AGORA - 5);
  const signature = await assinar(SECRET, ts, CORPO);
  assertEquals(
    await assinaturaChatwootValida({ secret: SECRET, timestamp: ts, signature, rawBody: CORPO, agoraSeg: AGORA }),
    true,
  );
});

Deno.test("corpo adulterado é rejeitado", async () => {
  const ts = String(AGORA);
  const signature = await assinar(SECRET, ts, CORPO);
  assertEquals(
    await assinaturaChatwootValida({ secret: SECRET, timestamp: ts, signature, rawBody: `${CORPO} `, agoraSeg: AGORA }),
    false,
  );
});

Deno.test("segredo errado é rejeitado", async () => {
  const ts = String(AGORA);
  const signature = await assinar("outro-segredo", ts, CORPO);
  assertEquals(
    await assinaturaChatwootValida({ secret: SECRET, timestamp: ts, signature, rawBody: CORPO, agoraSeg: AGORA }),
    false,
  );
});

Deno.test("timestamp velho (replay) é rejeitado mesmo com HMAC válido", async () => {
  const ts = String(AGORA - 3600);
  const signature = await assinar(SECRET, ts, CORPO);
  assertEquals(
    await assinaturaChatwootValida({ secret: SECRET, timestamp: ts, signature, rawBody: CORPO, agoraSeg: AGORA }),
    false,
  );
});

Deno.test("cabeçalhos ausentes ou malformados são rejeitados", async () => {
  const base = { secret: SECRET, rawBody: CORPO, agoraSeg: AGORA };
  assertEquals(await assinaturaChatwootValida({ ...base, timestamp: null, signature: "sha256=abc" }), false);
  assertEquals(await assinaturaChatwootValida({ ...base, timestamp: String(AGORA), signature: null }), false);
  assertEquals(await assinaturaChatwootValida({ ...base, timestamp: String(AGORA), signature: "abc" }), false);
  assertEquals(await assinaturaChatwootValida({ ...base, timestamp: "não-é-número", signature: "sha256=abc" }), false);
});

Deno.test("sem segredo configurado, nada passa", async () => {
  const ts = String(AGORA);
  const signature = `sha256=${"0".repeat(64)}`;
  assertEquals(
    await assinaturaChatwootValida({ secret: "", timestamp: ts, signature, rawBody: CORPO, agoraSeg: AGORA }),
    false,
  );
});
