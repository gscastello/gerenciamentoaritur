// Constantes de regra de negócio compartilhadas pelo domínio.
// Fonte única — nem a UI nem os services devem redefinir estes valores.

/** Status que efetivamente ocupam um lugar na viagem. */
export const OCUPA_VAGA = ["confirmada", "embarcado"];

/** Todos os status possíveis de uma reserva. */
export const STATUS = [
  "pendente",
  "confirmada",
  "embarcado",
  "cancelada",
  "nao_compareceu",
  "espera",
];

/** Tipos de reserva que NUNCA contam na lotação (fluxo humano). */
export const TIPOS_SEM_VAGA = ["frete", "encomenda"];

/** Cidades atendidas na rota padrão. Fora disso => reserva pendente. */
export const CIDADES_ATENDIDAS = ["sao luis", "cantanhede", "pirapemas"];
