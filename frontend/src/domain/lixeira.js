// Lixeira de reservas canceladas (issue #206).
//
// Cancelar uma reserva é sempre UPDATE status = 'cancelada' (nunca DELETE),
// então as canceladas continuam todas no banco. A "lixeira" é só a lista das
// canceladas recentes, para o dono desfazer um cancelamento por engano.
// Regras puras (sem React, sem I/O).

import { normalizar } from "./format.js";

const DIA_MS = 24 * 60 * 60 * 1000;

/** Quando foi cancelada: `canceladaEm`; sem ele (dado antigo), a última atualização. */
export function quandoCancelada(r) {
  const iso = r?.canceladaEm ?? r?.atualizadoEm ?? r?.criadoEm ?? null;
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? null : t;
}

/**
 * Canceladas dos últimos `dias` dias (mais recentes primeiro), opcionalmente
 * filtradas por nome ou telefone. Só entram reservas com status "cancelada".
 */
export function reservasNaLixeira(reservas, { agora = Date.now(), dias = 30, busca = "" } = {}) {
  const limite = agora - dias * DIA_MS;
  const termo = normalizar(busca);
  const digitosBusca = String(busca ?? "").replace(/\D/g, "");
  return (reservas ?? [])
    .filter((r) => r.status === "cancelada")
    .filter((r) => {
      const quando = quandoCancelada(r);
      return quando === null || quando >= limite;
    })
    .filter((r) => {
      if (!termo) return true;
      if (normalizar(r.nome).includes(termo)) return true;
      return (
        digitosBusca.length >= 3 &&
        [r.telefone, r.telefone2].some((t) =>
          String(t ?? "")
            .replace(/\D/g, "")
            .includes(digitosBusca),
        )
      );
    })
    .sort((a, b) => (quandoCancelada(b) ?? 0) - (quandoCancelada(a) ?? 0));
}

/** Texto do `window.confirm` ao restaurar. */
export function mensagemDeRestauracao(r, dataFormatada) {
  const quando = dataFormatada ? ` (${dataFormatada})` : "";
  return [
    `Restaurar a reserva de ${r.nome || "passageiro"}${quando}?`,
    "",
    "Ela volta ao estado de antes de ser cancelada — se a viagem já lotou, a restauração é recusada e nada muda. O estorno automático do financeiro é desfeito.",
  ].join("\n");
}

/** Texto do `window.confirm` ao cancelar (um toque não cancela direto). */
export function mensagemDeCancelamento(r) {
  return [
    `Cancelar a reserva de ${r?.nome || "passageiro"}?`,
    "",
    "Ela vai para a Lixeira (no fim da Agenda) e pode ser restaurada.",
  ].join("\n");
}
