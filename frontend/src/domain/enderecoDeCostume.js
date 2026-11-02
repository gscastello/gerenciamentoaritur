// src/domain/enderecoDeCostume.js
//
// Agendamento rápido com o "endereço de costume" do cliente recorrente (#228).
// Quem decide QUAL é o costume é o banco (rpc_endereco_de_costume: fixado pela
// equipe ou o mais frequente no histórico) — aqui ficam só as regras puras de
// como mostrar e de como preencher o agendamento com ele. Preço e vaga NÃO
// são decididos aqui: o modal de nova reserva continua calculando o valor pela
// tabela e a RPC de criação decidindo a capacidade.

const SENTIDOS = ["ida", "volta"];

/** "Posto Carone · Prime Calhau, Bloco 3 → Pirapemas" (as partes que existirem). */
export function resumoDoCostume(costume, pontos = []) {
  if (!costume) return "";
  const ponto =
    pontos.find((p) => p.id === costume.route_point_code)?.nome ||
    costume.route_point_name ||
    costume.route_point_code ||
    "";
  const local = [costume.neighborhood, costume.detail].filter(Boolean).join(", ");
  const origem = [ponto, local].filter(Boolean).join(" · ");
  return costume.dropoff_location ? `${origem} → ${costume.dropoff_location}` : origem;
}

/** De onde veio o costume, em texto: "fixado pela equipe" ou "3× no histórico". */
export function origemDoCostume(costume) {
  if (!costume) return "";
  if (costume.fonte === "manual") return "fixado pela equipe";
  const vezes = Number(costume.vezes) || 0;
  return vezes > 1 ? `${vezes}× no histórico` : "última viagem";
}

/**
 * Sentido a destacar: o sugerido (oposto da última viagem) se o cliente tem
 * costume nele; senão o outro sentido, se tiver; senão null.
 */
export function sentidoDestacado(sugerido, costume) {
  const ordem = SENTIDOS.includes(sugerido)
    ? [sugerido, sugerido === "ida" ? "volta" : "ida"]
    : SENTIDOS;
  return ordem.find((d) => costume?.[d]) || null;
}

/**
 * Valores iniciais do modal de nova reserva a partir do costume. Se o ponto
 * guardado já não existe na configuração, o ponto fica vazio (o modal escolhe o
 * primeiro) e o endereço de embarque não é copiado para não ir parar no lugar errado.
 */
export function inicialDoAgendamento({ cliente, direcao, costume, trips, data }) {
  const pontos = trips?.[direcao]?.pontos || [];
  const ponto = pontos.find((p) => p.id === costume?.route_point_code);
  return {
    nome: cliente?.nome || "",
    telefone: cliente?.telefone || "",
    data,
    direcao,
    pontoId: ponto?.id || "",
    bairro: ponto?.campo === "bairro" ? costume?.neighborhood || "" : "",
    anotacao: ponto ? costume?.detail || "" : "",
    desembarque: costume?.dropoff_location || "",
    desembarqueArea: costume?.dropoff_area || "",
    pagamento: cliente?.pagamento_padrao || "dinheiro",
    aviso: ponto
      ? `Endereço de costume (${origemDoCostume(costume)}): ${resumoDoCostume(costume, pontos)}`
      : "O ponto de costume deste cliente não existe mais — escolha o ponto de embarque.",
  };
}

/** Formulário de edição do costume (campos de texto) a partir do que o banco devolveu. */
export function formularioDoCostume(costume, pontos = []) {
  return {
    pontoId: costume?.route_point_code || pontos[0]?.id || "",
    bairro: costume?.neighborhood || "",
    detalhe: costume?.detail || "",
    desembarque: costume?.dropoff_location || "",
  };
}

/** Confere o formulário antes de salvar; devolve a mensagem de erro ou null. */
export function erroDoFormularioDeCostume(form, pontos = []) {
  if (!form?.pontoId || !pontos.some((p) => p.id === form.pontoId)) {
    return "Escolha o ponto de embarque.";
  }
  return null;
}
