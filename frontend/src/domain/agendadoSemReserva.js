// src/domain/agendadoSemReserva.js
//
// "Agendado ☑️" que não virou reserva (issue #455). Quando o bot não consegue lançar o que a equipe
// marcou, abre uma pendência "Agendado ☑️ não lançou" (ou "… lançou só parte"). Ela se perdia no
// meio das outras e um passageiro quase perdeu a viagem. Esta regra separa essas pendências para a
// faixa fixa no topo do app: quem é, o motivo em poucas palavras e há quanto tempo. Regra pura.
// Também entram o "Pedido sem reserva" da sentinela (issue #461: o cliente pediu e ninguém marcou)
// e o "IA fora do ar" (issue #462: a IA recusou ou caiu e os Agendados não estão sendo lidos).

const RE_DO_AGENDADO = /^(Agendado ☑️|Pedido sem reserva|IA fora do ar)/;
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

/** "agendado" (marca que não lançou), "pedido" (sentinela) ou "ia" (IA fora do ar). */
function tipoDaPendencia(p) {
  const assunto = String(p?.assunto ?? p?.subject ?? "");
  if (assunto.startsWith("IA fora do ar")) return "ia";
  if (assunto.startsWith("Pedido sem reserva")) return "pedido";
  return "agendado";
}

/** O título da faixa conforme o que está aberto. */
export function tituloDaFaixa(lista) {
  const passageiros = (lista ?? []).filter((p) => p.tipo !== "ia").length;
  const soAgendado = (lista ?? []).every((p) => p.tipo === "agendado");
  if (!passageiros) return "A IA do bot está fora do ar: os Agendados não estão sendo lidos";
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
      motivo: motivoCurto(p.detail),
      parte: /só parte/i.test(String(p.assunto ?? p.subject ?? "")),
      em: p.created_at ?? null,
    }))
    .sort((a, b) => String(a.em ?? "").localeCompare(String(b.em ?? "")));
}
