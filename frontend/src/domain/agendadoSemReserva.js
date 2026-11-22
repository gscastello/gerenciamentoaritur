// src/domain/agendadoSemReserva.js
//
// "Agendado ☑️" que não virou reserva (issue #455). Quando o bot não consegue lançar o que a equipe
// marcou, abre uma pendência "Agendado ☑️ não lançou" (ou "… lançou só parte"). Ela se perdia no
// meio das outras e um passageiro quase perdeu a viagem. Esta regra separa essas pendências para a
// faixa fixa no topo do app: quem é, o motivo em poucas palavras e há quanto tempo. Regra pura.
// Também entram o "Pedido sem reserva" da sentinela (issue #461: o cliente pediu e ninguém marcou)
// e o "IA fora do ar" (issue #462: a IA recusou ou caiu e os Agendados não estão sendo lidos).
// E a "Revisão: dia ou sentido errado" (issue #476): o revisor achou, com certeza alta, a reserva
// no dia ou no sentido errado — o passageiro não está na lista da viagem que pediu.

const RE_DO_AGENDADO =
  /^(Agendado ☑️|Pedido sem reserva|IA fora do ar|Revisão: dia ou sentido errado)/;
const RODAPE = /\s*Confira a conversa e lance pela Agenda.*$/s;

/** A pendência põe passageiro em risco: Agendado que não lançou, pedido sem reserva ou IA fora do ar? */
export function ehPendenciaDoAgendado(p) {
  return RE_DO_AGENDADO.test(String(p?.assunto ?? p?.subject ?? ""));
}

/** O motivo sem o "Motivo:" e sem o rodapé de instrução, com a primeira letra maiúscula. */
export function motivoCurto(detalhe) {
  const t = String(detalhe ?? "")
    .replace(RODAPE, "")
    .replace(/\s*\(confira e lance pela Agenda\)/gi, "")
    .replace(/^Motivo:\s*/i, "")
    .replace(/\.\s*$/, "")
    .trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "O bot não conseguiu ler o pedido";
}

/** "98 98123-4567" a partir de qualquer telefone (com ou sem 55); vazio se não houver. */
function telefoneLegivel(fone) {
  const d = String(fone ?? "").replace(/\D/g, "");
  const local = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  if (local.length < 10) return local;
  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  return `${ddd} ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

/** "agendado" (marca que não lançou), "pedido" (sentinela), "revisao" (dia/sentido errado) ou "ia". */
function tipoDaPendencia(p) {
  const assunto = String(p?.assunto ?? p?.subject ?? "");
  if (assunto.startsWith("IA fora do ar")) return "ia";
  if (assunto.startsWith("Pedido sem reserva")) return "pedido";
  if (assunto.startsWith("Revisão:")) return "revisao";
  return "agendado";
}

const ddmm = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}` : v);

/**
 * O que o revisor achou, curto: 'data: está "2026-11-23", parece "2026-11-22" (alta) — …' vira
 * "Dia na Agenda 23/11, pedido 22/11". Sem esse formato, a primeira linha do detalhe.
 */
export function motivoDaRevisao(detalhe) {
  const linha = String(detalhe ?? "").split("\n")[0];
  const m = linha.match(/^(data|sentido): está "([^"]*)", parece "([^"]*)"/);
  if (!m) return motivoCurto(linha);
  const campo = m[1] === "data" ? "Dia" : "Sentido";
  return `${campo} na Agenda ${ddmm(m[2])}, pedido ${ddmm(m[3])}`;
}

/** O título da faixa conforme o que está aberto. */
export function tituloDaFaixa(lista) {
  const passageiros = (lista ?? []).filter((p) => p.tipo !== "ia").length;
  const soAgendado = (lista ?? []).every((p) => p.tipo === "agendado");
  const soRevisao =
    passageiros > 0 &&
    (lista ?? []).filter((p) => p.tipo !== "ia").every((p) => p.tipo === "revisao");
  if (!passageiros) return "A IA do bot está fora do ar: os Agendados não estão sendo lidos";
  if (soRevisao) {
    return passageiros === 1
      ? "1 reserva está no dia ou no sentido errado"
      : `${passageiros} reservas estão no dia ou no sentido errado`;
  }
  if (soAgendado) {
    return passageiros === 1
      ? "1 passageiro marcado como Agendado ☑️ ainda não tem lugar na Agenda"
      : `${passageiros} passageiros marcados como Agendado ☑️ ainda não têm lugar na Agenda`;
  }
  return passageiros === 1
    ? "1 passageiro pediu e ainda não tem lugar na Agenda"
    : `${passageiros} passageiros pediram e ainda não têm lugar na Agenda`;
}

/**
 * As pendências abertas do Agendado, a mais antiga primeiro (a mais antiga é a mais urgente: a
 * viagem está mais perto). Cada uma: { id, quem, motivo, parte, em }.
 */
export function agendadosSemReserva(pendencias) {
  return (pendencias ?? [])
    .filter((p) => ehPendenciaDoAgendado(p) && (p.status ?? "aberta") === "aberta")
    .map((p) => ({
      id: p.id,
      tipo: tipoDaPendencia(p),
      quem:
        tipoDaPendencia(p) === "ia"
          ? "Bot"
          : String(p.cliente ?? "").trim() || telefoneLegivel(p.phone) || "Passageiro sem nome",
      motivo: tipoDaPendencia(p) === "revisao" ? motivoDaRevisao(p.detail) : motivoCurto(p.detail),
      parte: /só parte/i.test(String(p.assunto ?? p.subject ?? "")),
      em: p.created_at ?? null,
    }))
    .sort((a, b) => String(a.em ?? "").localeCompare(String(b.em ?? "")));
}
