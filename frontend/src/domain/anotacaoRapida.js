// src/domain/anotacaoRapida.js
//
// Reconhece o formato de anotação rápida da Agenda: uma linha só que cria
// a reserva direto no ponto/horário escolhido. Ex.:
//   "1P Cohatrac 98999998888"
//   "2p Miranda +55 98 8516-6052"
//   "E 98999998888"                (encomenda — ver parseAnotacaoEncomenda)
//
// Formato: "<quantidade>P <local/bairro> <telefone>". A quantidade é
// opcional (assume 1 quando não vem na frente); o telefone é sempre o
// último trecho numérico da linha; o que sobra no meio é o local/bairro
// (também opcional — nem todo ponto precisa de um).

import { validarTelefone } from "./validacao.js";

const RE_QUANTIDADE = /^\s*(\d{1,2})\s*p\.?\s+/i;
const RE_ENCOMENDA_PREFIXO = /^\s*e\.?\s+/i;
// telefone = último trecho que começa em dígito/"+" e só tem dígito,
// espaço, parênteses, ponto ou traço até o fim da linha.
const RE_TELEFONE_FINAL = /([+\d][\d\s().-]*\d)\s*$/;
// WhatsApp/iOS "linkam" o telefone ao detectar o número e, ao colar o
// texto copiado, vêm junto marcas de controle bidirecional invisíveis
// (LRM, isolamento direcional etc.) grudadas no fim do número. O
// telefone aparece certinho pra quem lê, mas essas marcas ficam depois
// do último dígito e quebram a âncora de fim de linha do regex acima.
const RE_INVISIVEIS = /[​-‏‪-‮⁦-⁩﻿]/g;

/**
 * @param {string} textoBruto
 * @returns {{ok:true, quantidade:number, local:string, telefone:string} | {ok:false, erro:string}}
 */
export function parseAnotacaoRapida(textoBruto) {
  const texto = String(textoBruto ?? "").replace(RE_INVISIVEIS, "").trim();
  if (!texto) return { ok: false, erro: "Escreva ao menos o telefone do passageiro." };

  let quantidade = 1;
  let resto = texto;
  const mQtd = RE_QUANTIDADE.exec(texto);
  if (mQtd) {
    quantidade = Number.parseInt(mQtd[1], 10);
    resto = texto.slice(mQtd[0].length);
  }
  if (quantidade < 1 || quantidade > 60) {
    return { ok: false, erro: "Quantidade inválida — revise o número antes do P." };
  }

  const mFone = RE_TELEFONE_FINAL.exec(resto);
  if (!mFone) {
    return { ok: false, erro: "Não encontrei um telefone no final do texto." };
  }
  const telefone = validarTelefone(mFone[1]);
  if (!telefone.ok) {
    return { ok: false, erro: telefone.erro };
  }

  const local = resto.slice(0, mFone.index).trim().replace(/\s+/g, " ");

  return { ok: true, quantidade, local, telefone: telefone.valor };
}

/**
 * Anotação rápida de ENCOMENDA: "E <item opcional> <telefone>". O "E" no
 * início distingue de uma anotação de passagem comum (sem prefixo, ou
 * "<n>P"); o ponto de embarque é o da caixinha onde foi digitado, então
 * não faz parte do texto — só sobra item (opcional) + telefone de quem
 * recebe.
 * @param {string} textoBruto
 * @returns {{ok:true, item:string, telefone:string} | {ok:false, erro:string, semPrefixo?:boolean}}
 */
export function parseAnotacaoEncomenda(textoBruto) {
  const texto = String(textoBruto ?? "").replace(RE_INVISIVEIS, "").trim();
  const mPrefixo = RE_ENCOMENDA_PREFIXO.exec(texto);
  if (!mPrefixo) {
    return { ok: false, erro: "Comece com \"E\" pra anotar uma encomenda.", semPrefixo: true };
  }

  const resto = texto.slice(mPrefixo[0].length);
  const mFone = RE_TELEFONE_FINAL.exec(resto);
  if (!mFone) {
    return { ok: false, erro: "Não encontrei um telefone no final do texto." };
  }
  const telefone = validarTelefone(mFone[1]);
  if (!telefone.ok) {
    return { ok: false, erro: telefone.erro };
  }

  const item = resto.slice(0, mFone.index).trim().replace(/\s+/g, " ");

  return { ok: true, item, telefone: telefone.valor };
}
