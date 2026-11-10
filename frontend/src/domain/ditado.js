// src/domain/ditado.js
//
// Anotação por VOZ (issue #258). O reconhecimento de voz do navegador devolve
// a fala em texto corrido ("uma passagem Cohatrac telefone 98 98888 7777 nome
// Maria"); aqui ela vira o formato da anotação rápida ("1P Cohatrac 98 98888
// 7777 Maria"), que domain/anotacaoRapida.js já sabe ler. Puro, sem React.

const NUMEROS = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

const semAcento = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "");

// palavras que a pessoa fala para se orientar, mas não fazem parte da anotação
const ROTULOS = new Set(["telefone", "fone", "celular", "numero", "contato", "nome", "endereco"]);

const RE_QUANTIDADE =
  /^(\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(passagem|passagens|pessoas?|lugares|lugar|vagas?)\b\s*/;

/**
 * Fala → anotação rápida. "encomenda …" vira "E …"; "duas passagens …" vira
 * "2P …"; "passagem …" vira "1P …". Rótulos falados ("telefone", "nome",
 * "endereço"…) saem; o resto fica como foi dito, para a pessoa conferir.
 * @param {string} fala
 * @returns {string}
 */
export function ditadoParaAnotacao(fala) {
  const t = String(fala ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "");
  if (!t) return "";

  const chave = semAcento(t.toLowerCase());
  let prefixo = "";
  let resto = t;

  const mEnc = /^encomendas?\b\s*(de|da|do|para|pra)?\s*/.exec(chave);
  if (mEnc) {
    prefixo = "E";
    resto = t.slice(mEnc[0].length);
  } else {
    const mQtd = RE_QUANTIDADE.exec(chave);
    if (mQtd) {
      const n = /^\d+$/.test(mQtd[1]) ? Number(mQtd[1]) : NUMEROS[mQtd[1]];
      prefixo = `${n}P`;
      resto = t.slice(mQtd[0].length);
    } else {
      const mUma = /^passagem\b\s*(de|da|do|para|pra)?\s*/.exec(chave);
      if (mUma) {
        prefixo = "1P";
        resto = t.slice(mUma[0].length);
      }
    }
  }

  // tira os rótulos (comparando sem acento), preservando o resto como foi dito
  const limpo = resto
    .split(" ")
    .filter((palavra) => !ROTULOS.has(semAcento(palavra.toLowerCase()).replace(/:$/, "")))
    .join(" ");

  return [prefixo, limpo].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
