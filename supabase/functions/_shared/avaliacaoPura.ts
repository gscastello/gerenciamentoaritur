// supabase/functions/_shared/avaliacaoPura.ts
//
// Avaliação do bot com casos reais (issue #419) — regras PURAS, sem rede.
// Meta do dono: 99,9% (um erro faz o passageiro perder a viagem). Cada "Agendado ☑️" real vira um
// caso com as viagens que FICARAM (já corrigidas pela equipe). A avaliação roda a leitura do
// Agendado como ela estava no momento da marca e compara viagem por viagem.
//
// Resultado de um caso, do pior para o melhor:
//   errado   — lançaria uma viagem que não existe ou com dia/sentido/ponto/bairro/quantidade errado
//   faltou   — deixaria de lançar uma viagem pedida (sem nem pendência)
//   pendente — não lançaria por dúvida (fica pendência ou pergunta): seguro, mas não automático
//   certo    — lançaria exatamente as viagens que ficaram

import { normalizarTexto } from "./grafia.ts";

export type ViagemDoCaso = {
  trip_date: string;
  direction: string;
  route_point_code: string | null;
  quantity: number;
  pickup_neighborhood?: string | null;
  type?: string | null;
};

export type ViagemPlanejada = ViagemDoCaso & { pendencia?: { motivo: string; codigo: string } | null };

export type ResultadoDoCaso = {
  resultado: "certo" | "pendente" | "faltou" | "errado";
  diferencas: string[];
};

const ddmm = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
const rotulo = (v: ViagemDoCaso) => `${v.direction === "volta" ? "Volta" : "Ida"} ${ddmm(v.trip_date)}`;
const mesmoTexto = (a: unknown, b: unknown) => normalizarTexto(String(a ?? "")) === normalizarTexto(String(b ?? ""));

/** Campos que, errados, fazem o passageiro perder a viagem ou pagar errado. */
function camposDiferentes(esperada: ViagemDoCaso, lida: ViagemDoCaso): string[] {
  const out: string[] = [];
  if ((esperada.type ?? "passagem") !== (lida.type ?? "passagem")) out.push(`tipo: ${lida.type} ≠ ${esperada.type}`);
  if (esperada.route_point_code !== lida.route_point_code) {
    out.push(`ponto: ${lida.route_point_code ?? "—"} ≠ ${esperada.route_point_code ?? "—"}`);
  }
  if (Number(esperada.quantity || 1) !== Number(lida.quantity || 1)) out.push(`quantidade: ${lida.quantity} ≠ ${esperada.quantity}`);
  if (esperada.route_point_code === "busca" && lida.route_point_code === "busca" &&
    // bairro vazio = "endereço a confirmar" (o bot pergunta ao passageiro), não bairro errado
    esperada.pickup_neighborhood && lida.pickup_neighborhood && !mesmoTexto(esperada.pickup_neighborhood, lida.pickup_neighborhood)) {
    out.push(`bairro: ${lida.pickup_neighborhood ?? "—"} ≠ ${esperada.pickup_neighborhood}`);
  }
  return out;
}

/**
 * Compara as viagens que o Agendado lançaria com as que ficaram. Casa por dia + sentido; viagem
 * lida que não casa com nenhuma esperada é ERRO (reserva que não devia existir).
 */
export function compararCaso(
  esperadas: ViagemDoCaso[],
  planejadas: ViagemPlanejada[],
  opcoes: {
    /** por que o Agendado não lançou um pedido (sem_data, sem_cidade…): vira pendência com o motivo */
    motivos?: string[];
    /** caso conferido em que o certo é perguntar (o cliente não escreveu o dia, por exemplo) */
    pendenteOk?: boolean;
  } = {},
): ResultadoDoCaso {
  const diferencas: string[] = [];
  // "ja_reservado" não é pendência: a viagem já existia
  const motivosDePendencia = (opcoes.motivos ?? []).filter((m) => m !== "ja_reservado");
  let errado = false;
  let faltou = false;
  let pendente = false;
  const usadas = new Set<number>();
  for (const e of esperadas) {
    const i = planejadas.findIndex((p, k) => !usadas.has(k) && p.trip_date === e.trip_date && p.direction === e.direction);
    if (i === -1) {
      if (motivosDePendencia.length || planejadas.some((p) => p.pendencia)) {
        // o Agendado avisa a equipe com o motivo: não some calado
        pendente = true;
        diferencas.push(`${rotulo(e)} ficaria pendente: ${motivosDePendencia.join(", ")}`);
      } else {
        faltou = true;
        diferencas.push(`faltou ${rotulo(e)}`);
      }
      continue;
    }
    usadas.add(i);
    const p = planejadas[i];
    const campos = camposDiferentes(e, p);
    if (p.pendencia) {
      pendente = true;
      diferencas.push(`${rotulo(e)} ficaria pendente: ${p.pendencia.motivo}${campos.length ? ` (e leria ${campos.join("; ")})` : ""}`);
      continue;
    }
    if (campos.length) {
      errado = true;
      diferencas.push(`${rotulo(e)} errada: ${campos.join("; ")}`);
    }
  }
  planejadas.forEach((p, k) => {
    if (usadas.has(k)) return;
    if (p.pendencia) {
      // pendência numa viagem que não existe: não lançou, mas ocupou a equipe à toa
      pendente = true;
      diferencas.push(`pendência à toa: ${rotulo(p)} (${p.pendencia.motivo})`);
      return;
    }
    errado = true;
    diferencas.push(`lançaria ${rotulo(p)} que não foi pedida`);
  });
  const resultado = errado ? "errado" : faltou ? "faltou" : pendente && !opcoes.pendenteOk ? "pendente" : "certo";
  return { resultado, diferencas };
}

/** Resumo de uma rodada: acerto = certos ÷ casos; erros graves = casos "errado". */
export function resumoDaRodada(resultados: ResultadoDoCaso["resultado"][]) {
  const total = resultados.length;
  const conta = (r: string) => resultados.filter((x) => x === r).length;
  const certos = conta("certo");
  return {
    total,
    certos,
    errados: conta("errado"),
    faltaram: conta("faltou"),
    pendentes: conta("pendente"),
    acerto: total ? Math.round((certos / total) * 1000) / 10 : 0,
    // o que nunca pode acontecer: lançar errado
    semErroGrave: total ? Math.round(((total - conta("errado")) / total) * 1000) / 10 : 0,
  };
}
