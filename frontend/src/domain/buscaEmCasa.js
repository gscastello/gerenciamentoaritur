// Regras da lista "Buscar em casa" da Agenda (issues #96, #196 e #198).
//
// Todo dia o dono reparte as reservas de "Buscar em casa" entre o táxi, o
// Gustavo, o Maurício e o Ari e repassa a lista (endereço + contato) a quem
// vai buscar. Aqui ficam as regras puras de ordem e agrupamento; a tela só
// desenha. Sem React, sem I/O.

/** Quem busca, na ordem em que aparecem nos botões e nos grupos. */
export const RESPONSAVEIS_BUSCA = ["taxi", "proprio", "motorista", "ari"];

/** Quem busca a reserva; qualquer valor desconhecido/ausente vale "taxi" (o padrão). */
export function responsavelDaBusca(r) {
  return RESPONSAVEIS_BUSCA.includes(r?.buscaPor) ? r.buscaPor : "taxi";
}

/**
 * Ordem da lista: posição salva (`buscaSeq`) primeiro; quem ainda não tem
 * posição vem depois, na ordem em que foi reservado. Estável e sem mutar.
 */
export function ordenarBusca(itens) {
  return [...itens].sort((a, b) => {
    const sa = a.buscaSeq ?? Number.POSITIVE_INFINITY;
    const sb = b.buscaSeq ?? Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa < sb ? -1 : 1;
    return String(a.criadoEm ?? "").localeCompare(String(b.criadoEm ?? ""));
  });
}

/** Move o id `delta` posições (−1 sobe, +1 desce). Nos limites, não muda nada. */
export function moverNaLista(ids, id, delta) {
  const de = ids.indexOf(id);
  const para = de + delta;
  if (de === -1 || para < 0 || para >= ids.length) return ids;
  const novo = [...ids];
  novo.splice(de, 1);
  novo.splice(para, 0, id);
  return novo;
}

/** Arrastar e soltar: tira o id de onde está e o coloca na posição do `destinoId`. */
export function moverParaPosicao(ids, id, destinoId) {
  const de = ids.indexOf(id);
  const para = ids.indexOf(destinoId);
  if (de === -1 || para === -1 || de === para) return ids;
  const novo = [...ids];
  novo.splice(de, 1);
  novo.splice(para, 0, id);
  return novo;
}

/**
 * Agrupa a ordem por responsável (Táxi → Gustavo → Maurício → Ari), mantendo
 * a ordem relativa dentro de cada grupo. `modoDe(id)` devolve o responsável.
 */
export function agruparPorResponsavel(ids, modoDe) {
  return RESPONSAVEIS_BUSCA.flatMap((modo) => ids.filter((id) => modoDe(id) === modo));
}

/** O que mudou entre o rascunho e o salvo: nova ordem (ou null) + ids por responsável. */
export function diferencasDaBusca({ original, ordem, modosOriginais, modos }) {
  const mudouOrdem = ordem.length !== original.length || ordem.some((id, i) => id !== original[i]);
  const porModo = {};
  for (const id of ordem) {
    if (modos[id] === modosOriginais[id]) continue;
    porModo[modos[id]] = [...(porModo[modos[id]] ?? []), id];
  }
  return {
    ordem: mudouOrdem ? ordem : null,
    atribuicoes: RESPONSAVEIS_BUSCA.filter((m) => porModo[m]).map((modo) => ({
      modo,
      ids: porModo[modo],
    })),
  };
}
