// supabase/functions/_shared/nluService.ts
//
// Regra de ouro deste arquivo, para não quebrar a garantia anti-alucinação
// que sustenta todo o resto do sistema:
//
//   O LLM SÓ FAZ DUAS COISAS: (1) classificar a intenção da mensagem
//   dentro de um conjunto fixo de opções, e (2) extrair campos
//   estruturados (data, quantidade, ponto, bairro...) do texto livre.
//
//   O LLM NUNCA decide preço, vaga, horário ou confirmação — esses
//   valores continuam vindo exclusivamente de consultas ao banco no
//   conversationEngine/whatsappService, exatamente como antes. Este
//   arquivo devolve só um JSON estruturado (via tool_choice forçado),
//   nunca um texto livre que seria mandado direto ao cliente.
//
//   Os "route_point_code" válidos são passados PARA o modelo como a
//   lista fechada de opções reais (lida do banco antes desta chamada)
//   — o modelo é instruído a nunca inventar um código fora dessa lista.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
// Sonnet 5: mais capaz e mais barato que o 4-6 ($2/$10 vs $3/$15 por 1M tokens)
// e suficiente de sobra para extração estruturada de campos.
const MODEL = "claude-sonnet-5";

if (!ANTHROPIC_API_KEY) {
  throw new Error("Falta ANTHROPIC_API_KEY nos secrets da função.");
}

export type ExtractedIntent = {
  intent:
    | "reservar" | "cancelar" | "alterar" | "pagamento" | "frete"
    | "encomenda" | "atendente" | "saudacao" | "confirmar" | "negar" | "outro";
  direction: "ida" | "volta" | null;
  trip_date: string | null;         // YYYY-MM-DD, já resolvido a partir de expressões relativas
  quantity: number | null;
  route_point_code: string | null;  // só um dos códigos válidos passados no prompt, ou null
  neighborhood: string | null;
  pickup_detail: string | null;
  dropoff_location: string | null;
  payment_method: "dinheiro" | "pix" | null;
  reservation_reference_hint: string | null;
  confidence: "alta" | "media" | "baixa";
};

const EXTRACT_TOOL = {
  name: "extract_reservation_intent",
  description: "Extrai intenção e campos estruturados de uma mensagem de cliente de transporte. Nunca invente valores não mencionados — use null.",
  input_schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: ["reservar", "cancelar", "alterar", "pagamento", "frete", "encomenda", "atendente", "saudacao", "confirmar", "negar", "outro"] },
      direction: { type: ["string", "null"], enum: ["ida", "volta", null] },
      trip_date: { type: ["string", "null"], description: "formato YYYY-MM-DD, resolvido a partir de hoje; null se não mencionado" },
      quantity: { type: ["integer", "null"] },
      route_point_code: { type: ["string", "null"], description: "OBRIGATORIAMENTE um dos códigos válidos fornecidos no contexto, ou null" },
      neighborhood: { type: ["string", "null"] },
      pickup_detail: { type: ["string", "null"] },
      dropoff_location: { type: ["string", "null"] },
      payment_method: { type: ["string", "null"], enum: ["dinheiro", "pix", null] },
      reservation_reference_hint: { type: ["string", "null"] },
      confidence: { type: "string", enum: ["alta", "media", "baixa"] },
    },
    required: ["intent", "confidence"],
  },
};

export async function interpretMessage(params: {
  text: string;
  today: string;                       // YYYY-MM-DD — para resolver "amanhã", "sexta que vem"
  validRoutePoints: { code: string; name: string; direction: string }[];
  conversationSummary?: string;        // ex.: "cliente já escolheu Ida, aguardando data"
}): Promise<ExtractedIntent> {
  const pointsList = params.validRoutePoints.map((p) => `${p.code} (${p.direction}: ${p.name})`).join(", ") || "nenhum";

  const systemPrompt = `Você é um extrator de dados para um bot de reservas de transporte (São Luís ⇄ Pirapemas/Cantanhede).
Sua ÚNICA função é chamar a ferramenta extract_reservation_intent com o que a mensagem realmente diz.
NUNCA invente data, quantidade, local ou preço que não estejam no texto — use null.
Hoje é ${params.today}. Resolva expressões relativas ("amanhã", "sexta que vem") para data absoluta.
route_point_code só pode ser um destes códigos válidos, exatamente como aparecem: ${pointsList}. Se o texto mencionar um local que não bate com nenhum desses, deixe route_point_code null e coloque a menção literal em pickup_detail.
${params.conversationSummary ? `Contexto da conversa até agora: ${params.conversationSummary}` : ""}
Você NUNCA responde preço, vaga, horário ou confirmação — isso não é seu trabalho, só extraia dados.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system: systemPrompt,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_reservation_intent" }, // força saída estruturada — nunca texto livre
      messages: [{ role: "user", content: params.text }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao chamar o modelo de extração: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const toolUse = data.content?.find((c: any) => c.type === "tool_use");
  if (!toolUse) throw new Error("Modelo não retornou extração estruturada.");

  return {
    intent: toolUse.input.intent ?? "outro",
    direction: toolUse.input.direction ?? null,
    trip_date: toolUse.input.trip_date ?? null,
    quantity: toolUse.input.quantity ?? null,
    route_point_code: toolUse.input.route_point_code ?? null,
    neighborhood: toolUse.input.neighborhood ?? null,
    pickup_detail: toolUse.input.pickup_detail ?? null,
    dropoff_location: toolUse.input.dropoff_location ?? null,
    payment_method: toolUse.input.payment_method ?? null,
    reservation_reference_hint: toolUse.input.reservation_reference_hint ?? null,
    confidence: toolUse.input.confidence ?? "baixa",
  };
}
