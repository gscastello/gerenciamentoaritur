// src/domain/anotacaoRapida.js
//
// Reconhece o formato de anotação rápida da Agenda: uma linha só que cria
// a reserva direto no ponto/horário escolhido. Ordem:
//   NP  Endereço  telefone  Nome do passageiro
// Ex.:
//   "1P Cohatrac Rua 7 98999998888 Maria Silva"
//   "2P - Miranda - 98 8516-6052 - João"   (" - " entre as partes também vale)
//   "1P Cohatrac 98999998888"               (sem nome: como sempre foi)
//   "1P Maria Silva"                        (só o nome, sem telefone — issue #404)
//   "E Rua 7 Centro 98999998888"            (encomenda — ver parseAnotacaoEncomenda)
//
// A quantidade (NP) é opcional (assume 1). O telefone é o trecho numérico
// válido (DDD + número) no meio da linha: o que vem ANTES é o endereço
// (opcional — nem todo ponto precisa de um) e o que vem DEPOIS é o nome
// (opcional). Números do endereço ("Rua 7", "quadra 12") não atrapalham.

import { normalizar } from "./format.js";
import { validarTelefone } from "./validacao.js";

const RE_QUANTIDADE = /^\s*(\d{1,2})\s*p\.?\s+/i;
const RE_ENCOMENDA_PREFIXO = /^\s*e\.?\s+/i;
// WhatsApp/iOS "linkam" o telefone ao detectar o número e, ao colar o
// texto copiado, vêm junto marcas de controle bidirecional invisíveis
// (LRM, isolamento direcional etc.) grudadas no fim do número. O
// telefone aparece certinho pra quem lê, mas essas marcas ficam depois
// do último dígito e atrapalham a leitura do telefone.
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
  if (!texto) return { ok: false, erro: "Escreva o nome ou o telefone do passageiro." };

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
    // só o nome (issue #404): sem número nenhum, o texto é o passageiro. Com números e sem
    // telefone válido, quase sempre é telefone digitado errado — avisa
    if (palavras.length && !palavras.some((p) => /\d/.test(p))) {
      return {
        ok: true,
        quantidade,
        local: "",
        telefone: "",
        nome: palavras.join(" "),
        semTelefone: true,
      };
    }
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
 * Anotação só com o nome (issue #404). Em "Buscar em casa", um bairro da tabela no
 * começo é o bairro ("1P Cohatrac Maria Silva"); o resto é o nome. Sem nome = erro.
 * @returns {{ok:true, bairro:string, nome:string} | {ok:false, erro:string}}
 */
export function nomeDaAnotacaoSemTelefone(texto, { ehBairro = false, nomesDeBairros = [] } = {}) {
  const palavras = String(texto ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const conhecidos = new Set((nomesDeBairros ?? []).map(normalizar));
  let bairro = "";
  let resto = palavras;
  if (ehBairro) {
    for (let n = palavras.length; n >= 1; n -= 1) {
      if (conhecidos.has(normalizar(palavras.slice(0, n).join(" ")))) {
        bairro = palavras.slice(0, n).join(" ");
        resto = palavras.slice(n);
        break;
      }
    }
  }
  const nome = resto.join(" ");
  if (nome.length < 2) return { ok: false, erro: "Escreva o nome ou o telefone do passageiro." };
  return { ok: true, bairro, nome };
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
 * Anotação rápida de ENCOMENDA (issue #246): "E <endereço de busca> <telefone> <nome>".
 * O "E" no início distingue de uma anotação de passagem. Só o endereço onde
 * vamos BUSCAR a encomenda e o telefone do contato são exigidos; o nome depois
 * do telefone é opcional, e entrega, item e o resto se completam editando.
 * @param {string} textoBruto
 * @returns {{ok:true, endereco:string, telefone:string, nome:string} | {ok:false, erro:string, semPrefixo?:boolean}}
 */
export function parseAnotacaoEncomenda(textoBruto) {
  const texto = String(textoBruto ?? "")
    .replace(RE_INVISIVEIS, "")
    .trim();
  const mPrefixo = RE_ENCOMENDA_PREFIXO.exec(texto);
  if (!mPrefixo) {
    return { ok: false, erro: 'Comece com "E" pra anotar uma encomenda.', semPrefixo: true };
  }
  const linha = parseLinhaEncomenda(texto.slice(mPrefixo[0].length));
  if (!linha.ok) return linha;
  if (!linha.telefone) {
    const palavras = limparSeparadores(texto.slice(mPrefixo[0].length)).split(" ");
    return {
      ok: false,
      erro: acharTelefone(palavras).erro ?? "Não encontrei um telefone na anotação.",
    };
  }
  if (!linha.endereco)
    return { ok: false, erro: "Escreva o endereço onde vamos buscar a encomenda." };
  return linha;
}

/**
 * Linha rápida da NOVA ENCOMENDA: "<endereço de busca> <telefone> <nome>" (issue #246).
 * O endereço é onde vamos BUSCAR a encomenda; com o telefone do contato, é o
 * que basta de início. O nome vem depois do telefone (opcional) e o resto
 * (entrega, item…) se completa editando. Sem telefone válido, o texto todo é o
 * endereço — o formulário preenche o que der enquanto a pessoa digita.
 * @param {string} textoBruto
 * @returns {{ok:true, endereco:string, telefone:string, nome:string} | {ok:false, erro:string}}
 */
export function parseLinhaEncomenda(textoBruto) {
  const texto = String(textoBruto ?? "")
    .replace(RE_INVISIVEIS, "")
    .trim();
  if (!texto) return { ok: false, erro: "Escreva o endereço onde vamos buscar a encomenda." };

  const palavras = limparSeparadores(texto).split(" ").filter(Boolean);
  const achado = acharTelefone(palavras);
  if (!achado.valor) {
    return { ok: true, endereco: palavras.join(" "), telefone: "", nome: "" };
  }
  return {
    ok: true,
    endereco: palavras.slice(0, achado.ini).join(" "),
    telefone: achado.valor,
    nome: palavras.slice(achado.fim + 1).join(" "),
  };
}

/**
 * O texto ANTES do telefone é o nome do passageiro já cadastrado com esse telefone?
 * ("1P Nadir 98…" com o cadastro "Nadir" ou "Nadir Souza"). Aí ele é o nome, não o
 * local de embarque (issue #347). Cadastro provisório "Passageiro (…)" não conta.
 */
export function localEhONome(local, nomeCadastrado) {
  const l = normalizar(local).split(/\s+/).filter(Boolean);
  const nomeLimpo = String(nomeCadastrado ?? "");
  if (!l.length || !nomeLimpo.trim() || /^passageiro\b/i.test(nomeLimpo.trim())) return false;
  const n = normalizar(nomeLimpo).split(/\s+/).filter(Boolean);
  return l.length <= n.length && l.every((p, i) => p === n[i]);
}
