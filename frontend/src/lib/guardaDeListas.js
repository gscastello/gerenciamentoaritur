// src/lib/guardaDeListas.js
//
// Guarda contra lista cortada (issue #444, depois da #442). O Supabase (PostgREST) devolve no
// máximo 1.000 linhas por consulta e corta o resto SEM erro. Toda lista que pode passar disso
// usa `buscarTodasAsPaginas` (lib/paginas.js); esta guarda é a rede de segurança para a consulta
// que esquecer: olha a resposta de cada leitura e, se vieram 1.000 linhas ou mais num pedido que
// não é de página (`offset`), avisa — a tela mostra uma faixa e o erro vai para o registro.
// Nunca mexe na resposta nem derruba a leitura.

const LIMITE_DO_SERVIDOR = 1000;
export const EVENTO_LISTA_CORTADA = "aritur:lista-cortada";

/** Quantas linhas a resposta trouxe, pelo cabeçalho `Content-Range` ("0-999/*"). */
function linhasDaResposta(contentRange) {
  const m = /^(\d+)-(\d+)\//.exec(String(contentRange ?? ""));
  return m ? Number(m[2]) - Number(m[1]) + 1 : 0;
}

/**
 * Nome da tabela/visão/função quando a leitura veio cortada; senão, null. Leitura em páginas
 * (`offset` no pedido) nunca conta: quem pagina já busca o resto.
 */
export function listaCortada({ metodo, url, contentRange }) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return null;
  }
  const caminho = /\/rest\/v1\/(.+)$/.exec(u.pathname)?.[1];
  if (!caminho) return null;
  const ehRpc = caminho.startsWith("rpc/");
  const m = String(metodo ?? "GET").toUpperCase();
  if (m !== "GET" && !(ehRpc && m === "POST")) return null;
  if (u.searchParams.has("offset")) return null;
  return linhasDaResposta(contentRange) >= LIMITE_DO_SERVIDOR ? caminho : null;
}

/** `fetch` com a guarda: avisa (evento na janela) quando uma leitura veio cortada. */
export function fetchComGuarda(fetchBase = (...a) => fetch(...a)) {
  return async (entrada, opcoes) => {
    const resposta = await fetchBase(entrada, opcoes);
    try {
      const tabela = listaCortada({
        metodo: opcoes?.method ?? entrada?.method,
        url: typeof entrada === "string" ? entrada : (entrada?.url ?? String(entrada)),
        contentRange: resposta.headers?.get?.("content-range"),
      });
      if (tabela && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(EVENTO_LISTA_CORTADA, { detail: { tabela } }));
      }
    } catch {
      // a guarda nunca pode derrubar a leitura
    }
    return resposta;
  };
}
