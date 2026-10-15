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
