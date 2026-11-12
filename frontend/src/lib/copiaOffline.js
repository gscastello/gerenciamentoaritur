// src/lib/copiaOffline.js
//
// Cópia da última leitura no próprio aparelho (issue #355): sem internet, a
// equipe ainda ABRE a Agenda e vê as reservas do jeito que estavam na última
// vez que o app falou com o servidor. É só para LER: gravar continua indo ao
// banco (vaga e preço são decididos lá), então nenhuma ação usa esta cópia.
//
// - Só guarda com "Permanecer conectado" ligado (aparelho de confiança).
// - Sair da conta apaga tudo (apagarCopias).
// - Cópia com mais de 7 dias é jogada fora.

const PREFIXO = "aritur:offline:";
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;
// mesma chave do "Permanecer conectado" de supabaseClient.js
const CHAVE_LEMBRAR = "aritur-remember-me";

function podeGuardar() {
  try {
    return localStorage.getItem(CHAVE_LEMBRAR) !== "0";
  } catch {
    return false;
  }
}

/** Joga fora as cópias velhas (mais de 7 dias). */
function limparVelhas(agora = Date.now()) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIXO)) continue;
      let em = 0;
      try {
        em = JSON.parse(localStorage.getItem(k))?.em ?? 0;
      } catch {
        /* cópia quebrada: sai também */
      }
      if (agora - em > VALIDADE_MS) localStorage.removeItem(k);
    }
  } catch {
    /* localStorage indisponível */
  }
}

/** Guarda `dados` como a última leitura de `chave`. Nunca lança. */
export function salvarCopia(chave, dados, agora = Date.now()) {
  if (!podeGuardar()) return;
  const valor = JSON.stringify({ em: agora, dados });
  try {
    localStorage.setItem(PREFIXO + chave, valor);
  } catch {
    // cheio: abre espaço com as velhas e tenta uma vez mais
    limparVelhas(agora);
    try {
      localStorage.setItem(PREFIXO + chave, valor);
    } catch {
      /* sem espaço: segue sem cópia */
    }
  }
}

/** Última leitura guardada de `chave`: `{ em, dados }` ou null. */
export function lerCopia(chave, agora = Date.now()) {
  if (!podeGuardar()) return null;
  try {
    const c = JSON.parse(localStorage.getItem(PREFIXO + chave));
    if (!c || typeof c.em !== "number" || agora - c.em > VALIDADE_MS) return null;
    return c;
  } catch {
    return null;
  }
}

/** Apaga todas as cópias (sair da conta). */
export function apagarCopias() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIXO)) localStorage.removeItem(k);
    }
  } catch {
    /* localStorage indisponível */
  }
}

/** true se o aparelho está sem rede ou o erro é de conexão (não de regra do banco). */
export function semRede(erro) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String(erro?.message ?? erro?.cause?.message ?? "").toLowerCase();
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|internet/.test(
    msg,
  );
}
