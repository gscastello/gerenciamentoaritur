// CRM dos passageiros (issue #446, visual v18 aprovado pelo dono): grupos prontos, a linha da
// lista e os números da ficha — hábito por dia da semana, viagens por mês e pagamentos.
// Regras puras — sem React, sem I/O. Datas em texto "AAAA-MM-DD" (o dia de Fortaleza).

const DIA_MS = 86400000;
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const FEITA = ["confirmada", "embarcado"];

/** Os grupos prontos da lista, na ordem dos botões. A explicação aparece embaixo deles. */
export const GRUPOS = [
  {
    id: "todos",
    rotulo: "Todos",
    explicacao: "Todos os cadastros. Toque num passageiro para abrir a ficha.",
  },
  {
    id: "sumiram",
    rotulo: "Sumiram",
    explicacao: "Viajavam (4 viagens ou mais em 3 meses) e não viajam há mais de 30 dias.",
  },
  {
    id: "sem_pagamento",
    rotulo: "Sem pagamento marcado",
    explicacao: "Viagem já feita sem o pagamento marcado no app.",
  },
  {
    id: "frequentes",
    rotulo: "Frequentes",
    explicacao: "Fizeram 6 viagens ou mais nos últimos 90 dias.",
  },
  { id: "marcada", rotulo: "Com viagem marcada", explicacao: "Têm reserva de hoje em diante." },
  { id: "novos", rotulo: "Primeira viagem no mês", explicacao: "A primeira viagem foi neste mês." },
  {
    id: "sem_nome",
    rotulo: "Sem nome",
    explicacao: "Cadastro só com o telefone. Vale perguntar o nome na próxima conversa.",
  },
];

/** As ordens da lista. */
export const ORDENS = [
  { id: "viagens", rotulo: "Mais viagens" },
  { id: "recente", rotulo: "Viajou mais recente" },
  { id: "gasto", rotulo: "Quem mais gerou" },
  { id: "a_receber", rotulo: "Mais sem pagamento marcado" },
  { id: "nome", rotulo: "Nome" },
];

const paraData = (iso) => {
  const [a, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const valido = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? ""));

/** Dias inteiros de `de` até `ate` (positivo se `de` é antes). */
export function diasEntre(de, ate) {
  return Math.round((paraData(ate) - paraData(de)) / DIA_MS);
}

/** "hoje", "ontem", "há 5 dias". */
export function haQuantoTempo(dias) {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/** "hoje", "amanhã" ou "qua 18". */
export function diaCurto(iso, hoje) {
  const n = diasEntre(hoje, iso);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  const d = paraData(iso);
  return `${SEMANA_CURTA[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** "na segunda", "no sábado". */
export function noDia(dia) {
  return `${dia === 0 || dia === 6 ? "no" : "na"} ${SEMANA[dia]}`;
}

/** "Maria das Dores" → "MD"; sem nome → "?". Ignora "da/das/de/do/dos". */
export function iniciais(nome) {
  const partes = String(nome ?? "")
    .split(/\s+/)
    .filter((p) => p && !["da", "das", "de", "do", "dos", "e"].includes(p.toLowerCase()));
  if (partes.length === 0) return "?";
  const primeira = partes[0][0];
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return `${primeira}${ultima}`.toUpperCase();
}

/** Nome para mostrar: sem nome (ou o provisório "Passageiro (local)" da anotação) vira "Sem nome". */
export function nomeParaMostrar(p) {
  const n = String(p?.nome ?? "").trim();
  return !n || /^passageiro(\s*\(.*\))?$/i.test(n) ? "" : n;
}

/**
 * O lado direito da linha da lista: o que mais importa sobre a pessoa agora.
 * Sem pagamento marcado > próxima viagem > sumiu > quantas viagens fez.
 */
export function ladoDaLinha(p, hoje) {
  const aReceber = Number(p?.a_receber) || 0;
  if (aReceber > 0)
    return { texto: `R$ ${aReceber.toLocaleString("pt-BR")}`, sub: "sem pagamento", alerta: true };
  if (valido(p?.proxima_data))
    return { texto: diaCurto(p.proxima_data, hoje), sub: "próxima viagem" };
  if (p?.sumiu && valido(p?.ultima_viagem))
    return { texto: `${diasEntre(p.ultima_viagem, hoje)} dias`, sub: "sem viajar" };
  const n = Number(p?.viagens_count) || 0;
  return { texto: String(n), sub: n === 1 ? "viagem" : "viagens" };
}

/** A segunda linha da lista: "última há 3 dias · Cohama" (ou "nunca viajou"). */
export function linhaDeBaixo(p, hoje) {
  const partes = [];
  if (!nomeParaMostrar(p) && p?.telefone) partes.push(p.telefone);
  partes.push(
    valido(p?.ultima_viagem)
      ? `última ${haQuantoTempo(diasEntre(p.ultima_viagem, hoje))}`
      : "ainda não viajou",
  );
  if (p?.bairro_padrao) partes.push(p.bairro_padrao);
  return partes.join(" · ");
}

/** As etiquetas do topo da ficha: { texto, tipo: "forte" | "alerta" | "normal" }. */
export function etiquetas(p, hoje, rotuloPagamento = (x) => x) {
  const lista = [];
  if (p?.frequente) lista.push({ texto: "Frequente", tipo: "forte" });
  if (p?.novo) lista.push({ texto: "Primeira viagem no mês", tipo: "forte" });
  if (p?.sumiu && valido(p?.ultima_viagem))
    lista.push({ texto: `Sumiu há ${diasEntre(p.ultima_viagem, hoje)} dias`, tipo: "alerta" });
  if (!nomeParaMostrar(p)) lista.push({ texto: "Sem nome", tipo: "alerta" });
  if (p?.pagamento_padrao)
    lista.push({ texto: `Paga em ${rotuloPagamento(p.pagamento_padrao)}`, tipo: "normal" });
  for (const t of Array.isArray(p?.tags) ? p.tags : [])
    if (typeof t === "string" && t.trim()) lista.push({ texto: t.trim(), tipo: "normal" });
  return lista;
}

/** Quantas viagens feitas (confirmada ou embarcada) em cada dia da semana, por sentido. */
export function habitoPorDia(viagens) {
  const ida = Array(7).fill(0);
  const volta = Array(7).fill(0);
  for (const v of viagens ?? []) {
    if (!valido(v?.data) || !FEITA.includes(v.status) || v.tipo === "encomenda") continue;
    const dia = paraData(v.data).getUTCDay();
    if (v.direcao === "ida") ida[dia]++;
    else if (v.direcao === "volta") volta[dia]++;
  }
  return { ida, volta };
}

const diaMaisComum = (contagem) => {
  let melhor = -1;
  let n = 0;
  contagem.forEach((c, i) => {
    if (c > n) {
      n = c;
      melhor = i;
    }
  });
  return melhor;
};

/**
 * "Costuma ir na segunda e voltar na sexta." — só quando há pelo menos 3 viagens no sentido e o
 * dia mais comum tem metade delas ou mais (senão não é costume, é acaso).
 */
export function fraseDoHabito({ ida, volta }) {
  const costume = (contagem) => {
    const total = contagem.reduce((s, c) => s + c, 0);
    const dia = diaMaisComum(contagem);
    return total >= 3 && dia >= 0 && contagem[dia] * 2 >= total ? dia : -1;
  };
  const i = costume(ida);
  const v = costume(volta);
  if (i >= 0 && v >= 0) return `Costuma ir ${noDia(i)} e voltar ${noDia(v)}.`;
  if (i >= 0) return `Costuma ir ${noDia(i)}.`;
  if (v >= 0) return `Costuma voltar ${noDia(v)}.`;
  return null;
}

/** Viagens feitas por mês, dos `meses` últimos até o mês de `hoje`: [{ rotulo, n, atual }]. */
export function viagensPorMes(viagens, hoje, meses = 6) {
  const [a, m] = String(hoje).split("-").map(Number);
  const lista = Array.from({ length: meses }, (_, i) => {
    const t = a * 12 + (m - 1) - (meses - 1 - i);
    const ano = Math.floor(t / 12);
    const mes = (t % 12) + 1;
    return {
      chave: `${ano}-${String(mes).padStart(2, "0")}`,
      rotulo: MESES_CURTOS[mes - 1],
      n: 0,
      atual: i === meses - 1,
    };
  });
  const porChave = Object.fromEntries(lista.map((x) => [x.chave, x]));
  for (const v of viagens ?? []) {
    if (!valido(v?.data) || !FEITA.includes(v.status) || v.data > hoje) continue;
    const x = porChave[v.data.slice(0, 7)];
    if (x) x.n++;
  }
  return lista;
}

/** "cliente desde março de 2026". */
export function clienteDesde(dataOuMomento) {
  const iso = String(dataOuMomento ?? "").slice(0, 10);
  if (!valido(iso)) return "";
  const d = paraData(iso);
  return `cliente desde ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/**
 * Pagamentos da ficha: viagens já feitas sem pagamento marcado (as mais antigas primeiro) e as
 * pagas (as mais recentes primeiro). Encomenda e viagem futura ficam de fora.
 */
export function pagamentosDoPassageiro(viagens, hoje) {
  const feitas = (viagens ?? []).filter(
    (v) => valido(v?.data) && v.data < hoje && FEITA.includes(v.status) && v.tipo !== "encomenda",
  );
  const valor = (v) => Number(v.valorTotal) || 0;
  const pendentes = feitas.filter((v) => !v.pago).sort((a, b) => a.data.localeCompare(b.data));
  const pagos = feitas.filter((v) => v.pago).sort((a, b) => b.data.localeCompare(a.data));
  return {
    pendentes,
    pagos,
    totalPendente: pendentes.reduce((s, v) => s + valor(v), 0),
    totalPago: pagos.reduce((s, v) => s + valor(v), 0),
  };
}
