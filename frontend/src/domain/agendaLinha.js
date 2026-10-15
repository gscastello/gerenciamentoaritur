// Regras de exibição da linha de reserva na Agenda.
//
// Nos pontos fixos (Rodoviária, Retorno, Posto Carone) o título da seção já
// diz onde o passageiro embarca — repetir o nome do ponto na frente do nome
// do passageiro é redundância (pedido do dono, issue #185). Nos demais
// (Buscar em casa, BR, Outro, volta) o endereço/bairro é a informação
// útil pro motorista e continua aparecendo.

const PONTOS_SO_NOME = new Set(["rodoviaria", "retorno", "postocarone"]);

/** Reserva num ponto fixo: a linha mostra só o nome do passageiro. */
export function pontoSoNome(pontoId) {
  return PONTOS_SO_NOME.has(pontoId);
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
