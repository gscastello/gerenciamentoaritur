// Regras de horário da operação.
// A ida de segunda-feira sai mais cedo (config.segundaHoras, padrão 1h).

/** d = "YYYY-MM-DD" */
export function isMonday(d) {
  return new Date(`${d}T12:00:00`).getDay() === 1;
}

export function diaSemana(d) {
  return new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
}

/**
 * Adianta um horário "HH:MM" em `horas` quando `ativo` é true.
 * Usado só na ida de segunda. Sem efeito quando ativo=false.
 */
export function shiftHour(hhmm, ativo, horas = 1) {
  if (!ativo) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const nova = (h - horas + 24) % 24;
  return `${String(nova).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
