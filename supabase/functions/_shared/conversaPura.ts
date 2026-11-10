// supabase/functions/_shared/conversaPura.ts
//
// Achar ou criar a conversa de um telefone sem falhar à toa (issue #280). Módulo
// PURO: quem chama passa as funções de busca, criação e espera.
//
// O erro antigo: a busca falhava de vez em quando (instabilidade passageira), o erro
// era ignorado, o código tentava criar a conversa de novo e batia no índice único
// (uq_wa_conversations_phone) — o evento inteiro era perdido. Agora:
//   - busca com erro → espera um pouco e tenta de novo;
//   - criação que bate no índice único (23505) → a conversa já existe: busca de novo;
//   - outro erro de criação → falha de verdade (sobe).

export type Resultado<T> = { data: T | null; error: { message: string; code?: string } | null };

export class FalhaAoResolverConversa extends Error {}

/** Código do Postgres para violação de unicidade. */
export const VIOLACAO_DE_UNICIDADE = "23505";

export async function acharOuCriar<T>(
  buscar: () => Promise<Resultado<T>>,
  criar: () => Promise<Resultado<T>>,
  opcoes: { tentativas?: number; esperar?: (ms: number) => Promise<void>; avisar?: (motivo: string, erro: string) => void } = {},
): Promise<T> {
  const tentativas = opcoes.tentativas ?? 3;
  const esperar = opcoes.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let ultimoErro = "";
  for (let i = 0; i < tentativas; i++) {
    if (i > 0) await esperar(150 * i);
    const achada = await buscar();
    if (achada.data) return achada.data;
    if (achada.error) {
      // não dá para saber se a conversa existe: tenta a busca de novo antes de criar
      ultimoErro = achada.error.message;
      opcoes.avisar?.("conversa_busca_falhou", ultimoErro);
      continue;
    }
    const criada = await criar();
    if (criada.data) return criada.data;
    ultimoErro = criada.error?.message ?? "sem retorno";
    if (criada.error?.code !== VIOLACAO_DE_UNICIDADE) break;
    // outra chamada criou ao mesmo tempo (ou a conversa já existia): a próxima busca acha
    opcoes.avisar?.("conversa_ja_existia", ultimoErro);
  }
  throw new FalhaAoResolverConversa(`Falha ao abrir a conversa: ${ultimoErro}`);
}
