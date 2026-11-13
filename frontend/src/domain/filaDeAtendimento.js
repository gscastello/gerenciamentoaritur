// src/domain/filaDeAtendimento.js
//
// Ordem e filtros da janela de Conversas do Atendimento (issue #360). Regra pura.
//
// O espelho do Chatwoot marca "aguardando_equipe" quando o cliente falou por
// último — inclusive num "obrigado" de semanas atrás. Essas conversas velhas
// subiam para o topo e empurravam as de hoje para baixo. Agora a lista é a mais
// recente primeiro (como no WhatsApp) e "aguardando" só vale com mensagem do
// cliente nas últimas 48 h.

const JANELA_AGUARDANDO_MS = 48 * 60 * 60 * 1000;

export const FILTROS_DA_FILA = [
  { id: "todas", label: "Todas" },
  { id: "aguardando", label: "Aguardando" },
  { id: "equipe", label: "Com a equipe" },
  { id: "bot", label: "Com o bot" },
];

const quando = (c) => {
  const t = Date.parse(c?.last_message_at ?? "");
  return Number.isNaN(t) ? 0 : t;
};

/** O cliente está mesmo esperando a equipe (falou por último há menos de 48 h). */
export function aguardandoDeVerdade(c, agora = Date.now()) {
  return !!c?.aguardando_equipe && agora - quando(c) <= JANELA_AGUARDANDO_MS;
}

function passaNoFiltro(c, filtro, agora) {
  if (filtro === "aguardando") return aguardandoDeVerdade(c, agora);
  if (filtro === "equipe") return c.status === "open";
  if (filtro === "bot") return c.status === "pending";
  return true;
}

/** Conversas do filtro, a mais recente primeiro. Não muda a lista recebida. */
export function filaDeConversas(conversas, filtro = "todas", agora = Date.now()) {
  return (conversas ?? [])
    .filter((c) => passaNoFiltro(c, filtro, agora))
    .sort((a, b) => quando(b) - quando(a));
}

/** Quantas conversas em cada filtro (para os números nos botões). */
export function contagemDaFila(conversas, agora = Date.now()) {
  const lista = conversas ?? [];
  return Object.fromEntries(
    FILTROS_DA_FILA.map((f) => [f.id, lista.filter((c) => passaNoFiltro(c, f.id, agora)).length]),
  );
}
