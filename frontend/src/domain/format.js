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

// A operação é em São Luís (MA) — UTC-3 o ano inteiro (Brasil não observa
// mais horário de verão desde 2019). `new Date().toISOString()` é UTC: das
// 21h à meia-noite em São Luís, já mostra o dia seguinte — um bug real pra
// "hoje". `dataOperacao`/`todayStr` fixam o fuso explicitamente.
const FUSO_OPERACAO = "America/Fortaleza";

export const fmtHora = (iso) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO_OPERACAO,
  });

const fmtDiaFuso = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_OPERACAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** `offsetDias` desloca em milissegundos absolutos (nunca getDate/setDate
 * locais) — o resultado não depende do fuso do aparelho de quem chama. */
export const dataOperacao = (offsetDias = 0) =>
  fmtDiaFuso.format(new Date(Date.now() + offsetDias * 86400000));
export const todayStr = () => dataOperacao();

export function normalizar(s) {
  // NFD separa a letra do acento; \p{Diacritic} remove os acentos soltos.
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export const digitos = (tel) => (tel || "").replace(/\D/g, "");
