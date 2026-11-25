// supabase/functions/_shared/nomeParaChamar.ts
//
// Como chamar o passageiro (dono, 25/11 — issue #535): só pelo nome de verdade do cadastro. "Passageiro
// (campestre)", um lugar ("estrada matões…") ou um parentesco ("Mãe de Fulano") não são nome: cumprimenta sem
// nome. "Dona Maria" e "Seu Antônio" ficam com o tratamento. Módulo PURO.

const TRATAMENTOS = new Set(["dona", "dna", "seu", "sr", "sra", "senhor", "senhora", "dr", "dra", "prof", "pastor", "pastora", "irmao", "irma", "tia", "tio"]);
const NAO_E_NOME = new Set([
  "passageiro", "passageira", "passageiros", "cliente", "contato", "sem", "nome", "numero", "novo", "nova", "encomenda",
  "mae", "pai", "filho", "filha", "esposa", "esposo", "marido", "mulher", "primo", "prima", "sobrinho", "sobrinha", "cunhado", "cunhada",
  "amigo", "amiga", "vizinho", "vizinha", "casal", "rapaz", "moca", "menino", "menina", "familia",
  "rua", "r", "av", "avenida", "travessa", "beco", "praca", "estrada", "bairro", "casa", "condominio", "residencial", "povoado",
  "perto", "prox", "proximo", "em", "na", "no", "atras", "lado", "posto", "retorno", "rodoviaria", "br", "entrada", "taxi",
]);
const semAcento = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[.,;:]+$/, "");
const capitalizar = (p: string) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();

/** "Maria da Silva" → "Maria"; "dona maria" → "Dona Maria"; sem nome de verdade → null. */
export function nomeParaChamar(nome: string | null | undefined): string | null {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  const bom = (p: string | undefined) => !!p && p.length >= 2 && !/[\d()@/]/.test(p) && !NAO_E_NOME.has(semAcento(p));
  const primeiro = partes[0];
  if (!bom(primeiro)) return null;
  if (TRATAMENTOS.has(semAcento(primeiro))) {
    const segundo = partes[1];
    // "Irmã de Abraão" é parentesco; "Irmão Zé" é tratamento
    return bom(segundo) && !["de", "do", "da"].includes(semAcento(segundo)) ? `${capitalizar(primeiro)} ${capitalizar(segundo)}` : null;
  }
  return capitalizar(primeiro);
}

/** Para o modelo da Meta, que exige a palavra depois de "Olá, ": o nome, ou a saudação da hora. */
export function nomeOuSaudacao(nome: string | null | undefined, agora: Date = new Date()): string {
  const chamar = nomeParaChamar(nome);
  if (chamar) return chamar;
  const hora = new Date(agora.getTime() - 3 * 3600_000).getUTCHours();
  return hora < 5 || hora >= 18 ? "boa noite" : hora < 12 ? "bom dia" : "boa tarde";
}
