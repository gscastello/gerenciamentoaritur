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
