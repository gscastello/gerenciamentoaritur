// src/domain/anotacaoRapida.js
//
// Reconhece o formato de anotação rápida da Agenda: uma linha só que cria
// a reserva direto no ponto/horário escolhido. Ordem:
//   NP  Endereço  telefone  Nome do passageiro
// Ex.:
//   "1P Cohatrac Rua 7 98999998888 Maria Silva"
//   "2P - Miranda - 98 8516-6052 - João"   (" - " entre as partes também vale)
//   "1P Cohatrac 98999998888"               (sem nome: como sempre foi)
//   "E 98999998888"                         (encomenda — ver parseAnotacaoEncomenda)
//
// A quantidade (NP) é opcional (assume 1). O telefone é o trecho numérico
// válido (DDD + número) no meio da linha: o que vem ANTES é o endereço
// (opcional — nem todo ponto precisa de um) e o que vem DEPOIS é o nome
// (opcional). Números do endereço ("Rua 7", "quadra 12") não atrapalham.

import { normalizar } from "./format.js";
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

// separador "NP - Endereço - telefone - Nome": " - " entre espaços vira espaço, e
// vírgula/ponto e vírgula colados no fim de uma palavra são ignorados.
function limparSeparadores(texto) {
  return texto
    .replace(/\s+[-–—]\s+/g, " ")
    .replace(/[,;]+(?=\s|$)/g, "")
    .replace(/^[-–—]+\s+|\s+[-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ehNumerico = (t) => /^[+\d().-]+$/.test(t) && /\d/.test(t);

/**
 * Acha o telefone na lista de palavras: entre as sequências de palavras
 * numéricas, a última que contém um telefone válido. Dentro dela, o MENOR
 * trecho válido sem prefixo de país — assim "Rua 7 98999998888" deixa o 7 no
 * endereço. "+55" colado antes do DDD entra no telefone.
 */
function acharTelefone(palavras) {
  const sequencias = [];
  let atual = null;
  palavras.forEach((p, i) => {
    if (ehNumerico(p)) {
      if (!atual) {
        atual = { ini: i, fim: i };
        sequencias.push(atual);
      } else atual.fim = i;
    } else atual = null;
  });

  let ultimoErro = null;
  for (const seq of [...sequencias].reverse()) {
    let comPais = null;
    for (let ini = seq.fim; ini >= seq.ini; ini -= 1) {
      const trecho = palavras.slice(ini, seq.fim + 1).join(" ");
      const v = validarTelefone(trecho);
      const digitos = trecho.replace(/\D/g, "");
      if (v.ok && digitos.length === v.valor.length) {
        // menor trecho válido (sem prefixo de país); "+55" logo antes entra junto
        const antes = ini > 0 ? palavras[ini - 1] : "";
        return { ini: /^\+55$/.test(antes) ? ini - 1 : ini, fim: seq.fim, valor: v.valor };
      }
      if (v.ok && !comPais) comPais = { ini, fim: seq.fim, valor: v.valor };
      if (!v.ok) ultimoErro = ultimoErro ?? v.erro;
    }
    if (comPais) return comPais;
  }
  return { erro: ultimoErro };
}

/**
 * @param {string} textoBruto
 * @returns {{ok:true, quantidade:number, local:string, telefone:string, nome:string} | {ok:false, erro:string}}
 */
export function parseAnotacaoRapida(textoBruto) {
  const texto = String(textoBruto ?? "")
    .replace(RE_INVISIVEIS, "")
    .trim();
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

  const palavras = limparSeparadores(resto).split(" ").filter(Boolean);
  const achado = acharTelefone(palavras);
  if (!achado.valor) {
    return {
      ok: false,
      erro: achado.erro ?? "Não encontrei um telefone na anotação.",
    };
  }

  return {
    ok: true,
    quantidade,
    local: palavras.slice(0, achado.ini).join(" "),
    telefone: achado.valor,
    nome: palavras.slice(achado.fim + 1).join(" "),
  };
}

/**
 * Em "Buscar em casa" o endereço digitado começa pelo bairro ("Cohatrac Rua 7").
 * Separa o BAIRRO conhecido (maior começo do texto que bate com um bairro da
 * tabela de preços) do resto (rua, número, referência), para cobrar o valor
 * certo do bairro e guardar a rua como detalhe. Sem bairro conhecido, o texto
 * todo fica como bairro (como sempre foi).
 */
export function separarBairro(local, nomesDeBairros) {
  const palavras = String(local ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const conhecidos = new Set((nomesDeBairros ?? []).map(normalizar));
  for (let n = palavras.length; n >= 1; n -= 1) {
    const candidato = palavras.slice(0, n).join(" ");
    if (conhecidos.has(normalizar(candidato))) {
      return { bairro: candidato, detalhe: palavras.slice(n).join(" ") };
    }
  }
  return { bairro: palavras.join(" "), detalhe: "" };
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
  const texto = String(textoBruto ?? "")
    .replace(RE_INVISIVEIS, "")
    .trim();
  const mPrefixo = RE_ENCOMENDA_PREFIXO.exec(texto);
  if (!mPrefixo) {
    return { ok: false, erro: 'Comece com "E" pra anotar uma encomenda.', semPrefixo: true };
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
