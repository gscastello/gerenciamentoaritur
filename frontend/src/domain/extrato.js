// src/domain/extrato.js
//
// Conferência do extrato do banco (issue #364). O dono manda o extrato do mês
// (OFX ou CSV — InfinitePay e outros bancos); o app guarda os movimentos
// (database/104, sem repetir) e compara com os lançamentos do Financeiro e os
// pagamentos das reservas:
//   bate              — o movimento tem um lançamento igual (valor e ±3 dias);
//   bate_pagamento    — é o pagamento (Pix/cartão) de uma reserva já pago no app;
//   no_total_do_dia   — Pix de passageiro que cabe na receita lançada no dia
//                       (a receita costuma ser lançada como TOTAL do dia: não
//                       lance de novo, senão conta em dobro);
//   falta_lancar      — não tem par: lançar com um toque;
//   ignorada          — a pessoa marcou que não entra (transferência entre contas…).
// E do lado do app: em_dobro (lançamento repetido do mesmo movimento) e sem_par
// (lançado no app e não aparece no extrato).
// Tudo puro: sem React, sem I/O.

const FOLGA_DIAS = 3;
const CENTAVO = 0.005;

const semAcento = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

/** "1.234,56", "-50,00", "R$ 1234.56", "(50,00)", "50,00 D" → número (negativo = saída). */
export function numeroDoExtrato(texto) {
  let s = String(texto ?? "").trim();
  if (!s) return Number.NaN;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (/\s*[dD]$/.test(s)) {
    negativo = true;
    s = s.replace(/\s*[dD]$/, "");
  } else s = s.replace(/\s*[cC]$/, "");
  s = s.replace(/R\$/gi, "").replace(/\s/g, "");
  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const ultimoPonto = s.lastIndexOf(".");
  const ultimaVirgula = s.lastIndexOf(",");
  if (ultimoPonto >= 0 && ultimaVirgula >= 0) {
    s = ultimaVirgula > ultimoPonto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (ultimaVirgula >= 0) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return Number.NaN;
  const n = Math.round(Number(s) * 100) / 100;
  return negativo ? -n : n;
}

/** dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd, aaaammdd[hhmmss…] → "AAAA-MM-DD" ou null. */
export function dataDoExtrato(texto) {
  const s = String(texto ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})\b/);
  const ofx = s.match(/^(\d{4})(\d{2})(\d{2})/);
  let a;
  let m;
  let d;
  if (iso) [, a, m, d] = iso;
  else if (br) {
    [, d, m, a] = br;
    if (a.length === 2) a = `20${a}`;
  } else if (ofx) [, a, m, d] = ofx;
  else return null;
  const dt = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
  if (dt.getUTCMonth() !== Number(m) - 1 || dt.getUTCDate() !== Number(d)) return null;
  return `${a}-${m}-${d}`;
}

function tagOfx(bloco, nome) {
  const r = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  return r ? r[1].trim() : "";
}

/** Extrato OFX (SGML ou XML). */
export function lerOfx(texto) {
  const t = String(texto ?? "");
  const blocos = t.split(/<STMTTRN>/i).slice(1);
  const linhas = [];
  for (const b of blocos) {
    const bloco = b.split(/<\/STMTTRN>/i)[0];
    const data = dataDoExtrato(tagOfx(bloco, "DTPOSTED"));
    const valor = numeroDoExtrato(tagOfx(bloco, "TRNAMT"));
    if (!data || !Number.isFinite(valor) || valor === 0) continue;
    linhas.push({
      data,
      valor,
      descricao: (tagOfx(bloco, "MEMO") || tagOfx(bloco, "NAME")).replace(/\s+/g, " "),
      documento: tagOfx(bloco, "FITID") || null,
    });
  }
  const banco = tagOfx(t, "ORG") || tagOfx(t, "BANKID");
  const conta = tagOfx(t, "ACCTID");
  return {
    conta: [banco, conta ? `…${conta.slice(-4)}` : ""].filter(Boolean).join(" ") || null,
    linhas,
  };
}

/** Uma linha de CSV com aspas. */
function camposCsv(linha, sep) {
  const out = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      out.push(atual.trim());
      atual = "";
    } else atual += c;
  }
  out.push(atual.trim());
  return out;
}

const SAIDA_PELO_TIPO =
  /(d[eé]bito|sa[ií]da|enviad|pagamento|pago|compra|tarifa|saque|retirada|transfer[eê]ncia enviada)/i;

/** Extrato CSV: acha as colunas pelo cabeçalho (data, valor ou entrada/saída, descrição, tipo, documento). */
export function lerCsv(texto) {
  const linhasDoArquivo = String(texto ?? "")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const sepDe = (l) => [";", "\t", ","].sort((a, b) => l.split(b).length - l.split(a).length)[0];
  let cab = -1;
  let sep = ";";
  let col = {};
  for (let i = 0; i < Math.min(20, linhasDoArquivo.length); i++) {
    const s = sepDe(linhasDoArquivo[i]);
    const nomes = camposCsv(linhasDoArquivo[i], s).map(semAcento);
    const achar = (re, fora) => nomes.findIndex((n) => re.test(n) && !fora?.test(n));
    const c = {
      data: achar(/^(data|date|dt)\b/),
      valor: achar(/(valor|amount|quantia|montante|value)/, /saldo|tarifa|taxa|bruto/),
      entrada: achar(/^(entrada|credito|creditos)\b/),
      saida: achar(/^(saida|debito|debitos)\b/),
      descricao: achar(/(descri|historico|memo|lancamento|detalhe|nome|identifica)/),
      tipo: achar(/^(tipo|natureza|operacao|movimento)\b/),
      documento: achar(/^(documento|id|identificador|codigo|transacao|nsu|id da transacao)\b/),
    };
    if (c.data >= 0 && (c.valor >= 0 || c.entrada >= 0 || c.saida >= 0)) {
      cab = i;
      sep = s;
      col = c;
      break;
    }
  }
  if (cab < 0) {
    return { conta: null, linhas: [], erro: "Não achei as colunas de data e valor no arquivo." };
  }
  const brutas = linhasDoArquivo.slice(cab + 1).map((l) => camposCsv(l, sep));
  const valores = col.valor >= 0 ? brutas.map((f) => numeroDoExtrato(f[col.valor])) : [];
  // valor sempre positivo + coluna de tipo = o sinal vem do tipo
  const sinalPeloTipo = col.tipo >= 0 && col.valor >= 0 && !valores.some((v) => v < 0);
  const linhas = [];
  brutas.forEach((f, i) => {
    const data = dataDoExtrato(f[col.data]);
    if (!data) return;
    let valor;
    if (col.valor >= 0) {
      valor = valores[i];
      if (sinalPeloTipo && SAIDA_PELO_TIPO.test(f[col.tipo] ?? "")) valor = -Math.abs(valor);
    } else {
      const ent = col.entrada >= 0 ? numeroDoExtrato(f[col.entrada]) : Number.NaN;
      const sai = col.saida >= 0 ? numeroDoExtrato(f[col.saida]) : Number.NaN;
      valor = Number.isFinite(ent) && ent !== 0 ? Math.abs(ent) : -Math.abs(sai);
    }
    const descricao = [col.tipo >= 0 ? f[col.tipo] : "", col.descricao >= 0 ? f[col.descricao] : ""]
      .filter(Boolean)
      .join(" — ")
      .replace(/\s+/g, " ");
    if (!Number.isFinite(valor) || valor === 0 || /^saldo/i.test(semAcento(descricao))) return;
    linhas.push({
      data,
      valor,
      descricao,
      documento: col.documento >= 0 ? f[col.documento] || null : null,
    });
  });
  return { conta: null, linhas };
}

/** OFX ou CSV pelo conteúdo. A conta sem nome no arquivo fica com o nome do arquivo. */
export function lerExtrato(nomeArquivo, texto) {
  const ofx = /OFXHEADER|<OFX>|<STMTTRN>/i.test(String(texto ?? ""));
  const r = ofx ? lerOfx(texto) : lerCsv(texto);
  const doNome = String(nomeArquivo ?? "")
    .replace(/\.[^.]+$/, "")
    .trim();
  return {
    formato: ofx ? "ofx" : "csv",
    conta: r.conta || doNome || "Banco",
    linhas: r.linhas,
    erro: r.erro ?? (r.linhas.length === 0 ? "Nenhum movimento encontrado no arquivo." : null),
  };
}

/**
 * Chave de cada movimento para não guardar duas vezes: o id do banco (FITID)
 * quando existe; senão data + valor + descrição + a ordem entre iguais no arquivo.
 */
export function chavesDasLinhas(conta, linhas) {
  const vistos = {};
  return linhas.map((l) => {
    if (l.documento) return `${conta}|${l.documento}`;
    const base = `${conta}|${l.data}|${l.valor.toFixed(2)}|${semAcento(l.descricao)}`;
    vistos[base] = (vistos[base] ?? 0) + 1;
    return `${base}|${vistos[base]}`;
  });
}

const dia = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / 86400000;
const distancia = (a, b) => Math.abs(dia(a) - dia(b));
const tipoDoMovimento = (valor) => (valor > 0 ? "receita" : "despesa");

/**
 * Compara os movimentos com os lançamentos e os pagamentos.
 * linhas: { id, data, valor, descricao, financial_entry_id, ignorada }
 * lancamentos: { id, entry_date, type, amount, category, description }
 * pagamentos (pagos, Pix/cartão): { id, amount, paid_at, method }
 */
export function conciliar({ linhas, lancamentos, pagamentos = [], folgaDias = FOLGA_DIAS }) {
  const usadosL = new Set();
  const usadosP = new Set();
  const lancPorId = Object.fromEntries((lancamentos ?? []).map((l) => [l.id, l]));
  const res = new Map();
  const ordem = [...(linhas ?? [])].sort(
    (a, b) => a.data.localeCompare(b.data) || String(a.id).localeCompare(String(b.id)),
  );

  for (const l of ordem) {
    if (l.financial_entry_id) {
      usadosL.add(l.financial_entry_id);
      res.set(l.id, {
        situacao: "bate",
        par: lancPorId[l.financial_entry_id] ?? null,
        peloExtrato: true,
      });
    } else if (l.ignorada) res.set(l.id, { situacao: "ignorada" });
  }

  const mesmoValor = (a, b) => Math.abs(Math.abs(Number(a)) - Math.abs(Number(b))) < CENTAVO;
  for (const l of ordem) {
    if (res.has(l.id)) continue;
    const tipo = tipoDoMovimento(l.valor);
    const cand = (lancamentos ?? [])
      .filter(
        (x) =>
          !usadosL.has(x.id) &&
          x.type === tipo &&
          mesmoValor(x.amount, l.valor) &&
          distancia(x.entry_date, l.data) <= folgaDias,
      )
      .sort(
        (a, b) =>
          distancia(a.entry_date, l.data) - distancia(b.entry_date, l.data) ||
          String(a.id).localeCompare(String(b.id)),
      )[0];
    if (cand) {
      usadosL.add(cand.id);
      res.set(l.id, { situacao: "bate", par: cand });
      continue;
    }
    if (l.valor > 0) {
      const pag = (pagamentos ?? [])
        .filter(
          (p) =>
            !usadosP.has(p.id) &&
            mesmoValor(p.amount, l.valor) &&
            p.paid_at &&
            distancia(p.paid_at, l.data) <= folgaDias,
        )
        .sort((a, b) => distancia(a.paid_at, l.data) - distancia(b.paid_at, l.data))[0];
      if (pag) {
        usadosP.add(pag.id);
        res.set(l.id, { situacao: "bate_pagamento", pagamento: pag });
      }
    }
  }

  // Pix de passageiro dentro da receita lançada como total do dia
  const creditosSoltos = ordem.filter((l) => !res.has(l.id) && l.valor > 0);
  const porDia = {};
  for (const l of creditosSoltos) {
    if (!porDia[l.data]) porDia[l.data] = [];
    porDia[l.data].push(l);
  }
  for (const [data, doDia] of Object.entries(porDia)) {
    const receitas = (lancamentos ?? []).filter(
      (x) => !usadosL.has(x.id) && x.type === "receita" && x.entry_date === data,
    );
    const total = receitas.reduce((s, x) => s + Number(x.amount || 0), 0);
    const soma = doDia.reduce((s, l) => s + l.valor, 0);
    if (receitas.length > 0 && total >= soma - CENTAVO) {
      for (const x of receitas) usadosL.add(x.id);
      for (const l of doDia) res.set(l.id, { situacao: "no_total_do_dia", receitaDoDia: total });
    }
  }

  const resultado = ordem.map((l) => ({
    ...l,
    ...(res.get(l.id) ?? { situacao: "falta_lancar" }),
  }));

  // o lado do app, dentro do período do extrato
  const datas = ordem.map((l) => l.data);
  const de = datas[0];
  const ate = datas[datas.length - 1];
  const pares = resultado.filter((l) => l.situacao === "bate" && l.par);
  const sobrando = (lancamentos ?? []).filter(
    (x) => !usadosL.has(x.id) && de && x.entry_date >= de && x.entry_date <= ate,
  );
  const emDobro = sobrando.filter((x) =>
    pares.some(
      (l) =>
        l.par.type === x.type &&
        mesmoValor(l.par.amount, x.amount) &&
        distancia(l.par.entry_date, x.entry_date) <= folgaDias,
    ),
  );
  const dobro = new Set(emDobro.map((x) => x.id));
  // receita de passagens é lançada como total do dia e tem dinheiro: não é "sem par"
  const semPar = sobrando.filter(
    (x) => !dobro.has(x.id) && !(x.type === "receita" && x.category === "passagem"),
  );

  const conta = (s) => resultado.filter((l) => l.situacao === s).length;
  return {
    periodo: de ? { de, ate } : null,
    linhas: resultado,
    emDobro,
    semPar,
    resumo: {
      bate: conta("bate") + conta("bate_pagamento") + conta("no_total_do_dia"),
      falta: conta("falta_lancar"),
      ignoradas: conta("ignorada"),
      emDobro: emDobro.length,
      semPar: semPar.length,
      entradas:
        Math.round(ordem.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0) * 100) / 100,
      saidas:
        Math.round(ordem.filter((l) => l.valor < 0).reduce((s, l) => s - l.valor, 0) * 100) / 100,
    },
  };
}

/** O lançamento que um movimento vira ao tocar em "Lançar". */
export function lancamentoDoMovimento(linha, categoria) {
  const type = tipoDoMovimento(linha.valor);
  return {
    entryDate: linha.data,
    type,
    category: categoria || "outro",
    amount: Math.round(Math.abs(linha.valor) * 100) / 100,
    description: `${linha.descricao || "Movimento do extrato"} (extrato)`.slice(0, 300),
  };
}

/** Categoria sugerida pela descrição do banco (só sugestão; a pessoa troca). */
export function categoriaSugerida(linha) {
  const d = semAcento(linha.descricao);
  if (linha.valor > 0) return /pix|transfer|venda|recebid/.test(d) ? "passagem" : "outro";
  if (/posto|combust|diesel|gasolina|shell|ipiranga|petrobras|br mania/.test(d))
    return "combustivel";
  if (/oficina|pneu|mecan|auto pec|autopec|lubri/.test(d)) return "manutencao";
  if (/restaurante|lanch|padaria|aliment|mercado/.test(d)) return "alimentacao";
  if (/\buber\b|\b99 ?(app|pop|taxi)\b|\btaxi\b/.test(d)) return "taxi";
  if (/tarifa|iof|juros|anuidade|taxa/.test(d)) return "despesa_administrativa";
  return "outro";
}
