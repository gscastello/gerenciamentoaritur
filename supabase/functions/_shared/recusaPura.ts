// supabase/functions/_shared/recusaPura.ts
//
// A equipe já disse a algum cliente que a viagem está LOTADA (issue #527) — regras PURAS. O app mostra a
// lotação do veículo cadastrado (31 lugares), mas no dia pode sair uma van menor: em 22/11 a equipe recusou
// 43 pedidos com o app mostrando vagas. Enquanto a última palavra da equipe sobre aquela viagem for "não
// temos mais vaga", o bot não oferece lugar nem reserva: lista de espera, outro dia ou a equipe.

import { normalizarTexto } from "./grafia.ts";
import { datasEscritas, sentidoEscrito } from "./pedidoDoCliente.ts";

export type FalaDaOperacao = { cw: number; quem: "cliente" | "equipe"; texto: string; em: string };

const RE_LOTADO =
  / (?:nao (?:temos|tem|tenho|consigo|ha) mais (?:vaga|vagas|lugar|passagem|passagens)|(?:ja )?(?:ta|esta|estamos|tudo) lotad[oa]|ja lotou|lotou|sem vagas?|nao (?:temos|tem|tenho) (?:vaga|vagas|lugar) (?:pra|para|mais))/;
const RE_SO_OUTRO_DIA = / so (?:temos|teremos|tem|tenho) (?:vaga|vagas|lugar|passagem) (?:agora )?(?:pra|para|na|no) /;
const RE_TEM = / (?:temos sim|tem sim|tem vaga sim|temos vaga|ainda temos|tenho sim|consegui sua vaga|desistiu uma|abriu uma vaga) /;
const CONTEXTO_MS = 8 * 3600_000;

const n = (t: string) => ` ${normalizarTexto(t)} `;
const chave = (data: string, direcao: string) => `${data}|${direcao}`;

/** Pergunta do próprio atendente ("ainda tem vaga?") a outro transportador não é recusa. */
function diz(texto: string): "lotado" | "tem" | null {
  if (texto.includes("?")) return null;
  const t = n(texto);
  if (RE_LOTADO.test(t) || RE_SO_OUTRO_DIA.test(t)) return "lotado";
  return RE_TEM.test(t) ? "tem" : null;
}

/**
 * Viagens ("2026-11-23|ida") em que a última palavra da equipe foi "lotado". O dia é o que a equipe escreveu
 * ("pra amanhã") ou o que o cliente pediu antes; o sentido, o que o cliente escreveu. Sem dia ou sem sentido
 * claros, a recusa não conta. "Só temos vaga pra terça" fecha o dia que o cliente pediu, não a terça.
 */
export function viagensLotadasPelaEquipe(falas: FalaDaOperacao[]): Map<string, string> {
  const ordenadas = [...falas].sort((a, b) => a.em.localeCompare(b.em));
  const porConversa = new Map<number, FalaDaOperacao[]>();
  const ultima = new Map<string, { estado: "lotado" | "tem"; em: string }>();
  for (const f of ordenadas) {
    const anteriores = porConversa.get(f.cw) ?? [];
    if (f.quem === "equipe") {
      const estado = diz(f.texto);
      if (estado) {
        const limite = Date.parse(f.em) - CONTEXTO_MS;
        const doCliente = anteriores.filter((m) => m.quem === "cliente" && Date.parse(m.em) >= limite);
        const daEquipe = RE_SO_OUTRO_DIA.test(n(f.texto)) ? [] : datasEscritas([{ texto: f.texto, em: f.em }]);
        let datas = daEquipe;
        for (let i = doCliente.length - 1; i >= 0 && !datas.length; i--) datas = datasEscritas([{ texto: doCliente[i].texto, em: doCliente[i].em }]);
        const sentido = sentidoEscrito([f.texto]) ?? sentidoEscrito(doCliente.map((m) => m.texto));
        if (datas.length === 1 && sentido) ultima.set(chave(datas[0], sentido), { estado, em: f.em });
      }
    }
    porConversa.set(f.cw, [...anteriores, f]);
  }
  const out = new Map<string, string>();
  for (const [k, v] of ultima) if (v.estado === "lotado") out.set(k, v.em);
  return out;
}

export function lotadaPelaEquipe(lotadas: Map<string, string>, data: string, direcao: string): boolean {
  return lotadas.has(chave(data, direcao));
}
