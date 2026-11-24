// src/domain/assistente.js
//
// Regras do assistente da equipe na tela (issue #516): o pedido que nasce de uma pendência, a fala
// que confirma ou descarta a proposta e o texto que é lido em voz alta. Puro, sem React e sem I/O.

const semAcento = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Pedido que resolve uma pendência de verdade. `texto` é o que a pessoa vê; `contexto` vai junto
 * para o modelo (detalhe, telefone e o id que ele usa para propor o fechamento).
 */
export function pedidoDaPendencia(p) {
  const assunto = String(p?.assunto ?? "").trim() || "sem assunto";
  const quem = [p?.cliente, p?.phone].filter(Boolean).join(" · ");
  return {
    texto: `Resolva a pendência: ${assunto}${quem ? ` (${quem})` : ""}`,
    contexto: [
      `[pendência id ${p?.id}; origem ${p?.source ?? "manual"}]`,
      p?.detail ? `Detalhe: ${String(p.detail).slice(0, 1200)}` : null,
      p?.phone ? `Telefone do cliente: ${p.phone}` : null,
      "Leia a conversa, diga em uma frase o que falta e proponha o que resolve de fato.",
    ]
      .filter(Boolean)
      .join("\n"),
    pendencia: { id: p?.id, assunto },
  };
}

const SIM = new Set([
  "sim",
  "confirma",
  "confirmar",
  "confirmo",
  "confirmado",
  "pode",
  "pode confirmar",
  "pode gravar",
  "pode fazer",
  "isso",
  "isso mesmo",
  "ok",
  "certo",
  "sim pode",
  "sim confirma",
  "sim pode confirmar",
]);
const NAO = new Set([
  "nao",
  "nao confirma",
  "nao confirme",
  "descarta",
  "descartar",
  "cancela essa proposta",
  "deixa pra la",
  "nao quero",
  "nao pode",
]);

/** A fala é só uma confirmação ou uma recusa? "sim, mas na sexta" não é nenhuma das duas. */
export function respostaDaFala(fala) {
  const t = semAcento(fala);
  if (SIM.has(t)) return "sim";
  if (NAO.has(t)) return "nao";
  return null;
}

/** A única proposta em aberto da última resposta; com duas ou mais, a voz não escolhe. */
export function propostaParaAVoz(mensagens) {
  const ultima = [...(mensagens ?? [])].reverse().find((m) => m.papel === "assistente");
  const abertas = (ultima?.acoes ?? []).filter((a) => a.estado === "proposta");
  return abertas.length === 1 ? abertas[0] : null;
}

/** Ações que mexem na reserva: depois delas a pendência pode sair da lista. */
const RESOLVEM = new Set(["criar", "mudar", "cancelar", "lancar_rascunho", "descartar_rascunho"]);

/** Depois de gravar o que resolve, a pendência da conversa pode ser fechada com um toque. */
export function pendenciaProntaParaFechar(mensagens) {
  const doPedido = [...(mensagens ?? [])].reverse().find((m) => m.pendencia?.id);
  if (!doPedido) return null;
  const depois = mensagens.slice(mensagens.indexOf(doPedido) + 1).flatMap((m) => m.acoes ?? []);
  const fechada = depois.some((a) => a.tipo === "resolver_pendencia" && a.estado === "feita");
  const resolveu = depois.some((a) => RESOLVEM.has(a.tipo) && a.estado === "feita");
  // já há um cartão do assistente propondo fechar: não mostra dois
  const proposto = depois.some((a) => a.tipo === "resolver_pendencia" && a.estado === "proposta");
  return resolveu && !fechada && !proposto ? doPedido.pendencia : null;
}

/** Texto da resposta sem marcação, telefone ou id, do tamanho que dá para ouvir. */
export function textoParaFalar(texto, acoes = []) {
  const limpo = String(texto ?? "")
    .replace(/[*_`#>]/g, "")
    .replace(/\(?\+?\d{0,2}\s?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\)?/g, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, "")
    .replace(/R\$\s?(\d+),00/g, "$1 reais")
    .replace(/\s+/g, " ")
    .replace(/ ([.,!?])/g, "$1")
    .trim();
  const frases = limpo.match(/[^.!?]+[.!?]*/g) ?? [limpo];
  let fala = "";
  for (const f of frases) {
    if ((fala + f).length > 320) break;
    fala += f;
  }
  const abertas = acoes.filter((a) => (a.estado ?? "proposta") === "proposta").length;
  const pergunta = abertas === 1 ? " Confirma?" : abertas > 1 ? " Confira os cartões na tela." : "";
  return `${fala.trim() || limpo.slice(0, 320)}${pergunta}`.trim();
}

/** 0:07 */
export function relogio(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
