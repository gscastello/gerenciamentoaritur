// src/lib/paginas.js
//
// O Supabase (PostgREST) devolve no máximo 1.000 linhas por consulta e corta o resto SEM erro
// (issue #442: a janela da Agenda passou de 1.000 reservas e as mais novas sumiram do app). Para
// lista que pode passar disso, busca página a página (`range`) até vir uma página incompleta.
// A consulta precisa de ordem estável (ex.: criação + id), senão a mesma linha pode cair em duas
// páginas e outra em nenhuma.

const TAMANHO_DA_PAGINA = 1000;

/**
 * `montar()` devolve a consulta já com filtros e ordem (sem `range`/`limit`). Devolve
 * `{ data, error }`, como a própria consulta. `teto` = segurança contra laço sem fim.
 */
export async function buscarTodasAsPaginas(
  montar,
  { pagina = TAMANHO_DA_PAGINA, teto = 50000 } = {},
) {
  const linhas = [];
  for (let de = 0; de < teto; de += pagina) {
    const { data, error } = await montar().range(de, de + pagina - 1);
    if (error) return { data: null, error };
    const lote = data ?? [];
    linhas.push(...lote);
    if (lote.length < pagina) break;
  }
  return { data: linhas, error: null };
}
