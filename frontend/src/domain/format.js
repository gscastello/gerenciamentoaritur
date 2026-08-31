// Formatação pura (sem locale surpresa em teste — pt-BR fixo).

export const fmtBRL = (n) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "2026-08-30" -> "30/08/2026" */
export function fmtDate(d) {
  if (!d || typeof d !== "string") return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return "—";
  return `${day}/${m}/${y}`;
}

export const fmtHora = (iso) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const todayStr = () => new Date().toISOString().slice(0, 10);

export function normalizar(s) {
  // NFD separa a letra do acento; \p{Diacritic} remove os acentos soltos.
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export const digitos = (tel) => (tel || "").replace(/\D/g, "");
