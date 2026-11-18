// supabase/functions/_shared/lembretePuro.ts
//
// Lembrete automático da viagem (issue #458) — regras PURAS, sem rede.
//
// Camada de segurança do agendamento: o próprio passageiro confere a reserva antes de viajar. Se
// algo estiver errado (dia, sentido, local, quantidade), ele responde e o revisor corrige.
//   · Ida: na noite anterior (settings.lembrete_viagem.ida_hora).
//   · Volta: X minutos antes do horário do ponto dele (volta_antes_min; dono, 17/11: 1 hora).
//   · Quem agenda DEPOIS da hora do lembrete recebe na próxima rodada (de 5 em 5 min), enquanto a
//     viagem não saiu — menos quem foi lançado pelo "Agendado ☑️": esse já recebeu a confirmação
//     com dia, embarque e horário, que vale como lembrete.
//   · Uma vez por reserva; nada no horário de silêncio.

import { horarioDoEmbarque, primeiroNome, rotuloDoDia } from "./confirmacaoAoCliente.ts";

/** settings.lembrete_viagem */
export type ConfigDoLembrete = {
  ativo: boolean;
  /** "HH:MM" da noite anterior, para a Ida */
  ida_hora: string;
  /** minutos antes do horário do ponto, para a Volta */
  volta_antes_min: number;
  /** não manda entre `de` e `ate` (atravessa a meia-noite) */
  silencio: { de: string; ate: string };
};

export const CONFIG_PADRAO: ConfigDoLembrete = {
  ativo: false,
  ida_hora: "19:00",
  volta_antes_min: 60,
  silencio: { de: "22:00", ate: "06:00" },
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A configuração salva, com o padrão no que faltar ou estiver errado. */
export function configDoLembrete(v: unknown): ConfigDoLembrete {
  const c = (v ?? {}) as Partial<ConfigDoLembrete>;
  const hora = (x: unknown, padrao: string) => (HHMM.test(String(x ?? "")) ? String(x) : padrao);
  const min = Number(c.volta_antes_min);
  return {
    ativo: c.ativo === true,
    ida_hora: hora(c.ida_hora, CONFIG_PADRAO.ida_hora),
    volta_antes_min: Number.isFinite(min) && min >= 15 && min <= 240 ? Math.round(min) : CONFIG_PADRAO.volta_antes_min,
    silencio: {
      de: hora(c.silencio?.de, CONFIG_PADRAO.silencio.de),
      ate: hora(c.silencio?.ate, CONFIG_PADRAO.silencio.ate),
    },
  };
}

/** A reserva como o lembrete precisa dela. */
export type ReservaDoLembrete = {
  id: string;
  data: string; // YYYY-MM-DD
  direcao: "ida" | "volta";
  status: string;
  tipo: string; // passagem | encomenda
  criadaEm: string; // ISO
  /** lançada pelo "Agendado ☑️" (extra_data.origem = agendado_equipe): já recebeu a confirmação */
  peloAgendado: boolean;
  pontoCodigo: string | null;
  pontoNome: string | null;
  pontoHora: string | null; // route_points.base_time
  nome: string | null;
  bairro: string | null;
  endereco: string | null;
  quantidade: number;
};

// São Luís não tem horário de verão: UTC−3 o ano todo
const instante = (dia: string, hhmm: string) => Date.parse(`${dia}T${hhmm}:00-03:00`);
const diaAnterior = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const menosMinutos = (hhmm: string, min: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (h * 60 + m - min + 24 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** "HH:MM" agora em São Luís. */
export function horaEmSaoLuis(agora: Date): string {
  const t = new Date(agora.getTime() - 3 * 3600 * 1000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** Está no horário de silêncio (que pode atravessar a meia-noite)? */
export function noSilencio(hhmm: string, s: { de: string; ate: string }): boolean {
  return s.de <= s.ate ? hhmm >= s.de && hhmm < s.ate : hhmm >= s.de || hhmm < s.ate;
}

/**
 * Quando o lembrete desta reserva começa a valer e até quando (o horário do ponto: depois disso a
 * viagem já passou por ele). null = sem horário do ponto.
 */
export function janelaDoLembrete(
  r: Pick<ReservaDoLembrete, "data" | "direcao" | "pontoHora">,
  cfg: ConfigDoLembrete,
  ajusteDaSegunda: { active?: boolean; hours?: number } | null,
): { desde: number; ate: number; horario: string } | null {
  const horario = horarioDoEmbarque(r.pontoHora, r.data, r.direcao, ajusteDaSegunda);
  if (!horario) return null;
  const ate = instante(r.data, horario);
  const desde = r.direcao === "ida"
    ? instante(diaAnterior(r.data), cfg.ida_hora)
    : instante(r.data, menosMinutos(horario, cfg.volta_antes_min));
  return { desde, ate, horario };
}

/**
 * As reservas que devem receber o lembrete AGORA. `jaAvisadas` = reservas que já têm lembrete
 * (tipo horario) registrado — manual ou automático.
 */
export function lembretesDevidos(
  reservas: ReservaDoLembrete[],
  jaAvisadas: Set<string>,
  agora: Date,
  cfg: ConfigDoLembrete,
  ajusteDaSegunda: { active?: boolean; hours?: number } | null,
): { reserva: ReservaDoLembrete; horario: string }[] {
  if (!cfg.ativo || noSilencio(horaEmSaoLuis(agora), cfg.silencio)) return [];
  const t = agora.getTime();
  const out: { reserva: ReservaDoLembrete; horario: string }[] = [];
  for (const r of reservas) {
    if (r.tipo === "encomenda" || !["confirmada", "pendente"].includes(r.status) || jaAvisadas.has(r.id)) continue;
    const j = janelaDoLembrete(r, cfg, ajusteDaSegunda);
    if (!j || t < j.desde || t >= j.ate) continue;
    // lançada pelo Agendado depois da hora do lembrete: a confirmação que ele recebeu já vale
    const criada = Date.parse(r.criadaEm);
    if (r.peloAgendado && Number.isFinite(criada) && criada >= j.desde) continue;
    out.push({ reserva: r, horario: j.horario });
  }
  return out;
}

/** Onde embarca, como o passageiro reconhece: "em casa (Turu, Rua das Flores, 10)", "na Rodoviária". */
function ondeEmbarca(r: ReservaDoLembrete): string {
  if (r.pontoCodigo === "busca") {
    const onde = [r.bairro, r.endereco].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
    return onde ? `em casa (${onde})` : "em casa";
  }
  if (r.pontoCodigo === "outro" && String(r.endereco ?? "").trim()) return `em ${String(r.endereco).trim()}`;
  if (r.direcao === "volta" && r.pontoNome) {
    const rua = String(r.endereco ?? "").trim();
    return rua ? `em ${r.pontoNome} (${rua})` : `em ${r.pontoNome}`;
  }
  if (!r.pontoNome) return "no seu local de embarque";
  // "na Rodoviária", "no Retorno das Vans"
  return /^(retorno|posto|terminal) /i.test(r.pontoNome) ? `no ${r.pontoNome}` : `na ${r.pontoNome}`;
}

/**
 * O texto do lembrete (dentro das 24 h da conversa): curto, com tudo o que o passageiro precisa
 * conferir — dia, Ida/Volta, onde embarca, horário e quantas passagens — e o pedido de resposta se
 * algo estiver diferente. Nunca valor.
 */
export function textoDoLembrete(r: ReservaDoLembrete, horario: string, hoje: string): string {
  const nome = primeiroNome(r.nome);
  const ola = nome ? `Olá, ${nome}!` : "Olá!";
  const sentido = r.direcao === "ida" ? "Ida" : "Volta";
  const quem = r.quantidade > 1 ? ` (${r.quantidade} passagens)` : "";
  // busca em casa e Volta (buscamos na cidade) são "a partir de"; ponto fixo é a hora marcada
  const quando = r.pontoCodigo === "busca" || r.direcao === "volta" ? `a partir das ${horario}` : `às ${horario}`;
  return `${ola} Lembrete da sua viagem com a AriTur: ${sentido} ${rotuloDoDia(r.data, hoje)}${quem}, embarque ${ondeEmbarca(r)} ${quando}. Está tudo certo? Se algo estiver diferente, é só responder aqui.`;
}

/** As variáveis do modelo da Meta "aviso_horario" (fora das 24 h): dia, ponto e horário. */
export function variaveisDoModelo(r: ReservaDoLembrete, horario: string, hoje: string) {
  return {
    nome: r.nome,
    dia: rotuloDoDia(r.data, hoje).replace(/^de /, ""),
    ponto: ondeEmbarca(r).replace(/^(em|na|no) /, ""),
    horario,
  };
}
