// src/domain/veiculoDoDia.js
//
// Qual veículo roda (issue #502)? Em 22/11 o ônibus parou, ninguém trocou o veículo na Operação e o app
// ficou com 31 lugares em vez de 19. Uma pessoa confirma o veículo do dia: amanhã a partir das 14h, e o
// de hoje enquanto a viagem não saiu (Ida até 06:00, Volta até 13:00). Regra pura.

const PERGUNTA_A_PARTIR = "14:00";
const LIMITE_HOJE = { ida: "06:00", volta: "13:00" };

/** Dias com viagem ainda sem veículo confirmado: [{ data, quando: "hoje"|"amanhã", viagens }]. */
export function diasAConfirmar(viagens, { hoje, amanha, hora }) {
  const falta = (t) => t.vehicle_confirmed_at === null && t.status === "agendada";
  const deHoje = (viagens ?? []).filter(
    (t) => t.trip_date === hoje && falta(t) && hora < (LIMITE_HOJE[t.direction] ?? "00:00"),
  );
  const deAmanha =
    hora >= PERGUNTA_A_PARTIR
      ? (viagens ?? []).filter((t) => t.trip_date === amanha && falta(t))
      : [];
  return [
    { data: hoje, quando: "hoje", viagens: deHoje },
    { data: amanha, quando: "amanhã", viagens: deAmanha },
  ].filter((d) => d.viagens.length > 0);
}

/** "Ida", "Volta" ou "Ida e Volta". */
export function sentidosDoDia(viagens) {
  const tem = (d) => viagens.some((t) => t.direction === d);
  return [tem("ida") && "Ida", tem("volta") && "Volta"].filter(Boolean).join(" e ");
}

/** Viagens de hoje e amanhã, na ordem, para abrir/fechar as vendas do bot. */
export function viagensDeHojeEAmanha(viagens, { hoje, amanha }) {
  return (viagens ?? [])
    .filter((t) => t.trip_date === hoje || t.trip_date === amanha)
    .sort(
      (a, b) =>
        a.trip_date.localeCompare(b.trip_date) ||
        String(a.direction).localeCompare(String(b.direction)),
    );
}
