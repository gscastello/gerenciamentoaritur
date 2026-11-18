// src/domain/agendadoSemReserva.js
//
// "Agendado ☑️" que não virou reserva (issue #455). Quando o bot não consegue lançar o que a equipe
// marcou, abre uma pendência "Agendado ☑️ não lançou" (ou "… lançou só parte"). Ela se perdia no
// meio das outras e um passageiro quase perdeu a viagem. Esta regra separa essas pendências para a
// faixa fixa no topo do app: quem é, o motivo em poucas palavras e há quanto tempo. Regra pura.

const RE_DO_AGENDADO = /^Agendado ☑️/;
const RODAPE = /\s*Confira a conversa e lance pela Agenda.*$/s;

/** A pendência é de um "Agendado ☑️" que não lançou (tudo ou parte)? */
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

/**
 * As pendências abertas do Agendado, a mais antiga primeiro (a mais antiga é a mais urgente: a
 * viagem está mais perto). Cada uma: { id, quem, motivo, parte, em }.
 */
export function agendadosSemReserva(pendencias) {
  return (pendencias ?? [])
    .filter((p) => ehPendenciaDoAgendado(p) && (p.status ?? "aberta") === "aberta")
    .map((p) => ({
      id: p.id,
      quem: String(p.cliente ?? "").trim() || telefoneLegivel(p.phone) || "Passageiro sem nome",
      motivo: motivoCurto(p.detail),
      parte: /só parte/i.test(String(p.assunto ?? p.subject ?? "")),
      em: p.created_at ?? null,
    }))
    .sort((a, b) => String(a.em ?? "").localeCompare(String(b.em ?? "")));
}
