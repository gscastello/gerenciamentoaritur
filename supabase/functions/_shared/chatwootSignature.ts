// supabase/functions/_shared/chatwootSignature.ts
//
// Confere a assinatura dos webhooks do Chatwoot (lib/webhooks/trigger.rb):
//   X-Chatwoot-Timestamp: <unix segundos>
//   X-Chatwoot-Signature: sha256=<hex(HMAC-SHA256(secret, "<timestamp>.<corpo cru>"))>
// O timestamp entra na assinatura, então além de checar o HMAC rejeitamos
// requisições velhas (anti-replay). Sem dependências de propósito.

const TOLERANCIA_PADRAO_SEG = 300;

function igualTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function assinaturaChatwootValida(opts: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  agoraSeg?: number;
  toleranciaSeg?: number;
}): Promise<boolean> {
  const { secret, timestamp, signature, rawBody } = opts;
  if (!secret || !timestamp || !signature?.startsWith("sha256=")) return false;

  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  const agora = opts.agoraSeg ?? Math.floor(Date.now() / 1000);
  if (Math.abs(agora - ts) > (opts.toleranciaSeg ?? TOLERANCIA_PADRAO_SEG)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const calculado = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return igualTempoConstante(calculado, signature.slice("sha256=".length));
}
