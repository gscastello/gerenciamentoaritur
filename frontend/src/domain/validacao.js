// src/domain/validacao.js
//
// Regras puras de validação — usadas no frontend (feedback imediato) e
// espelhadas nas RPCs do banco (a barreira real). Cada função devolve
// `{ ok: boolean, valor?, erro? }` — `valor` é a versão normalizada
// quando faz sentido (ex.: telefone só com dígitos).

// A operação é em São Luís, Cantanhede e Pirapemas: número sem DDD é daqui.
const DDD_PADRAO = "98";
const RE_CEP = /^\s*\d{5}-\d{3}\s*$/;

function ehNumeroSemDdd(numero, entrada) {
  if (RE_CEP.test(String(entrada ?? ""))) return false;
  return (
    (numero.length === 8 && /^[2-9]/.test(numero)) || (numero.length === 9 && numero[0] === "9")
  );
}

/**
 * Telefone BR: aceita máscara, espaço, +55, zero antes do DDD e número sem DDD
 * (assume o da operação); guarda só os dígitos.
 */
export function validarTelefone(entrada) {
  const digitos = String(entrada ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  const semPais = digitos.startsWith("55") && digitos.length > 11 ? digitos.slice(2) : digitos;
  if (ehNumeroSemDdd(semPais, entrada)) return { ok: true, valor: `${DDD_PADRAO}${semPais}` };
  if (semPais.length < 10 || semPais.length > 11) {
    return { ok: false, erro: "Telefone precisa ter DDD + número (10 ou 11 dígitos)." };
  }
  const ddd = Number(semPais.slice(0, 2));
  if (ddd < 11 || ddd > 99) {
    return { ok: false, erro: "DDD inválido." };
  }
  if (semPais.length === 11 && semPais[2] !== "9") {
    return { ok: false, erro: "Celular com 11 dígitos deve começar com 9 depois do DDD." };
  }
  return { ok: true, valor: semPais };
}

/**
 * Formas do mesmo celular, com e sem o nono dígito (a maior parte dos cadastros
 * não tem o 9). Espelha fn_variantes_telefone no banco. Número inválido: lista vazia.
 */
export function variantesTelefone(entrada) {
  const v = validarTelefone(entrada);
  if (!v.ok) return [];
  const n = v.valor;
  if (n.length === 10 && /^[6-9]/.test(n[2])) return [n, `${n.slice(0, 2)}9${n.slice(2)}`];
  if (n.length === 11 && /^[6-9]/.test(n[3])) return [n, `${n.slice(0, 2)}${n.slice(3)}`];
  return [n];
}

/**
 * O termo de busca parece telefone? Devolve os dígitos a procurar: com 8 ou mais,
 * só os 8 finais, que são iguais com ou sem +55, DDD e nono dígito. Senão, null.
 */
export function digitosDeBusca(termo) {
  const t = String(termo ?? "").trim();
  if (!/^[+\d\s().-]+$/.test(t)) return null;
  const digitos = t.replace(/\D/g, "");
  if (digitos.length < 4) return null;
  return digitos.length >= 8 ? digitos.slice(-8) : digitos;
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Data ISO (YYYY-MM-DD). `min` / `max` opcionais (também ISO). */
export function validarData(iso, { min, max } = {}) {
  if (!RE_DATA.test(String(iso ?? ""))) {
    return { ok: false, erro: "Data inválida." };
  }
  const t = Date.parse(`${iso}T12:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso) {
    return { ok: false, erro: "Data inexistente." };
  }
  if (min && iso < min) {
    return { ok: false, erro: "Data no passado." };
  }
  if (max && iso > max) {
    return { ok: false, erro: "Data muito à frente." };
  }
  return { ok: true, valor: iso };
}

/** Hora HH:MM (24h). */
export function validarHora(entrada) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(entrada ?? "").trim());
  if (!m) return { ok: false, erro: "Hora inválida (use HH:MM)." };
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return { ok: false, erro: "Hora fora do intervalo." };
  return { ok: true, valor: `${String(h).padStart(2, "0")}:${m[2]}` };
}

/** Valor monetário: número finito >= `min` (0 por padrão). Aceita vírgula. */
export function validarValor(entrada, { min = 0, max } = {}) {
  const bruto =
    typeof entrada === "string" ? entrada.replace(/\s/g, "").replace(",", ".") : entrada;
  const n = Number(bruto);
  if (bruto === "" || bruto == null || !Number.isFinite(n)) {
    return { ok: false, erro: "Valor inválido." };
  }
  if (n < min) return { ok: false, erro: `Valor não pode ser menor que ${min}.` };
  if (max != null && n > max) return { ok: false, erro: `Valor não pode passar de ${max}.` };
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

/** Quantidade de passageiros: inteiro em [min, max]. */
export function validarQuantidade(entrada, { min = 1, max } = {}) {
  const n = Number(entrada);
  if (!Number.isInteger(n)) return { ok: false, erro: "Quantidade inválida." };
  if (n < min) return { ok: false, erro: `Mínimo ${min}.` };
  if (max != null && n > max) return { ok: false, erro: `Não há ${n} vagas (máximo ${max}).` };
  return { ok: true, valor: n };
}

/** Campo de texto obrigatório. */
export function validarObrigatorio(entrada, rotulo = "Campo") {
  const v = String(entrada ?? "").trim();
  if (!v) return { ok: false, erro: `${rotulo} é obrigatório.` };
  return { ok: true, valor: v };
}

/** Nome de pessoa: pelo menos 2 caracteres não-espaço. */
export function validarNome(entrada) {
  const v = String(entrada ?? "").trim();
  if (v.length < 2) return { ok: false, erro: "Informe o nome completo." };
  return { ok: true, valor: v };
}

/**
 * Roda um conjunto de validações e devolve o 1º erro (ou null).
 * `regras` = array de `{ ok, erro }` já resolvidos.
 */
export function primeiroErro(regras) {
  for (const r of regras) {
    if (r && r.ok === false) return r.erro || "Dado inválido.";
  }
  return null;
}
