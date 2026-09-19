import {
  Bell,
  Bus,
  Car,
  CarTaxiFront,
  CreditCard,
  Fuel,
  Inbox,
  Landmark,
  MapPin,
  Package,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wrench,
  X,
} from "lucide-react";
import React, { useContext, useEffect, useRef, useState } from "react";

/* ============================================================================
 * Helpers, tokens, contexts and UI primitives shared by every tab.
 * Extracted from App.jsx so tab components can be code-split (React.lazy)
 * without duplicating this code in every chunk.
 * ========================================================================== */

export const C = {
  bg: "#08090B",
  panel: "#111214",
  panel2: "#191A1D",
  border: "#292A2E",
  borderSoft: "#1E1F22",
  ink: "#F2F3F5",
  inkSoft: "#9CA0A8",
  inkFaint: "#63666D",
  // vermelho da marca (era âmbar)
  amber: "#E4121F",
  amberSoft: "#2A0E10",
  brand: "#E4121F",
  brandDim: "#A50D17",
  brandGlow: "rgba(228,18,31,0.35)",
  onBrand: "#FFFFFF",
  // Sinalização por cor foi removida do app (pedido do dono): status,
  // ocupação, direção etc. se distinguem por TEXTO e ÍCONE, não por cor.
  // Estes tokens semânticos agora apontam todos para a mesma escala de
  // cinza — o vermelho da marca (`brand`/`amber`) fica só na identidade
  // (logo, hero, botão principal) e o `red` só em erro/ação destrutiva.
  warn: "#B9BDC6",
  warnSoft: "#232427",
  blue: "#B9BDC6",
  blueSoft: "#232427",
  green: "#B9BDC6",
  greenSoft: "#232427",
  red: "#F0625F",
  redSoft: "#33161A",
  purple: "#B9BDC6",
  purpleSoft: "#232427",
  gray: "#B9BDC6",
  graySoft: "#232427",
};
export const PIX_KEY = "98981012388";
export const PIX_NAME = "A O Castelo Transporte e Turismo";

// A operação é em São Luís (MA) — UTC-3 o ano inteiro (Brasil não observa
// mais horário de verão desde 2019). "Hoje"/"agora" tem que ser sempre o
// dia civil e a hora de São Luís, nunca o fuso de quem está com o app
// aberto nem UTC puro — `new Date().toISOString()` é UTC e, das 21h à
// meia-noite em São Luís, já mostra o dia seguinte (bug real: reserva
// "de hoje" feita à noite ia pra Agenda de amanhã).
export const FUSO_OPERACAO = "America/Fortaleza";
export const fmtDiaFuso = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_OPERACAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
// `offsetDias` desloca em milissegundos absolutos a partir de agora (nunca
// usa getDate/setDate locais) — o resultado não depende do fuso do
// aparelho, só do relógio real + a formatação final em São Luís.
export const dataOperacao = (offsetDias = 0) =>
  fmtDiaFuso.format(new Date(Date.now() + offsetDias * 86400000));
export const todayStr = () => dataOperacao();
export const fmtBRL = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtDate = (d) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};
export const fmtHora = (iso) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO_OPERACAO,
  });
// Data + hora de um timestamp completo (ex.: created_at de system_backups) —
// nunca cortar a string na mão (`.slice(0,10)`): um timestamp serializado em
// UTC pode cair no dia seguinte ao de São Luís perto da meia-noite.
export const fmtDataHora = (iso) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: FUSO_OPERACAO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const isMonday = (d) => new Date(`${d}T12:00:00`).getDay() === 1;
// Dia do mês para custo recorrente: 1–31. Em meses mais curtos, o banco
// lança no último dia (fn_generate_recurring_expenses).
export const clampDia = (v) => Math.min(Math.max(Number.parseInt(v, 10) || 1, 1), 31);
export const diaSemana = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
export const shiftHour = (hhmm, ativo, horas = 1) => {
  if (!ativo) return hhmm;
  let [h, m] = hhmm.split(":").map(Number);
  h = (h - horas + 24) % 24;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
export function normalizar(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
export function digitos(tel) {
  return (tel || "").replace(/\D/g, "");
}

/* ============================= bairros → precificação de busca em casa ============================= */
export const BAIRROS_80 = [
  "Centro",
  "Apicum",
  "Camboa",
  "Madre Deus",
  "Lira",
  "Vila Passos",
  "Diamante",
  "Coréia",
  "Goiabal",
  "Areinha",
  "Fabril",
  "Monte Castelo",
  "Alemanha",
  "Apeadouro",
  "Belira",
  "Barreto",
  "Fátima",
  "Bairro de Fátima",
  "Liberdade",
  "João Paulo",
  "Caratatiua",
  "Sacavém",
  "Outeiro da Cruz",
  "Jordoa",
  "Filipinho",
  "Coroado",
  "Vila Ivar Saldanha",
  "Vila Palmeira",
  "Anil",
  "Cruzeiro do Anil",
  "Aurora",
  "Parque Aurora",
  "Sítio Leal",
  "Redenção",
  "Ipase",
  "Maranhão Novo",
  "Rio Anil",
  "Cohab Anil I",
  "Cohab Anil II",
  "Cohab Anil III",
  "Cohab Anil IV",
  "Bequimão",
  "Angelim",
  "Cohafuma",
  "Cohama",
  "Vinhais",
  "Recanto dos Vinhais",
  "Planalto Vinhais I",
  "Planalto Vinhais II",
  "Turu",
  "Planalto Turu",
  "Planalto Turu II",
  "Planalto Turu III",
  "Jardim Atlântico",
  "Recanto do Turu",
  "Vivendas do Turu",
  "Chácara Brasil",
  "Parque Shalon",
  "Parque Athenas",
  "Parque Atlântico",
  "Parque Universitário",
  "Parque Timbiras",
  "Parque dos Nobres",
  "Parque Pindorama",
  "Parque Amazonas",
  "Parque Vitória",
  "Planalto Anil",
  "Planalto Aurora",
  "Cohatrac I",
  "Cohatrac II",
  "Cohatrac III",
  "Cohatrac IV",
  "Cohatrac V",
  "Forquilha",
  "Pão de Açúcar",
  "Jardim América",
  "Jardim Alvorada",
  "Jardim São Cristóvão",
  "IPEM São Cristóvão",
  "São Bernardo",
  "São Cristóvão",
  "Tirirical",
  "João de Deus",
  "Vila Janaína",
  "Cidade Operária",
  "Cidade Olímpica",
  "Santa Efigênia",
  "Santa Clara",
  "Santa Bárbara",
  "Vila Isabel Cafeteira",
  "Vila Brasil",
  "Vila Cascavel",
  "Vila Apaco",
  "Vila América",
  "Novo Angelim",
  "Jardim das Margaridas",
  "Parque dos Sabiás",
  "Recanto dos Nobres",
  "Recanto dos Pássaros",
  "Recanto dos Signos",
];
export const BAIRROS_90 = [
  "Sol e Mar",
  "Vila Luizão",
  "Divinéia",
  "Alto do Turu",
  "Ipem Turu",
  "Anjo da Guarda",
  "Alto da Esperança",
  "Bonfim",
  "Cajueiro",
  "Cidade Nova",
  "Fumacê",
  "Gancharia",
  "Gapara",
  "Itaqui",
  "Jambeiro",
  "Mauro Fecury I",
  "Mauro Fecury II",
  "Piancó",
  "Porto Grande",
  "Sá Viana",
  "São Raimundo",
  "Tamancão",
  "Vila Ariri",
  "Vila Bacanga",
  "Vila Collier",
  "Vila Embratel",
  "Vila Isabel",
  "Vila Maranhão",
  "Vila Nova",
  "Vila São Luís",
  "Vila Tiradentes",
];
export const BAIRROS_80_NORM = BAIRROS_80.map(normalizar);
export const BAIRROS_90_NORM = BAIRROS_90.map(normalizar);
// Fallback offline. Em produção o preço vem da tabela neighborhood_pricing
// (useNeighborhoodPricing) via BairrosContext — editável na aba Sistema.
export function precoBairro(bairro) {
  const n = normalizar(bairro);
  if (!n) return undefined;
  if (BAIRROS_80_NORM.includes(n)) return 80;
  if (BAIRROS_90_NORM.includes(n)) return 90;
  return null; // não reconhecido
}
export const BAIRROS_FALLBACK = {
  bairros: [],
  nomes: [...new Set([...BAIRROS_80, ...BAIRROS_90])].sort((a, b) => a.localeCompare(b, "pt-BR")),
  preco: precoBairro,
  loading: false,
  error: null,
  salvando: false,
  salvar: async () => {
    throw new Error("Preços de bairro indisponíveis offline.");
  },
  remover: async () => {
    throw new Error("Preços de bairro indisponíveis offline.");
  },
  refetch: () => {},
};
export const BairrosContext = React.createContext(BAIRROS_FALLBACK);
export const useBairros = () => useContext(BairrosContext) || BAIRROS_FALLBACK;

/* ============================= status ============================= */
// Sem cor de status (pedido do dono) — o texto e um marcador monocromático
// bastam. `cancelada` mantém um leve vermelho por ser ação destrutiva.
export const STATUS_META = {
  pendente: { emoji: "○", label: "Pendente", cor: C.inkSoft, bg: C.panel2 },
  confirmada: { emoji: "●", label: "Confirmada", cor: C.inkSoft, bg: C.panel2 },
  embarcado: { emoji: "✓", label: "Embarcado", cor: C.ink, bg: C.panel2 },
  cancelada: { emoji: "✕", label: "Cancelada", cor: C.red, bg: C.redSoft },
  nao_compareceu: { emoji: "–", label: "Não compareceu", cor: C.inkFaint, bg: C.panel2 },
  espera: { emoji: "…", label: "Lista de espera", cor: C.inkSoft, bg: C.panel2 },
};
export const OCUPA_VAGA = ["confirmada", "embarcado"];

// Quem busca o passageiro "em casa" em São Luís (issue #96). Todos nascem
// 'taxi' (o padrão — não precisa marcar). Só sinalizamos os que o Gustavo
// (proprio) ou o Maurício (motorista) vão buscar. Um toque cicla
// táxi → Gustavo → Maurício → táxi.
export const BUSCA_MODOS = {
  taxi: { label: "Táxi", Icon: CarTaxiFront, cor: C.inkFaint, bg: C.panel2 },
  proprio: { label: "Gustavo", Icon: Car, cor: C.ink, bg: C.panel2 },
  motorista: { label: "Maurício", Icon: Bus, cor: C.ink, bg: C.panel2 },
};
export const BUSCA_PROXIMO = { taxi: "proprio", proprio: "motorista", motorista: "taxi" };

/* Config de rota (pontos, valores, ajuste de segunda) vem do Postgres via
 * useRouteConfig. Ordem de agrupamento da Lista/Agenda: */
export const IDA_PRIORIDADE = { rodoviaria: 0, retorno: 1, postocarone: 2, br: 3 };
export const IDA_ORDEM_SECOES = ["busca", "rodoviaria", "retorno", "postocarone", "br"];
export const VOLTA_ORDEM = ["cantanhede", "pirapemas"];

/* ---- Desembarque (rota do motorista) — ver database/10-dropoff-plan.sql --- */
// Baldes de entrega por direção, na ordem em que o ônibus os alcança.
export const DESEMBARQUE_IDA = [
  { id: "cantanhede", label: "Cantanhede" },
  { id: "pirapemas", label: "Pirapemas" },
  { id: "outro", label: "Outros locais" },
];
export const DESEMBARQUE_VOLTA = [
  { id: "br", label: "BR (ponto de referência)" },
  { id: "retorno", label: "Retorno" },
  { id: "rodoviaria", label: "Rodoviária" },
  { id: "casa", label: "Em casa (bairro)" },
];
export const baldesDesembarque = (direcao) => (direcao === "ida" ? DESEMBARQUE_IDA : DESEMBARQUE_VOLTA);
export const rotuloBalde = (direcao, id) =>
  baldesDesembarque(direcao).find((b) => b.id === id)?.label || id;

// Rótulo/placeholder do campo de detalhe do desembarque, por balde. `req`
// = o cliente é obrigado a preencher (BR precisa de referência, casa
// precisa do bairro, "outro" precisa dizer onde).
export const DETALHE_DESEMBARQUE = {
  cantanhede: { label: "Onde em Cantanhede", ph: "Rua / ponto de referência", req: false },
  pirapemas: { label: "Onde em Pirapemas", ph: "Rua / ponto de referência", req: false },
  outro: { label: "Onde você vai ficar", ph: "Descreva o local", req: true },
  br: { label: "Ponto de referência na BR", ph: "Km, o que tem por perto", req: true },
  retorno: { label: "Ponto de referência (opcional)", ph: "", req: false },
  rodoviaria: { label: "Ponto de referência (opcional)", ph: "", req: false },
  casa: { label: "Bairro onde vai ficar", ph: "Ex.: Cohama", req: true },
};
export const detalheDesembarqueObrigatorio = (area) => !!DETALHE_DESEMBARQUE[area]?.req;

// Baldes de desembarque vivos (database/24-baldes-desembarque.sql) via
// contexto — os arrays acima viram fallback offline. Mesmo contrato:
//   porDirecao(dir) -> [{ code, label, ... }]
//   rotulo(dir,code) / detalhe(dir,code) -> {label,ph,req} / obrigatorio(dir,code)
export const DROPOFF_FALLBACK = (() => {
  const norm = (dir, arr) =>
    arr.map((b) => ({
      code: b.id,
      label: b.label,
      direction: dir,
      detail_label: DETALHE_DESEMBARQUE[b.id]?.label || "Ponto de referência",
      detail_placeholder: DETALHE_DESEMBARQUE[b.id]?.ph || "",
      detail_required: !!DETALHE_DESEMBARQUE[b.id]?.req,
      active: true,
    }));
  const ida = norm("ida", DESEMBARQUE_IDA);
  const volta = norm("volta", DESEMBARQUE_VOLTA);
  return {
    todas: [...ida, ...volta],
    ida,
    volta,
    porDirecao: (dir) => (dir === "ida" ? ida : volta),
    rotulo: rotuloBalde,
    detalhe: (_dir, code) => ({
      label: DETALHE_DESEMBARQUE[code]?.label || "Ponto de referência",
      ph: DETALHE_DESEMBARQUE[code]?.ph || "",
      req: !!DETALHE_DESEMBARQUE[code]?.req,
    }),
    obrigatorio: (_dir, code) => detalheDesembarqueObrigatorio(code),
    loading: false,
    error: null,
    salvando: false,
    criar: async () => {
      throw new Error("Locais de desembarque indisponíveis offline.");
    },
    editar: async () => {
      throw new Error("Locais de desembarque indisponíveis offline.");
    },
    remover: async () => {
      throw new Error("Locais de desembarque indisponíveis offline.");
    },
    refetch: () => {},
  };
})();
export const DropoffContext = React.createContext(DROPOFF_FALLBACK);
export const useDropoff = () => useContext(DropoffContext) || DROPOFF_FALLBACK;

// Sino de notificações — provido uma vez no AppInner (uma assinatura de
// Realtime só) e consumido pelo <SinoNotificacoes> dentro do <Header>.
export const NotificacoesContext = React.createContext(null);
export const useNotificacoesCtx = () => useContext(NotificacoesContext);

// String legível para dropoff_location (usada na Lista/Agenda e telas de
// sucesso). O que estrutura a rota é dropoff_area/dropoff_detail.
export function textoDesembarque(direcao, area, detalhe) {
  if (!area) return null;
  const rotulo = rotuloBalde(direcao, area);
  const d = (detalhe || "").trim();
  return d ? `${rotulo} — ${d}` : rotulo;
}

// Balde da reserva: usa a classificação manual (dropoff_area) se existir;
// senão chuta pelo texto livre que o cliente deu no agendamento.
export function inferirBaldeDesembarque(r) {
  if (r.desembarqueArea) return r.desembarqueArea;
  const t = normalizar(`${r.desembarque || ""} ${r.referencia || ""} ${r.rua || ""}`);
  if (r.direcao === "ida") {
    if (t.includes("cantanhede")) return "cantanhede";
    if (t.includes("pirapemas")) return "pirapemas";
    return "outro";
  }
  if (t.includes("rodovi")) return "rodoviaria";
  if (t.includes("retorno")) return "retorno";
  if (/(^|\s)br($|\s|-)|br135|(^|\s)km(\s|$)/.test(t)) return "br";
  return "casa";
}

// Texto que o motorista precisa pra achar o endereço (detalhe manual ou o
// melhor palpite a partir do que já foi informado).
export function detalheDesembarque(r) {
  if (r.desembarqueDetalhe) return r.desembarqueDetalhe;
  const balde = inferirBaldeDesembarque(r);
  if (balde === "casa") return r.bairro || r.desembarque || "";
  if (balde === "br") return r.referencia || r.desembarque || r.rua || "";
  return r.desembarque || r.referencia || "";
}

/* ============================= animation shell ============================= */

// Chip de "quem busca em casa" (issue #96) — um toque cicla
// Táxi → Nós → Motorista → Táxi. `dense` = variante compacta da Agenda.
// Só sinaliza quem o Gustavo/Maurício buscam; táxi (o padrão) fica
// apagado. Um toque cicla táxi → Gustavo → Maurício → táxi. Sem espera:
// a mudança é otimista no hook.
export function BuscaChip({ r, onCycle, dense = false }) {
  const modo = BUSCA_MODOS[r.buscaPor] ? r.buscaPor : "taxi";
  const m = BUSCA_MODOS[modo];
  const taxi = modo === "taxi";
  return (
    <button
      type="button"
      onClick={() => onCycle(r.id, modo)}
      className={`btn-press inline-flex items-center gap-1 rounded-full font-semibold ${
        dense ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-1"
      }`}
      style={{
        background: taxi ? "transparent" : C.panel2,
        color: taxi ? C.inkFaint : C.ink,
        border: `1px solid ${taxi ? C.borderSoft : C.border}`,
      }}
      aria-label="Mudar quem busca este passageiro"
    >
      <m.Icon size={dense ? 11 : 13} />
      {taxi ? "Táxi" : m.label}
    </button>
  );
}

export function HeroFX() {
  return (
    <div className="hero-fx" aria-hidden="true">
      <div className="hero-fx-bus">
        <svg viewBox="0 0 232 84" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
          <path d="M226 42 L232 26 L232 62 Z" fill="#ffdca6" opacity="0.4" />
          <path
            d="M6 20c0-6 4-10 10-10h150c22 0 40 12 48 30l4 9c1 3 2 6 2 9v7c0 4-3 7-7 7h-12a15 15 0 0 0-30 0H70a15 15 0 0 0-30 0H14c-4 0-8-3-8-8V20Z"
            fill="#050506"
            stroke="rgba(228,18,31,0.55)"
            strokeWidth="1.4"
          />
          <g fill="rgba(255,255,255,0.07)">
            <rect x="20" y="20" width="24" height="16" rx="3" />
            <rect x="50" y="20" width="24" height="16" rx="3" />
            <rect x="80" y="20" width="24" height="16" rx="3" />
            <rect x="110" y="20" width="24" height="16" rx="3" />
            <rect x="140" y="20" width="22" height="16" rx="3" />
          </g>
          <rect x="6" y="43" width="196" height="3" rx="1.5" fill="#E4121F" opacity="0.85" />
          <circle cx="54" cy="70" r="10" fill="#0b0b0d" stroke="#2b2b30" strokeWidth="2" />
          <circle cx="186" cy="70" r="10" fill="#0b0b0d" stroke="#2b2b30" strokeWidth="2" />
        </svg>
      </div>
      <span className="hero-fx-spark s1" />
      <span className="hero-fx-spark s2" />
      <span className="hero-fx-spark s3" />
    </div>
  );
}

/* ===================== BUSCA GLOBAL ============================= */
// Lupa fixa no topo (todas as telas) + atalho "/" e Ctrl/⌘+K no desktop.
// Resultados agrupados: passageiros, reservas, viagens e "ir para" (telas).

// Reconhece dd/mm, dd/mm/aaaa, dd-mm, aaaa-mm-dd → ISO aaaa-mm-dd.

export const NOTIF_META = {
  lotacao: { label: "Lotação", Icon: Users },
  cancelamento: { label: "Cancelamento", Icon: X },
  mudanca_embarque: { label: "Mudança de embarque", Icon: MapPin },
  mudanca_desembarque: { label: "Mudança de desembarque", Icon: MapPin },
  pendencia: { label: "Pendência", Icon: Inbox },
};
export function tempoRelativo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `há ${d} d`;
  // dia civil de São Luís, não UTC — das 21h à meia-noite local o
  // `.toISOString()` puro já mostra o dia seguinte (mesmo bug de sempre).
  return fmtDate(fmtDiaFuso.format(new Date(iso)));
}
// Sino de notificações — usa o contexto provido no AppInner (uma
// assinatura de Realtime). Painel com as últimas notificações da equipe:
// lotação, cancelamento e mudança de embarque/desembarque.
export function SinoNotificacoes() {
  const ctx = useNotificacoesCtx();
  const [aberto, setAberto] = useState(false);
  if (!ctx) return null;
  const { notificacoes, naoLidas, marcarLida, marcarTodasLidas, loading } = ctx;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label={`Notificações${naoLidas ? ` (${naoLidas} não lidas)` : ""}`}
        className="btn-press relative w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.inkSoft }}
      >
        <Bell size={16} />
        {naoLidas > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: C.brand, color: "#fff" }}
          >
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>
      {aberto && (
        <>
          <button
            type="button"
            aria-label="Fechar notificações"
            className="fixed inset-0 z-40"
            onClick={() => setAberto(false)}
          />
          <div
            className="absolute right-0 mt-2 w-[min(92vw,360px)] max-h-[70vh] overflow-y-auto rounded-xl border shadow-xl z-50 anim-fadeUp"
            style={{ background: C.panel, borderColor: C.border }}
          >
            <div
              className="flex items-center justify-between px-3 py-2 border-b sticky top-0"
              style={{ borderColor: C.borderSoft, background: C.panel }}
            >
              <span className="text-sm font-semibold" style={{ color: C.ink }}>
                Notificações
              </span>
              {naoLidas > 0 && (
                <button
                  type="button"
                  onClick={() => marcarTodasLidas()}
                  className="btn-press text-[11px] px-2 py-1 rounded-md"
                  style={{ background: C.panel2, color: C.inkSoft }}
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>
            {loading && notificacoes.length === 0 && (
              <div className="px-3 py-6 text-center text-xs" style={{ color: C.inkFaint }}>
                carregando…
              </div>
            )}
            {!loading && notificacoes.length === 0 && (
              <div className="px-3 py-6 text-center text-xs" style={{ color: C.inkFaint }}>
                Nenhuma notificação.
              </div>
            )}
            <ul>
              {notificacoes.map((n) => {
                const meta = NOTIF_META[n.kind] || { label: n.kind, Icon: Bell };
                const Icon = meta.Icon;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => !n.lida && marcarLida(n.id)}
                      className="w-full text-left px-3 py-2.5 flex gap-2.5 border-b"
                      style={{
                        borderColor: C.borderSoft,
                        background: n.lida ? "transparent" : C.panel2,
                      }}
                    >
                      <span
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
                        style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.inkSoft }}
                      >
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {!n.lida && (
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: C.brand }}
                            />
                          )}
                          <span
                            className="text-[13px] font-semibold leading-snug"
                            style={{ color: C.ink, overflowWrap: "anywhere" }}
                          >
                            {n.title}
                          </span>
                        </span>
                        {n.body && (
                          <span
                            className="block text-xs mt-0.5 leading-snug"
                            style={{ color: C.inkSoft, overflowWrap: "anywhere" }}
                          >
                            {n.body}
                          </span>
                        )}
                        <span className="block text-[10px] mt-1" style={{ color: C.inkFaint }}>
                          {meta.label} · {tempoRelativo(n.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
export function Header({ title, subtitle, right }) {
  return (
    <div className="relative px-6 md:px-10 pr-6 md:pr-16 pt-5 md:pt-8 pb-5 flex items-start justify-between flex-wrap gap-3 anim-fadeUp">
      <BusSilhueta
        className="absolute pointer-events-none hidden md:block bus-drift"
        style={{ width: 132, right: 12, top: 6, opacity: 0.9 }}
        color={C.brand}
        opacity={0.07}
      />
      <div>
        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: "1.5rem",
            color: C.ink,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-1" style={{ color: C.inkSoft }}>
            {subtitle}
          </p>
        )}
        <span className="aritur-road mt-2 block" style={{ width: 56 }} />
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {right}
        <SinoNotificacoes />
      </div>
    </div>
  );
}
export function Card({ children, style, className = "" }) {
  return (
    <div
      className={`card-lift rounded-xl border p-5 ${className}`}
      style={{ background: C.panel, borderColor: C.border, ...style }}
    >
      {children}
    </div>
  );
}
export function Pill({ children, color = C.inkSoft, bg = C.panel2 }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1"
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}
export function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.confirmada;
  return (
    <Pill color={m.cor} bg={m.bg}>
      {m.emoji} {m.label}
    </Pill>
  );
}
export function StatCard({ label, value, icon: Icon, accent = C.blue, hint }) {
  return (
    <Card className="relative overflow-hidden">
      <span
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 3, background: accent, opacity: 0.9 }}
      />
      <div className="flex items-start justify-between gap-2">
        <div
          className="text-[11px] leading-tight"
          style={{ color: C.inkSoft, minHeight: "2.2em" }}
        >
          {label}
        </div>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accent}1f`, border: `1px solid ${accent}33` }}
        >
          <Icon size={16} style={{ color: accent }} />
        </div>
      </div>
      <div
        className="truncate mt-1.5"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          fontSize: "clamp(0.9rem, 2vw, 1.28rem)",
          fontVariantNumeric: "tabular-nums",
          color: C.ink,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[10px] mt-1" style={{ color: C.inkFaint }}>
          {hint}
        </div>
      )}
    </Card>
  );
}
export function MiniStat({ label, value, cor }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wide" style={{ color: C.inkFaint }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          fontSize: "1.1rem",
          color: cor || C.ink,
        }}
      >
        {value}
      </div>
    </div>
  );
}
// Barra de ocupação: enche com animação (bar-grow). Sem cor de status — a
// leitura é pelo número (X/Y e %) e pela palavra "LOTADO" quando cheia.
export function CapacidadeBar({ ocupados, total, altura = 8, mostrarTexto = true, prefixo }) {
  const pct = total > 0 ? Math.min(100, Math.round((ocupados / total) * 100)) : 0;
  const lotado = pct >= 100;
  const cor = lotado ? C.ink : C.inkSoft;
  return (
    <div>
      {mostrarTexto && (
        <div className="flex items-center justify-between text-[11px] mb-1">
          <span style={{ color: C.inkSoft }}>
            {prefixo && (
              <b className="mr-1.5 tracking-wide" style={{ color: cor }}>
                {prefixo}
              </b>
            )}
            {ocupados}/{total}
            {prefixo ? "" : " passageiros"}
          </span>
          <span className="font-bold" style={{ color: cor, fontFamily: "'JetBrains Mono', monospace" }}>
            {pct}%{lotado ? " · LOTADO" : ""}
          </span>
        </div>
      )}
      <div
        className="rounded-full overflow-hidden"
        style={{ height: altura, background: C.panel2 }}
      >
        <div
          className="bar-fill bar-grow h-full rounded-full"
          style={{ width: `${pct}%`, background: cor }}
        />
      </div>
    </div>
  );
}

// Divisor de direção (IDA / VOLTA) com "estrada" tracejada dos dois lados.
export function DirecaoDivisor({ label, cor }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="flex-1 aritur-road" style={{ opacity: 0.5 }} />
      <span
        className="px-3.5 py-1 rounded-full text-xs font-bold tracking-[0.15em]"
        style={{
          background: `${cor}1f`,
          color: cor,
          border: `1px solid ${cor}44`,
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        {label}
      </span>
      <span className="flex-1 aritur-road" style={{ opacity: 0.5, transform: "scaleX(-1)" }} />
    </div>
  );
}

// Sub-navegação em pílulas (usada em Lista, Financeiro, Gestão).
export function SubTabs({ value, onChange, options }) {
  return (
    <div
      className="inline-flex gap-1 rounded-xl p-1"
      style={{ background: C.panel2, border: `1px solid ${C.border}` }}
    >
      {options.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className="btn-press flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg"
            style={{
              background: active ? C.brand : "transparent",
              color: active ? C.onBrand : C.inkSoft,
              fontWeight: active ? 600 : 500,
              boxShadow: active ? `0 6px 16px -8px ${C.brandGlow}` : "none",
            }}
          >
            {Icon && <Icon size={13} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block text-xs mb-1" style={{ color: C.inkSoft }}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
export const inputStyle = { background: C.panel2, borderColor: C.border, color: C.ink };
export const inputCls = "border rounded-lg px-3 py-2 text-sm w-full outline-none";
export function TextInput(props) {
  return (
    <input
      {...props}
      style={{ ...inputStyle, ...(props.style || {}) }}
      className={`${inputCls} ${props.className || ""}`}
    />
  );
}
export function Select(props) {
  return (
    <select
      {...props}
      style={{ ...inputStyle, ...(props.style || {}) }}
      className={`${inputCls} ${props.className || ""}`}
    />
  );
}
export function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{ ...inputStyle, resize: "vertical", ...(props.style || {}) }}
      className={`${inputCls} ${props.className || ""}`}
    />
  );
}

export const PREFERS_REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Anima um número de 0 até `target` na montagem (e a cada mudança de
// target). Respeita prefers-reduced-motion.
export function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(PREFERS_REDUCED_MOTION ? target : 0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (PREFERS_REDUCED_MOTION) {
      setVal(target);
      return undefined;
    }
    const from = fromRef.current;
    const delta = target - from;
    if (delta === 0) return undefined;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - p) ** 3;
      setVal(from + delta * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}
// Aplica um deep-link {kind:"data", data} da busca global: seleciona a
// data na aba. O guard por `at` evita reaplicar quando a aba desmonta e
// remonta (skeleton do useLazyTab) ou quando o usuário mexe na data à mão.
export function useDeepLinkData(deepLink, setData) {
  const aplicadoEm = useRef(null);
  useEffect(() => {
    if (
      deepLink?.kind === "data" &&
      deepLink.data &&
      deepLink.at !== aplicadoEm.current
    ) {
      aplicadoEm.current = deepLink.at;
      setData(deepLink.data);
    }
  }, [deepLink, setData]);
}
// Idem para telas com sub-abas (Financeiro, Gestão): aplica deepLink.sub.
export function useDeepLinkSubview(deepLink, setSubview) {
  const aplicadoEm = useRef(null);
  useEffect(() => {
    if (deepLink?.kind === "subview" && deepLink.sub && deepLink.at !== aplicadoEm.current) {
      aplicadoEm.current = deepLink.at;
      setSubview(deepLink.sub);
    }
  }, [deepLink, setSubview]);
}
export function pontoDe(reserva, trips) {
  return trips[reserva.direcao]?.pontos.find((p) => p.id === reserva.pontoId);
}
export function labelLocal(reserva, trips) {
  const p = pontoDe(reserva, trips);
  if (!p) return "—";
  if (p.id === "busca") return reserva.bairro || "bairro não informado";
  if (p.id === "outro" && reserva.localOutro) return reserva.localOutro;
  if (p.id === "br" && reserva.localExato) return `BR (${reserva.localExato})`;
  return p.nome;
}
/** formato pedido: para busca em casa "NP - BAIRRO - TELEFONE"; para os demais "NP Local (telefone)" */
export function linhaReserva(r, trips) {
  if (r.pontoId === "busca")
    return `${r.quantidade}P - ${(r.bairro || "bairro não informado").toUpperCase()} - ${r.telefone}`;
  return `${r.quantidade}P ${labelLocal(r, trips)} (${r.telefone})`;
}
// Endereço de embarque legível e COMPLETO (nunca cortado) para o celular
// do motorista: local/bairro + rua + ponto de referência, na ordem útil.
// Junta os campos estruturados de detalhe/rua/referência num só texto —
// é o valor de partida do campo "Anotação" ao editar (rescrever à mão em
// vez de mexer em 3 caixinhas separadas). Ver EditarReservaModal.
export function anotacaoBase(r) {
  return [r.localExato, r.rua, r.referencia && `ref.: ${r.referencia}`].filter(Boolean).join(" · ");
}
export function enderecoEmbarque(r, trips) {
  const partes = [];
  const local = labelLocal(r, trips);
  if (local && local !== "—") partes.push(local);
  if (r.rua && !partes.includes(r.rua)) partes.push(r.rua);
  if (r.localExato && !partes.includes(r.localExato)) partes.push(r.localExato);
  if (r.referencia) partes.push(`ref.: ${r.referencia}`);
  return partes.join(" · ");
}
// Endereços que um passageiro mais usa (CRM). Conta ocorrências de um
// texto normalizado e devolve os 3 mais frequentes, com a contagem.
export function enderecosFrequentes(viagens, getTexto) {
  const cont = new Map();
  for (const v of viagens) {
    const t = (getTexto(v) || "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    const cur = cont.get(k) || { texto: t, n: 0 };
    cur.n += 1;
    cont.set(k, cur);
  }
  return [...cont.values()].sort((a, b) => b.n - a.n).slice(0, 3);
}
export function vagasDisponiveis(reservas, data, direcao, capacidade) {
  const usados = reservas
    .filter((r) => r.data === data && r.direcao === direcao && OCUPA_VAGA.includes(r.status))
    .reduce((s, r) => s + (r.quantidade || 1), 0);
  return Math.max(0, capacidade - usados);
}

/* diagnóstico e auto-correção */
export function runDiagnostics(reservas, capacidade, trips) {
  const issues = [];
  const fixed = [];
  const porChave = {};
  const corrigidas = reservas.map((r) => {
    const novo = { ...r };
    if (!novo.quantidade || novo.quantidade < 1 || Number.isNaN(Number(novo.quantidade))) {
      fixed.push(
        `Reserva de ${novo.nome || "cliente sem nome"} tinha quantidade inválida — corrigida para 1.`,
      );
      novo.quantidade = 1;
    }
    if (novo.direcao && !trips[novo.direcao])
      issues.push(`Reserva ${novo.id} com direção inválida (${novo.direcao}).`);
    else if (novo.direcao && !trips[novo.direcao].pontos.find((p) => p.id === novo.pontoId))
      issues.push(`Reserva ${novo.id} aponta para um local de embarque que não existe mais.`);
    if (!novo.telefone)
      issues.push(
        `Reserva de ${novo.nome || "cliente sem nome"} em ${novo.data} está sem telefone de contato.`,
      );
    if (porChave[novo.id]) issues.push(`ID de reserva duplicado: ${novo.id}.`);
    porChave[novo.id] = true;
    return novo;
  });
  const porDiaDirecao = {};
  corrigidas
    .filter((r) => OCUPA_VAGA.includes(r.status) && !["frete", "encomenda"].includes(r.tipo))
    .forEach((r) => {
      const k = `${r.data}__${r.direcao}`;
      porDiaDirecao[k] = (porDiaDirecao[k] || 0) + r.quantidade;
    });
  Object.entries(porDiaDirecao).forEach(([k, total]) => {
    if (total > capacidade) {
      const [data, direcao] = k.split("__");
      issues.push(
        `Possível overbooking em ${fmtDate(data)} (${trips[direcao]?.nome}): ${total}/${capacidade} lugares.`,
      );
    }
  });
  return { corrigidas, issues, fixed };
}

/* ============================= IA operacional & previsão de demanda ============================= */
export const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
export function previsaoDemanda(reservas) {
  const porDia = {};
  reservas
    .filter((r) => OCUPA_VAGA.includes(r.status) && !["frete", "encomenda"].includes(r.tipo))
    .forEach((r) => {
      const wd = new Date(`${r.data}T12:00:00`).getDay();
      if (!porDia[wd]) porDia[wd] = { soma: 0, datas: new Set() };
      porDia[wd].soma += r.quantidade;
      porDia[wd].datas.add(r.data);
    });
  const medias = {};
  Object.entries(porDia).forEach(([wd, v]) => {
    medias[wd] = v.datas.size ? v.soma / v.datas.size : 0;
  });
  const valores = Object.values(medias).filter((v) => v > 0);
  const mediaGeral = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
  return DIAS_SEMANA.map((nome, idx) => ({
    idx,
    nome,
    media: medias[idx] || 0,
    amostras: porDia[idx] ? porDia[idx].datas.size : 0,
    diffPct:
      mediaGeral > 0 && medias[idx]
        ? Math.round(((medias[idx] - mediaGeral) / mediaGeral) * 100)
        : 0,
  }));
}
export function gerarInsightsIA(reservas, operacao, capacidade, trips) {
  const insights = [];
  const hoje = todayStr();
  const doDiaHoje = reservas.filter(
    (r) => r.data === hoje && !["frete", "encomenda"].includes(r.tipo),
  );

  ["ida", "volta"].forEach((dir) => {
    const itens = doDiaHoje.filter((r) => r.direcao === dir);
    const confirmados = itens
      .filter((r) => OCUPA_VAGA.includes(r.status))
      .reduce((s, r) => s + r.quantidade, 0);
    if (confirmados === 0) return;
    const horaRef =
      dir === "ida"
        ? trips.ida.pontos.find((p) => p.id === "rodoviaria")?.horaBase || "05:40"
        : trips.volta.pontos.map((p) => p.horaBase).join("/");
    const pct = capacidade ? confirmados / capacidade : 0;
    if (pct >= 1)
      insights.push({
        nivel: "alerta",
        emoji: "🔴",
        msg: `A viagem das ${horaRef} (${trips[dir].nome}) está LOTADA — ${confirmados}/${capacidade} passageiros.`,
      });
    else if (pct >= 0.85)
      insights.push({
        nivel: "alerta",
        emoji: "⚠️",
        msg: `A viagem das ${horaRef} (${trips[dir].nome}) está com ${confirmados} passageiros — perto de lotar (${capacidade - confirmados} vaga(s)).`,
      });
  });

  const pendentesHoje = doDiaHoje.filter((r) => r.status === "pendente").length;
  if (pendentesHoje > 0)
    insights.push({
      nivel: "alerta",
      emoji: "⚠️",
      msg: `Existem ${pendentesHoje} reserva(s) pendente(s) aguardando confirmação hoje.`,
    });

  const semPagar = doDiaHoje.filter((r) => OCUPA_VAGA.includes(r.status) && !r.pago);
  semPagar.slice(0, 3).forEach((r) =>
    insights.push({
      nivel: "alerta",
      emoji: "⚠️",
      msg: `${r.nome || "Um cliente"} ainda não realizou o pagamento (${fmtBRL(r.valorTotal || 0)}).`,
    }),
  );
  if (semPagar.length > 3)
    insights.push({
      nivel: "alerta",
      emoji: "⚠️",
      msg: `+ ${semPagar.length - 3} outra(s) reserva(s) de hoje sem pagamento confirmado.`,
    });

  (operacao.manutencoes || []).forEach((m) => {
    const kmDesde = (operacao.registros || [])
      .filter((r) => r.data >= m.data)
      .reduce((s, r) => s + r.km, 0);
    const pct = m.intervaloKm ? (kmDesde / m.intervaloKm) * 100 : 0;
    if (pct >= 100)
      insights.push({
        nivel: "alerta",
        emoji: "🔴",
        msg: `O veículo está com a manutenção "${m.tipo}" VENCIDA (${Math.round(pct)}% do intervalo).`,
      });
    else if (pct >= 80)
      insights.push({
        nivel: "alerta",
        emoji: "⚠️",
        msg: `O veículo está próximo da manutenção "${m.tipo}" (${Math.round(pct)}% do intervalo percorrido).`,
      });
  });

  const regs = operacao.registros || [];
  if (regs.length >= 3) {
    const ultimo = [...regs].sort((a, b) => a.data.localeCompare(b.data)).slice(-1)[0];
    if (ultimo.km > 0) {
      const anteriores = regs.filter((r) => r.id !== ultimo.id && r.km > 0);
      if (anteriores.length > 0) {
        const media = anteriores.reduce((s, r) => s + r.combustivel / r.km, 0) / anteriores.length;
        const atual = ultimo.combustivel / ultimo.km;
        if (media > 0 && atual > media * 1.2)
          insights.push({
            nivel: "alerta",
            emoji: "⚠️",
            msg: `Consumo de combustível ${Math.round(((atual - media) / media) * 100)}% acima do normal no último registro — vale checar o veículo.`,
          });
      }
    }
  }

  const emEspera = reservas.filter((r) => r.status === "espera").length;
  if (emEspera > 0)
    insights.push({
      nivel: "info",
      emoji: "⏳",
      msg: `${emEspera} cliente(s) na lista de espera aguardando vaga.`,
    });

  const demanda = previsaoDemanda(reservas);
  const hojeWd = new Date(`${hoje}T12:00:00`).getDay();
  const hojeInfo = demanda.find((d) => d.idx === hojeWd);
  if (hojeInfo && hojeInfo.amostras >= 2 && hojeInfo.diffPct >= 10)
    insights.push({
      nivel: "info",
      emoji: "📈",
      msg: `${hojeInfo.nome} costuma ter ocupação ${hojeInfo.diffPct}% maior que a média.`,
    });
  else if (hojeInfo && hojeInfo.amostras >= 2 && hojeInfo.diffPct <= -10)
    insights.push({
      nivel: "info",
      emoji: "📉",
      msg: `${hojeInfo.nome} costuma ter ocupação ${Math.abs(hojeInfo.diffPct)}% menor que a média.`,
    });
  const melhorDia = [...demanda]
    .filter((d) => d.amostras >= 2)
    .sort((a, b) => b.diffPct - a.diffPct)[0];
  if (melhorDia && melhorDia.idx !== hojeWd && melhorDia.diffPct >= 10)
    insights.push({
      nivel: "info",
      emoji: "📈",
      msg: `${melhorDia.nome} costuma ter ocupação ${melhorDia.diffPct}% maior — bom dia para reforçar a divulgação.`,
    });

  if (insights.length === 0)
    insights.push({
      nivel: "sucesso",
      emoji: "✅",
      msg: "Nenhum alerta no momento — operação dentro do esperado.",
    });
  return insights;
}

/* ============================= app shell ============================= */
// Janela de reservas carregada no painel: 45 dias atrás → 90 à frente.
// Cobre a operação do dia, o histórico recente e o agendamento antecipado
// (regional — raramente > 2 meses). Datas fora disso: a busca global e o
// CRM (paginado no servidor, v_customers_stats) consultam o banco direto.
// (issue #10 — ver APP-INTEGRATION-PLAN.md)

export function BotaoAgendar({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium shrink-0"
      style={{ background: C.amber, color: C.onBrand }}
    >
      <Plus size={14} /> Agendar
    </button>
  );
}

/* ============================= 5. FINANCEIRO (com lucro real) ============================= */
// Categorias fixas de despesa — combustível/manutenção também chegam
// sozinhas via trigger (Operação), mas continuam escolhíveis aqui pra
// cobrir um lançamento manual (ex.: abastecimento pago sem passar pela
// aba Operação).
export const CATEGORIAS_DESPESA = [
  { id: "combustivel", label: "Combustível", icon: Fuel },
  { id: "alimentacao", label: "Alimentação", icon: UtensilsCrossed },
  { id: "motorista", label: "Motorista(s)", icon: Users },
  { id: "manutencao", label: "Manutenção", icon: Wrench },
  { id: "outro", label: "Outro", icon: Receipt },
];
// Categorias de RECEITA do lançamento manual (auditoria 2026-09-16: sem
// isto, todo lançamento de receita caía sempre em "outro" — a origem real
// (passagem vendida fora do Reservar, ex. dinheiro na hora) ficava
// escondida dos relatórios por categoria). A receita automática (trigger
// de pagamento confirmado) já usa 'passagem' — aqui só cobre o manual.
export const CATEGORIAS_RECEITA = [
  { id: "passagem", label: "Passagem", icon: Bus },
  { id: "outro", label: "Outro", icon: Receipt },
];
// estorno/reembolso/ajuste são categorias de AJUSTE ligadas a uma reserva
// (ver database/18-receita-automatica-contas-a-receber.sql) — não aparecem
// nos botões rápidos de lançamento manual, só na tabela de lançamentos.
export const ROTULOS_AJUSTE = { estorno: "Estorno", reembolso: "Reembolso", ajuste: "Ajuste" };

// --- Gestão Operacional: os 14 custos empresariais pedidos, agrupados
// para uma leitura de DRE. São categorias de `financial_entries`
// (type='despesa') distintas das do caixa do dia (combustível etc.) e da
// manutenção preventiva (que é 'manutencao', automática da aba Operação).
// Ver database/19-gestao-operacional.sql.
export const CATEGORIAS_GESTAO = [
  { id: "salario", label: "Salários", grupo: "Pessoal", icon: Users },
  { id: "pro_labore", label: "Pró-labore", grupo: "Pessoal", icon: Users },
  { id: "imposto", label: "Impostos", grupo: "Impostos & Taxas", icon: Landmark },
  { id: "taxa_bancaria", label: "Taxas bancárias", grupo: "Impostos & Taxas", icon: Landmark },
  { id: "taxa_cartao", label: "Taxas de cartão", grupo: "Impostos & Taxas", icon: CreditCard },
  { id: "seguro", label: "Seguro", grupo: "Veículo", icon: ShieldCheck },
  { id: "ipva", label: "IPVA / Licenciamento", grupo: "Veículo", icon: Receipt },
  { id: "pneu", label: "Pneus", grupo: "Veículo", icon: Bus },
  { id: "lavagem", label: "Lavagem", grupo: "Veículo", icon: Sparkles },
  { id: "peca", label: "Peças", grupo: "Veículo", icon: Package },
  { id: "manutencao_corretiva", label: "Manutenção corretiva", grupo: "Veículo", icon: Wrench },
  { id: "depreciacao", label: "Depreciação", grupo: "Estrutura", icon: TrendingUp },
  { id: "despesa_administrativa", label: "Despesas administrativas", grupo: "Estrutura", icon: Receipt },
  { id: "outro_recorrente", label: "Outras despesas recorrentes", grupo: "Estrutura", icon: Receipt },
];
export const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export const rotuloCategoriaDespesa = (id) =>
  CATEGORIAS_DESPESA.find((c) => c.id === id)?.label ||
  ROTULOS_AJUSTE[id] ||
  CATEGORIAS_GESTAO.find((c) => c.id === id)?.label ||
  "Outro";

// --- Categorias de despesa vivas (database/22-categorias-de-despesa.sql) ---
// A lista real vem do banco (useExpenseCategories) via este contexto; as
// constantes acima viram só o fallback (offline / e2e sem login / antes do
// primeiro fetch). Assim as telas de Gestão e Financeiro passam a oferecer
// as categorias personalizadas que o dono criar, sem prop-drilling.
export const CATEGORIAS_FALLBACK = (() => {
  const norm = (c, kind) => ({ slug: c.id, label: c.label, grupo: c.grupo || "Estrutura", kind });
  const gestao = CATEGORIAS_GESTAO.map((c) => norm(c, "gestao"));
  const despesa = CATEGORIAS_DESPESA.map((c) => norm(c, "despesa"));
  const gruposDe = (l) => [...new Set(l.map((c) => c.grupo))];
  const bySlug = Object.fromEntries([...gestao, ...despesa].map((c) => [c.slug, c]));
  return {
    todas: [...gestao, ...despesa],
    gestao,
    despesa,
    gruposGestao: gruposDe(gestao),
    gruposDespesa: gruposDe(despesa),
    rotulo: (slug) => bySlug[slug]?.label || rotuloCategoriaDespesa(slug),
    grupo: (slug) => bySlug[slug]?.grupo || "Estrutura",
    existe: (slug) => Boolean(bySlug[slug]),
    slugsGestao: new Set(gestao.map((c) => c.slug)),
    loading: false,
    error: null,
    salvando: false,
    criar: async () => {
      throw new Error("Categorias indisponíveis offline.");
    },
    editar: async () => {
      throw new Error("Categorias indisponíveis offline.");
    },
    remover: async () => {
      throw new Error("Categorias indisponíveis offline.");
    },
    refetch: () => {},
  };
})();
export const CategoriasContext = React.createContext(CATEGORIAS_FALLBACK);
export const useCategorias = () => useContext(CategoriasContext) || CATEGORIAS_FALLBACK;

// nome (string, vindo do banco) -> componente de ícone lucide
export const ICONE_CATEGORIA = {
  Users, Landmark, CreditCard, ShieldCheck, Receipt, Bus, Sparkles, Package,
  Wrench, TrendingUp, Fuel, UtensilsCrossed,
};
export const iconeCategoria = (nome) => ICONE_CATEGORIA[nome] || Receipt;

// Mapeia a linha do banco (financial_entries) para o formato que a tela usa.
export function mapEntry(e) {
  return {
    id: e.id,
    data: e.entry_date,
    tipo: e.type,
    valor: Number(e.amount) || 0,
    descricao: e.description || "",
    categoria: e.category || null,
    // lançamentos gerados por trigger (combustível/manutenção) não são editáveis aqui
    auto: !!(e.fuel_record_id || e.maintenance_id),
    // gerado por um custo recorrente da Gestão — editável normalmente, só marcamos a origem
    deTemplate: !!e.template_id,
    reservationId: e.reservation_id || null,
  };
}
// Soma receita/despesa de uma lista já mapeada por mapEntry.
export function somaTipo(lista, tipo) {
  return lista.filter((f) => f.tipo === tipo).reduce((s, f) => s + f.valor, 0);
}

// mapeamentos banco -> formato da tela
export const mapFuel = (r) => ({
  id: r.id,
  data: r.record_date,
  direcao: r.direction,
  km: Number(r.km) || 0,
  litros: Number(r.liters) || 0,
  combustivel: Number(r.cost) || 0,
});
export const mapManut = (m) => ({
  id: m.id,
  tipo: m.type,
  data: m.performed_at,
  kmAtual: Number(m.odometer_km) || 0,
  intervaloKm: Number(m.interval_km) || 5000,
  custo: Number(m.cost) || 0,
  notas: m.notes || "",
});
