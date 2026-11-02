// supabase/functions/_shared/chatwootClient.ts
//
// Fala com a API REST do Chatwoot (o canal do WhatsApp é do Chatwoot, não
// nosso — ele é o Tech Provider da Meta). Sem lógica de negócio.
//
// Secrets (supabase secrets set …, nunca no código nem no chat):
//   CHATWOOT_API_TOKEN   token de acesso do Agent Bot (Configurações → Robôs)
//   CHATWOOT_ACCOUNT_ID  número da conta (ex.: 188239)
//   CHATWOOT_BASE_URL    opcional; padrão https://app.chatwoot.com

function config() {
  const token = Deno.env.get("CHATWOOT_API_TOKEN");
  const account = Deno.env.get("CHATWOOT_ACCOUNT_ID");
  if (!token || !account) {
    throw new Error("Faltam CHATWOOT_API_TOKEN / CHATWOOT_ACCOUNT_ID nos secrets da função.");
  }
  const base = (Deno.env.get("CHATWOOT_BASE_URL") ?? "https://app.chatwoot.com").replace(/\/$/, "");
  return { token, base: `${base}/api/v1/accounts/${account}` };
}

async function chamar(path: string, body: Record<string, unknown>, method = "POST") {
  const { token, base } = config();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", api_access_token: token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Chatwoot API ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

async function ler(path: string) {
  const { token, base } = config();
  const res = await fetch(`${base}${path}`, {
    headers: { api_access_token: token },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Chatwoot API ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export type StatusConversa = "open" | "pending" | "resolved";

/** Mensagem como o Chatwoot devolve (só o que o atendente de IA usa). */
export type MensagemChatwoot = {
  id: number;
  content: string | null;
  /** 0 = recebida, 1 = enviada, 2 = atividade, 3 = modelo */
  message_type: number;
  private: boolean;
  created_at: number;
  sender?: { type?: string };
};

export const chatwootClient = {
  /** Mensagem para o cliente, ou nota privada (só a equipe vê) com `private: true`. */
  postMessage(conversationId: number, content: string, opts: { private?: boolean } = {}) {
    return chamar(`/conversations/${conversationId}/messages`, {
      content,
      message_type: "outgoing",
      private: opts.private === true,
    });
  },

  /**
   * Corrige o nome do contato no Chatwoot pro nome do CADASTRO (o do perfil do
   * WhatsApp costuma ser apelido). Melhor esforço: o token do Agent Bot pode
   * não ter permissão pra isso.
   */
  atualizarContato(contatoId: number, dados: { name: string }) {
    return chamar(`/contacts/${contatoId}`, dados, "PUT");
  },

  /**
   * Últimas mensagens da conversa (mais antigas primeiro), até `paginas` × 20.
   * É o histórico que o atendente de IA lê: inclui o que a equipe respondeu pelo
   * celular e as notas privadas (o modo sombra guarda o rascunho do bot nelas).
   */
  async listarMensagens(conversationId: number, paginas = 2): Promise<MensagemChatwoot[]> {
    const todas = new Map<number, MensagemChatwoot>();
    let antes: number | undefined;
    for (let i = 0; i < paginas; i++) {
      const dados = await ler(`/conversations/${conversationId}/messages${antes ? `?before=${antes}` : ""}`);
      const lote: MensagemChatwoot[] = dados?.payload ?? [];
      if (lote.length === 0) break;
      for (const m of lote) todas.set(m.id, m);
      antes = Math.min(...lote.map((m) => m.id));
      if (lote.length < 20) break;
    }
    return [...todas.values()].sort((a, b) => a.id - b.id);
  },

  /** "open" entrega a conversa à equipe; "pending" devolve ao bot. */
  setStatus(conversationId: number, status: StatusConversa) {
    return chamar(`/conversations/${conversationId}/toggle_status`, { status });
  },
};
