// src/domain/rascunhoReserva.js
//
// Reservas PREPARADAS pela IA (issue #254) — regras puras para a tela. O bot só
// deixa o rascunho (data, sentido, ponto, endereço…); o formulário de nova
// reserva calcula preço e vaga como sempre. Nada aqui decide valor.

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Formulário de nova reserva já preenchido a partir do rascunho. */
export function inicialDoRascunho(r, trips) {
  const pontos = trips?.[r?.direction]?.pontos || [];
  const ponto = pontos.find((p) => p.id === r?.route_point_code);
  return {
    nome: r?.customer_name || "",
    telefone: r?.phone || "",
    data: r?.trip_date || "",
    direcao: r?.direction || "ida",
    pontoId: ponto?.id || "",
    bairro: ponto?.campo === "bairro" ? r?.pickup_neighborhood || "" : "",
    anotacao: ponto ? r?.pickup_detail || "" : "",
    desembarque: r?.dropoff_location || "",
    desembarqueArea: r?.dropoff_area || "",
    quantidade: r?.quantity || 1,
    pagamento: "dinheiro",
    aviso: ponto
      ? `Preparada pela IA a partir da conversa${r?.client_excerpt ? `: “${r.client_excerpt}”` : ""}. Confira antes de agendar.`
      : "Preparada pela IA, mas o ponto de embarque não foi reconhecido: escolha o ponto.",
  };
}

/** Onde embarca, em texto curto: "Buscar em Casa · Cohatrac, Rua 7" / "Cantanhede". */
export function embarqueDoRascunho(r, trips) {
  const pontos = trips?.[r?.direction]?.pontos || [];
  const nome = pontos.find((p) => p.id === r?.route_point_code)?.nome || r?.route_point_code || "";
  const local = [r?.pickup_neighborhood, r?.pickup_detail].filter(Boolean).join(", ");
  return [nome, local].filter(Boolean).join(" · ");
}

/** "Ida · ter 10/11" */
export function viagemDoRascunho(r) {
  if (!r?.trip_date) return "";
  const [a, m, d] = r.trip_date.split("-").map(Number);
  const dia = SEMANA[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()];
  const sentido = r.direction === "volta" ? "Volta" : "Ida";
  return `${sentido} · ${dia} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Linha para colar na caixinha da Agenda (encomenda): "E <onde buscar> <telefone> <nome>". */
export function anotacaoDaEncomenda(r) {
  return ["E", r?.pickup_detail, r?.phone, r?.customer_name].filter(Boolean).join(" ").trim();
}

// Mesma regra do bot (SAIDA_ENCERRADA em supabase/functions/_shared/rascunhoPuro.ts):
// a partir destas horas, a viagem de hoje naquele sentido já saiu.
const SAIDA_ENCERRADA = { ida: "07:00", volta: "14:00" };

/**
 * Reserva preparada que ainda dá para lançar (issue #357): viagem de um dia que
 * não passou e, se for hoje, que ainda não saiu. `horaAgora` = "HH:MM" em São Luís.
 */
export function rascunhoAindaValeLancar(r, hoje, horaAgora) {
  if (!r?.trip_date || r.trip_date < hoje) return false;
  if (r.trip_date > hoje) return true;
  const saida = SAIDA_ENCERRADA[r.direction];
  return !saida || !horaAgora || horaAgora < saida;
}
