// Regras de exibição da linha de reserva na Agenda.
//
// Nos pontos fixos (Rodoviária, Retorno, Posto Carone) e em toda a VOLTA
// (Cantanhede, Pirapemas…) o título da seção já diz a cidade/ponto —
// repeti-lo na linha do passageiro é redundância (issues #185 e #189). Nos
// demais (Buscar em casa, BR, Outro) o endereço/bairro é a informação útil
// pro motorista e continua aparecendo.

const PONTOS_SO_NOME = new Set(["rodoviaria", "retorno", "postocarone"]);

/** Reserva cujo ponto o título da seção já diz: a linha não repete o nome do ponto. */
export function pontoSoNome(r) {
  return r?.direcao === "volta" || PONTOS_SO_NOME.has(r?.pontoId);
}

/**
 * Detalhe a mostrar abaixo do nome quando o ponto é só-nome: rua, local
 * exato e referência (o que o passageiro informou além do ponto fixo).
 */
export function detalheDoPonto(r) {
  return [r?.rua, r?.localExato, r?.referencia && `ref.: ${r.referencia}`]
    .filter(Boolean)
    .join(" · ");
}

/** (98) 98765-4321 — número digitado/colado de qualquer jeito vira o formato de leitura. */
export function formatarTelefoneBR(valor) {
  const d = String(valor ?? "").replace(/\D/g, "");
  const nacional = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  if (nacional.length === 11)
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  if (nacional.length === 10)
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  return String(valor ?? "").trim();
}

/**
 * Texto que o dono repassa aos taxistas: endereço + número de contato (e o
 * secundário, se houver). Mais de uma passagem aparece no fim do endereço.
 */
export function textoParaTaxista({ endereco, telefone, telefone2, quantidade }) {
  const qtd = Number(quantidade) > 1 ? ` (${quantidade} passagens)` : "";
  const fones = [telefone, telefone2].filter(Boolean).map(formatarTelefoneBR).join(" / ");
  return `${endereco || "endereço não informado"}${qtd}${fones ? ` — ${fones}` : ""}`;
}

/** Lista numerada (uma reserva por linha) para colar de uma vez numa mensagem. */
export function textoDaListaDeBusca(itens) {
  return itens.map((i, n) => `${n + 1}) ${textoParaTaxista(i)}`).join("\n");
}
