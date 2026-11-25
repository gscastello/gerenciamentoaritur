// supabase/functions/_shared/feriados.ts
//
// A Ida da segunda sai mais cedo por causa de quem trabalha em Cantanhede e Pirapemas (dono, 24/11 — issue #529).
// Segunda de feriado: horário normal; a terça seguinte é que sai mais cedo. Módulo PURO.

/** Feriados nacionais de data fixa e a Adesão do Maranhão (MM-DD). */
const FERIADOS_FIXOS = new Set(["01-01", "04-21", "05-01", "07-28", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]);

const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const vespera = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** `extras`: datas a mais (AAAA-MM-DD) de settings.monday_adjustment.feriados. */
export function ehFeriado(iso: string, extras: string[] = []): boolean {
  return FERIADOS_FIXOS.has(iso.slice(5)) || extras.includes(iso);
}

/** Quantas horas mais cedo a Ida sai nesse dia. */
export function horasMaisCedo(iso: string, horas: number, extras: string[] = []): number {
  const dia = diaDaSemana(iso);
  if (dia === 1) return ehFeriado(iso, extras) ? 0 : horas;
  if (dia === 2) return ehFeriado(vespera(iso), extras) ? horas : 0;
  return 0;
}
