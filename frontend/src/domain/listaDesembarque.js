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

/**
 * Posição da linha na lista (issue #440): a `ordem` dada em "Organizar" ou, sem ela, a hora em que
 * foi anotada (ms). A ordem é de cada linha, então mover uma linha só muda essa linha.
 */
export function posicaoDaLinha(l) {
  return typeof l?.ordem === "number" && Number.isFinite(l.ordem)
    ? l.ordem
    : Date.parse(l?.criada) || 0;
}

const naOrdem = (x, y) =>
  posicaoDaLinha(x) - posicaoDaLinha(y) ||
  x.criada.localeCompare(y.criada) ||
  x.id.localeCompare(y.id);

/** Junta duas versões da lista: por id, vale a mudança mais recente; na ordem das posições. */
export function mesclarListas(a, b) {
  const porId = new Map();
  for (const l of [...(a ?? []), ...(b ?? [])]) {
    if (!l?.id || !l.em || !l.criada) continue;
    const atual = porId.get(l.id);
    if (!atual || l.em > atual.em) porId.set(l.id, l);
  }
  return [...porId.values()].sort(naOrdem);
}

// Índices da maior sequência de posições crescentes: essas linhas ficam onde estão.
function quemFica(posicoes) {
  const n = posicoes.length;
  const tam = new Array(n).fill(1);
  const antes = new Array(n).fill(-1);
  let fim = n ? 0 : -1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (posicoes[j] < posicoes[i] && tam[j] + 1 > tam[i]) {
        tam[i] = tam[j] + 1;
        antes[i] = j;
      }
    }
    if (tam[i] > tam[fim]) fim = i;
  }
  const fica = new Set();
  for (let i = fim; i >= 0; i = antes[i]) fica.add(i);
  return fica;
}

const PASSO = 1000;

/**
 * A lista na ordem `ids` (as linhas visíveis, de cima para baixo), mudando o mínimo de linhas:
 * as que já estão em ordem ficam; as outras ganham uma posição entre as vizinhas. Só a linha que
 * mudou de posição ganha `em` novo. Sem espaço entre as vizinhas, renumera todas.
 */
export function reordenarLinhas(lista, ids, agora) {
  const porId = new Map((lista ?? []).map((l) => [l.id, l]));
  const linhas = (ids ?? []).map((id) => porId.get(id)).filter(Boolean);
  const pos = linhas.map(posicaoDaLinha);
  const fica = quemFica(pos);
  const nova = [...pos];
  for (let i = 0; i < linhas.length; ) {
    if (fica.has(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < linhas.length && !fica.has(j)) j++;
    const k = j - i;
    const de = i > 0 ? pos[i - 1] : null;
    const ate = j < linhas.length ? pos[j] : null;
    for (let m = 0; m < k; m++) {
      if (de !== null && ate !== null) nova[i + m] = de + ((ate - de) * (m + 1)) / (k + 1);
      else if (de !== null) nova[i + m] = de + PASSO * (m + 1);
      else nova[i + m] = ate - PASSO * (k - m);
    }
    i = j;
  }
  const semEspaco = nova.some((p, i) => i > 0 && !(p > nova[i - 1]));
  const posicao = new Map(linhas.map((l, i) => [l.id, semEspaco ? (i + 1) * PASSO : nova[i]]));
  const em = new Date(agora).toISOString();
  return (lista ?? [])
    .map((l) =>
      posicao.has(l.id) && posicao.get(l.id) !== posicaoDaLinha(l)
        ? { ...l, ordem: posicao.get(l.id), em }
        : l,
    )
    .sort(naOrdem);
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

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * O que foi anotado, para copiar e colar no WhatsApp (issue #440): o cabeçalho com o sentido e o
 * dia, e as linhas na ordem da tela, numeradas; quem já desceu leva ✓.
 */
export function textoDaListaAnotada(lista, { data, direcao }) {
  const linhas = linhasVisiveis(lista);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(data ?? ""))
    ? ` · ${SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()]}, ${data.slice(8, 10)}/${data.slice(5, 7)}`
    : "";
  const cabecalho = `Desembarque · ${direcao === "volta" ? "Volta" : "Ida"}${dia}`;
  return [cabecalho, ...linhas.map((l, i) => `${i + 1}. ${l.texto}${l.feito ? " ✓" : ""}`)].join(
    "\n",
  );
}
