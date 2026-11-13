// src/domain/listaDesembarque.js
//
// Lista de desembarque anotada à mão durante a viagem (issue #383). Decisões do
// dono: começa em branco e NÃO muda a reserva — é só o registro da viagem.
//
// O aparelho grava primeiro em si mesmo (na estrada o sinal cai) e envia depois.
// Dois aparelhos podem anotar a mesma viagem, então juntar as listas é por linha:
// para cada id fica a versão com o `em` mais recente. Apagar é marcar `apagada`
// (a linha apagada num aparelho não volta pelo outro). É a MESMA regra de
// rpc_salvar_lista_desembarque (database/106).

export const MAX_TEXTO = 200;

/** Uma linha nova. `id` e `agora` vêm de fora para o teste ser previsível. */
export function novaLinha(texto, { id, agora }) {
  const t = String(texto ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXTO);
  if (!t) return null;
  const em = new Date(agora).toISOString();
  return { id, texto: t, feito: false, apagada: false, criada: em, em };
}

/** Lista com a linha `id` mudada (texto, feito ou apagada). Texto vazio apaga. */
export function mudarLinha(lista, id, mudanca, agora) {
  const em = new Date(agora).toISOString();
  return (lista ?? []).map((l) => {
    if (l.id !== id) return l;
    const nova = { ...l, ...mudanca, em };
    if ("texto" in mudanca) {
      nova.texto = String(mudanca.texto ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_TEXTO);
      if (!nova.texto) nova.apagada = true;
    }
    return nova;
  });
}

/** Junta duas versões da lista: por id, vale a mudança mais recente; ordem de criação. */
export function mesclarListas(a, b) {
  const porId = new Map();
  for (const l of [...(a ?? []), ...(b ?? [])]) {
    if (!l?.id || !l.em || !l.criada) continue;
    const atual = porId.get(l.id);
    if (!atual || l.em > atual.em) porId.set(l.id, l);
  }
  return [...porId.values()].sort(
    (x, y) => x.criada.localeCompare(y.criada) || x.id.localeCompare(y.id),
  );
}

/** As linhas que aparecem (sem as apagadas). */
export function linhasVisiveis(lista) {
  return (lista ?? []).filter((l) => !l.apagada);
}

/** Quantas linhas e quantas já marcadas. */
export function resumoDaLista(lista) {
  const v = linhasVisiveis(lista);
  return { total: v.length, feitas: v.filter((l) => l.feito).length };
}

/** A lista local tem algo que o banco ainda não tem? */
export function temPendente(local, remota) {
  const doBanco = new Map((remota ?? []).map((l) => [l.id, l.em]));
  return (local ?? []).some((l) => !doBanco.has(l.id) || doBanco.get(l.id) < l.em);
}
