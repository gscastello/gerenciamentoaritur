// "Avisar passageiros" da Agenda (issue #432): a mensagem de cada passageiro da viagem, com o
// horário do ponto DELE (os mesmos da Agenda: route_points.base_time + a Ida da segunda mais cedo).
// Regras puras — sem React, sem I/O. Quem envia é a Edge Function avisar-passageiros.

import { shiftHour } from "./horarios.js";

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const TRATAMENTOS = new Set([
  "dona",
  "dna",
  "seu",
  "sr",
  "sra",
  "senhor",
  "senhora",
  "dr",
  "dra",
  "tia",
  "tio",
]);
const SEM_NOME = new Set(["passageiro", "passageira", "cliente", "contato", "sem", "nome"]);
const capitalizar = (p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();

/** Texto padrão; {saudacao}, {quando}, {aviso_do_dia} e {embarque} são trocados para cada passageiro. */
export const TEXTO_PADRAO =
  "{saudacao} Lembrete da sua viagem {quando}, com a AriTur: {aviso_do_dia}{embarque} Qualquer dúvida, é só responder aqui. 😊";

const ehSegunda = (data) => new Date(`${data}T12:00:00Z`).getUTCDay() === 1;
const somarDias = (dia, n) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ddmm = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/**
 * Como chamar o passageiro: "Maria da Silva" → "Maria"; "Dona Maria" → "Dona Maria";
 * "Passageiro (Belle Maiobão)" ou sem nome → null (vira só "Olá!").
 */
export function nomeDoAviso(nome) {
  const partes = String(nome ?? "")
    .replace(/[()]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const p = partes[0] ?? "";
  const limpo = p.toLowerCase().replace(/\.$/, "");
  if (p.length < 2 || /\d/.test(p) || SEM_NOME.has(limpo)) return null;
  if (TRATAMENTOS.has(limpo)) {
    const segundo = partes[1] ?? "";
    return segundo.length >= 2 && !/\d/.test(segundo)
      ? `${capitalizar(p)} ${capitalizar(segundo)}`
      : null;
  }
  return capitalizar(p);
}

/** Horário do ponto na data: na segunda a Ida sai `horas` mais cedo (ajuste ligado). */
export function horarioDoPonto(
  horaBase,
  data,
  direcao,
  { segundaAtiva = true, segundaHoras = 1 } = {},
) {
  if (!/^\d{2}:\d{2}/.test(String(horaBase ?? ""))) return null;
  return shiftHour(
    String(horaBase).slice(0, 5),
    direcao === "ida" && segundaAtiva && ehSegunda(data),
    segundaHoras,
  );
}

/** "de amanhã, segunda (16/11)", "de hoje, domingo (15/11)", "de terça (17/11)". */
export function quandoDoAviso(data, hoje) {
  const semana = SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()];
  if (data === hoje) return `de hoje, ${semana} (${ddmm(data)})`;
  if (data === somarDias(hoje, 1)) return `de amanhã, ${semana} (${ddmm(data)})`;
  return `de ${semana} (${ddmm(data)})`;
}

/** A frase do embarque de uma reserva, pelo ponto (busca em casa e BR = "a partir das"). */
export function fraseDoEmbarque(r, pontoNome, horario) {
  if (!horario) return "";
  if (r.direcao === "volta") return `a Volta sai de ${pontoNome} a partir das ${horario}.`;
  if (r.pontoId === "busca")
    return `vamos te buscar em casa a partir das ${horario} — fique de olho no celular.`;
  if (r.pontoId === "outro") {
    const local = String(r.embarque ?? r.pickupDetail ?? "")
      .replace(/\s*\(BR\)\s*$/i, "")
      .trim();
    return `seu embarque é ${local ? `em ${local}` : "na BR"} a partir das ${horario}.`;
  }
  return `seu embarque é ${/^retorno|^rodovi/i.test(pontoNome) ? "no" : "em"} ${pontoNome} às ${horario}.`.replace(
    " no Rodoviária",
    " na Rodoviária",
  );
}

/** Troca os campos do texto para um passageiro. */
export function textoDoAviso(modelo, v) {
  return String(modelo ?? "")
    .replaceAll("{saudacao}", v.nome ? `Olá, ${v.nome}!` : "Olá!")
    .replaceAll("{quando}", v.quando ?? "")
    .replaceAll("{aviso_do_dia}", v.avisoDoDia ? `${v.avisoDoDia} ` : "")
    .replaceAll(
      "{embarque}",
      v.embarque ? capitalizar(v.embarque.charAt(0)) + v.embarque.slice(1) : "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Os avisos da viagem: um por telefone (quem tem duas reservas recebe um só), passagens
 * confirmadas e pendentes com telefone, na ordem dos pontos. `avisos` = o que já foi enviado
 * (avisos_passageiros), para marcar "já avisado" e não marcar de novo por padrão.
 */
export function montarAvisos({
  reservas,
  data,
  direcao,
  hoje,
  pontos,
  segundaAtiva = true,
  segundaHoras = 1,
  modelo = TEXTO_PADRAO,
  avisos = [],
}) {
  const ordemDoPonto = new Map((pontos ?? []).map((p, i) => [p.id, i]));
  const pontoPorId = new Map((pontos ?? []).map((p) => [p.id, p]));
  const avisoDoDia =
    direcao === "ida" && segundaAtiva && ehSegunda(data)
      ? `como é segunda, a Ida sai ${segundaHoras === 1 ? "1 hora" : `${segundaHoras} horas`} mais cedo.`
      : "";
  const ultimo = new Map();
  for (const a of avisos ?? []) {
    const atual = ultimo.get(a.reservation_id);
    if (!atual || String(a.criado_em) > String(atual.criado_em)) ultimo.set(a.reservation_id, a);
  }
  const vistos = new Set();
  return (reservas ?? [])
    .filter(
      (r) =>
        r.data === data &&
        r.direcao === direcao &&
        r.tipo === "passagem" &&
        (r.status === "confirmada" || r.status === "pendente") &&
        String(r.telefone ?? "").replace(/\D/g, "").length >= 10,
    )
    .sort((a, b) => (ordemDoPonto.get(a.pontoId) ?? 99) - (ordemDoPonto.get(b.pontoId) ?? 99))
    .filter((r) => {
      const tel = String(r.telefone).replace(/\D/g, "");
      if (vistos.has(tel)) return false;
      vistos.add(tel);
      return true;
    })
    .map((r) => {
      const ponto = pontoPorId.get(r.pontoId);
      const pontoNome = ponto?.nome ?? r.pontoId ?? "";
      const horario = horarioDoPonto(ponto?.horaBase, data, direcao, {
        segundaAtiva,
        segundaHoras,
      });
      const nome = nomeDoAviso(r.nome);
      const embarque = fraseDoEmbarque(r, pontoNome, horario);
      const anterior = ultimo.get(r.id) ?? null;
      return {
        id: r.id,
        nome: r.nome || "",
        telefone: r.telefone,
        pontoNome,
        horario,
        texto: textoDoAviso(modelo, {
          nome,
          quando: quandoDoAviso(data, hoje),
          avisoDoDia,
          embarque,
        }),
        // para o modelo da Meta (fora das 24 h): {{1}} nome, {{2}} dia, {{3}} ponto, {{4}} horário
        variaveis: {
          nome: nome ?? "",
          dia: `${SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()]}, ${ddmm(data)}`,
          ponto: pontoNome,
          horario: horario ?? "",
        },
        anterior,
        // quem já recebeu não vem marcado; quem ficou de fora (janela, sem conversa, falha) vem
        marcado: anterior?.status !== "enviado",
      };
    });
}
