// supabase/functions/_shared/opcoes.ts
//
// O Chatwoot não documenta botões/listas interativos do WhatsApp pro bot,
// então as opções (menu, pontos de embarque, reservas…) vão como texto
// numerado: "1 - Ida", "2 - Volta"… e o cliente responde com o número ou
// com o próprio nome da opção. Aqui ficam as duas pontas: formatar e
// resolver a resposta de volta no id que o motor de reservas espera.
//
// Módulo sem dependências de propósito (testável sem env vars).

export type Opcao = { id: string; title: string; description?: string };

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function formatarOpcoes(corpo: string, opcoes: Opcao[]): string {
  const linhas = opcoes.map((o, i) => `${i + 1} - ${o.title}${o.description ? ` (${o.description})` : ""}`);
  return `${corpo}\n\n${linhas.join("\n")}\n\nResponda com o número da opção.`;
}

/** Devolve o id da opção escolhida, ou null se o texto não é uma escolha. */
export function resolverOpcao(texto: string, opcoes: Opcao[] | null | undefined): string | null {
  if (!opcoes?.length) return null;
  const t = texto.trim();
  if (/^\d{1,2}$/.test(t)) {
    const idx = Number(t) - 1;
    return idx >= 0 && idx < opcoes.length ? opcoes[idx].id : null;
  }
  const alvo = semAcento(t);
  if (!alvo) return null;
  return opcoes.find((o) => semAcento(o.title) === alvo)?.id ?? null;
}
