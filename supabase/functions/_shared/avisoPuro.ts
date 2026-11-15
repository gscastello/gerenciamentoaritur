// supabase/functions/_shared/avisoPuro.ts
//
// Aviso aos passageiros pelo WhatsApp (issue #432) — regras PURAS, sem rede.
// Dentro das 24 h da última mensagem do cliente vai o texto livre que a equipe escreveu; fora,
// só o modelo aprovado pela Meta (variáveis fixas: {{1}} nome, {{2}} dia, {{3}} ponto, {{4}} horário).
// Sem modelo configurado ou sem conversa no Chatwoot, o passageiro fica marcado para a equipe
// avisar pelo celular — nunca some calado.

export type ModeloDoAviso = { nome: string; idioma: string; categoria: string };

export type ItemDoAviso = {
  reservation_id: string;
  texto: string;
  nome?: string | null;
  dia?: string | null;
  ponto?: string | null;
  horario?: string | null;
};

export type ComoEnviar =
  | { modo: "texto" }
  | { modo: "modelo"; corpo: Record<string, string> }
  | { modo: "nenhum"; status: "fora_da_janela" | "sem_conversa" };

/** Janela do WhatsApp: 24 h desde a última mensagem do CLIENTE (com 30 min de folga). */
export const JANELA_MS = 23.5 * 3600 * 1000;

/** O modelo salvo em settings.aviso_modelo, se estiver bem formado. */
export function modeloValido(v: unknown): ModeloDoAviso | null {
  const m = v as Partial<ModeloDoAviso> | null;
  const nome = String(m?.nome ?? "").trim();
  if (!/^[a-z0-9_]{3,512}$/.test(nome)) return null;
  const idioma = String(m?.idioma ?? "pt_BR").trim() || "pt_BR";
  const categoria = String(m?.categoria ?? "UTILITY").trim().toUpperCase() || "UTILITY";
  return { nome, idioma, categoria };
}

/** Primeiro nome para o aviso ("Maria da Silva" → "Maria"); sem nome, "passageiro(a)". */
export function primeiroNome(nome: string | null | undefined): string {
  const p = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (p.length < 2 || /\d/.test(p)) return "passageiro(a)";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** Como mandar o aviso para um passageiro. */
export function comoEnviar(p: {
  temConversa: boolean;
  ultimaDoClienteEm: string | null;
  agora: Date;
  modelo: ModeloDoAviso | null;
  item: ItemDoAviso;
}): ComoEnviar {
  if (!p.temConversa) return { modo: "nenhum", status: "sem_conversa" };
  const ultima = p.ultimaDoClienteEm ? Date.parse(p.ultimaDoClienteEm) : Number.NaN;
  if (Number.isFinite(ultima) && p.agora.getTime() - ultima < JANELA_MS) return { modo: "texto" };
  // fora da janela: só o modelo, e só com as quatro variáveis preenchidas
  const { nome, dia, ponto, horario } = p.item;
  if (!p.modelo || !dia || !ponto || !horario) return { modo: "nenhum", status: "fora_da_janela" };
  return { modo: "modelo", corpo: { "1": primeiroNome(nome), "2": dia, "3": ponto, "4": horario } };
}

/** O texto que fica no histórico quando vai o modelo (o mesmo que o passageiro lê). */
export function textoDoModelo(corpo: Record<string, string>): string {
  return `Olá, ${corpo["1"]}! Lembrete da sua viagem com a AriTur: ${corpo["2"]}, embarque em ${corpo["3"]} às ${corpo["4"]}. Qualquer dúvida, é só responder esta mensagem.`;
}

/** Itens válidos do pedido (até 80 por vez; texto entre 5 e 1000 letras; sem repetir reserva). */
export function itensValidos(bruto: unknown): ItemDoAviso[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const out: ItemDoAviso[] = [];
  for (const b of bruto) {
    const id = String(b?.reservation_id ?? "");
    const texto = String(b?.texto ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id) || vistos.has(id) || texto.length < 5 || texto.length > 1000) continue;
    vistos.add(id);
    const curto = (v: unknown) => {
      const s = String(v ?? "").trim();
      return s ? s.slice(0, 60) : null;
    };
    out.push({ reservation_id: id, texto, nome: curto(b?.nome), dia: curto(b?.dia), ponto: curto(b?.ponto), horario: curto(b?.horario) });
    if (out.length >= 80) break;
  }
  return out;
}
