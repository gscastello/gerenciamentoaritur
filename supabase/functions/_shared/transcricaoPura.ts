// supabase/functions/_shared/transcricaoPura.ts
//
// O vocabulário que vai com o áudio para a transcrição (issues #482 e #499) — puro, sem rede. Sem os nomes
// das ruas, "Eurico Ribeiro" virou "Rio Cur Ribeiro" na reserva e na base de lugares.

const CONTEXTO =
  "Mensagem de WhatsApp de um passageiro da AriTur, vans e ônibus entre São Luís, Pirapemas e Cantanhede (Maranhão). " +
  "Palavras comuns: passagem, vaga, ida, volta, amanhã, hoje, Rodoviária, Retorno, Pirapemas, Cantanhede, São Luís, " +
  "Bacabeira, Santa Rita, Miranda, Matões, Palmeiral, Povoado Sozinho, Campestre, Seu Ari.";

/** Até `maximo` nomes de lugares, sem repetir (maiúscula e acento não contam). */
export function contextoDaTranscricao(lugares: (string | null | undefined)[], maximo = 60): string {
  const vistos = new Set<string>();
  const nomes: string[] = [];
  for (const l of lugares) {
    const nome = String(l ?? "").replace(/\s+/g, " ").trim();
    const chave = nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    if (nome.length < 4 || vistos.has(chave)) continue;
    vistos.add(chave);
    nomes.push(nome);
    if (nomes.length >= maximo) break;
  }
  return nomes.length ? `${CONTEXTO} Ruas e lugares daqui (escreva assim quando forem ditos): ${nomes.join(", ")}.` : CONTEXTO;
}

/**
 * A transcrição devolveu o próprio vocabulário no lugar da fala (issue #520): acontece com áudio curto, mudo ou
 * ruim. Marca do texto fixo, ou quase tudo tirado dele (sequências de 4 palavras), não é o que o cliente disse.
 */
export function ehEcoDoContexto(texto: string, contexto: string): boolean {
  const palavras = (t: string) =>
    t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const t = palavras(texto);
  const junto = ` ${t.join(" ")} `;
  if (/ (mensagem de whatsapp de um passageiro|escreva assim quando forem dit|palavras comuns passagem vaga) ?/.test(junto)) return true;
  if (t.length < 8) return false;
  const c = palavras(contexto);
  const grupos = new Set<string>();
  for (let i = 0; i + 4 <= c.length; i++) grupos.add(c.slice(i, i + 4).join(" "));
  let iguais = 0;
  for (let i = 0; i + 4 <= t.length; i++) if (grupos.has(t.slice(i, i + 4).join(" "))) iguais++;
  return iguais / (t.length - 3) >= 0.6;
}
