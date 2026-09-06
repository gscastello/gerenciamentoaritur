import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bot,
  Bus,
  Calculator,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  Download,
  Fuel,
  Headset,
  Home as HomeIcon,
  Hourglass,
  Landmark,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  PhoneCall,
  Package,
  Pencil,
  PlayCircle,
  Plus,
  Receipt,
  RefreshCw,
  Repeat,
  Route,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  StopCircle,
  Sunrise,
  Trash2,
  TrendingUp,
  Truck,
  UserCog,
  UserX,
  Users,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  X,
  X as XIcon,
} from "lucide-react";
import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useBackup } from "../hooks/useBackup.js";
import { useCustomers } from "../hooks/useCustomers.js";
import { useEnsureTrips } from "../hooks/useEnsureTrips.js";
import { useContasReceber, useFinanceMonth, useFinanceYear } from "../hooks/useFinance.js";
import { useGlobalSearch } from "../hooks/useGlobalSearch.js";
import { useRecurringExpenses } from "../hooks/useRecurringExpenses.js";
import { useFuelRecords, useMaintenance } from "../hooks/useOperation.js";
import { useReservationsWindow } from "../hooks/useReservations.js";
import { useRouteConfig } from "../hooks/useRouteConfig.js";
import { useSettings } from "../hooks/useSettings.js";
import { useTrips } from "../hooks/useTrips.js";
import { useDrivers, useVehicles } from "../hooks/useVehicles.js";
import {
  abrirRelatorioPDF,
  baixarCSVZip,
  baixarExcel,
  baixarJSON,
} from "../lib/backupExport.js";
import { Presence } from "../ui/motion/index.js";
import { ChartsSkeleton, TabSkeleton } from "../ui/skeletons/TabSkeleton.jsx";

// Recharts é pesado e só o Dashboard usa — carregado sob demanda para sair
// do bundle inicial (ver vite.config.js manualChunks). Issue #2.
const SevenDayCharts = React.lazy(() => import("../ui/charts/SevenDayCharts.jsx"));

/* ============================= tokens =============================
 * Identidade AriTur — fundo quase preto, vermelho da marca nos detalhes.
 * `amber`/`amberSoft` mantêm o nome (centenas de usos) mas agora são o
 * VERMELHO da marca — é a cor de ação/destaque do app inteiro.
 * `warn`/`warnSoft` = âmbar de verdade, só para "pendente / atenção".
 */
const C = {
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
  // âmbar real — pendências / avisos
  warn: "#E8A33D",
  warnSoft: "#2E2413",
  blue: "#5B8DEF",
  blueSoft: "#141E33",
  green: "#34C77B",
  greenSoft: "#0F291D",
  red: "#F0625F",
  redSoft: "#33161A",
  purple: "#9B7BE8",
  purpleSoft: "#201A33",
  gray: "#7D8494",
  graySoft: "#1B1D21",
};
const PIX_KEY = "98981012388";
const PIX_NAME = "A O Castelo Transporte e Turismo";
const CIDADES_INTERMEDIARIAS = [
  "bacabeira",
  "santa rita",
  "entroncamento",
  "colombo",
  "miranda",
  "matões",
  "matoes",
];

// A operação é em São Luís (MA) — UTC-3 o ano inteiro (Brasil não observa
// mais horário de verão desde 2019). "Hoje"/"agora" tem que ser sempre o
// dia civil e a hora de São Luís, nunca o fuso de quem está com o app
// aberto nem UTC puro — `new Date().toISOString()` é UTC e, das 21h à
// meia-noite em São Luís, já mostra o dia seguinte (bug real: reserva
// "de hoje" feita à noite ia pra Agenda de amanhã).
const FUSO_OPERACAO = "America/Fortaleza";
const fmtDiaFuso = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO_OPERACAO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
// `offsetDias` desloca em milissegundos absolutos a partir de agora (nunca
// usa getDate/setDate locais) — o resultado não depende do fuso do
// aparelho, só do relógio real + a formatação final em São Luís.
const dataOperacao = (offsetDias = 0) =>
  fmtDiaFuso.format(new Date(Date.now() + offsetDias * 86400000));
const todayStr = () => dataOperacao();
const fmtBRL = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};
const fmtHora = (iso) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO_OPERACAO,
  });
// Data + hora de um timestamp completo (ex.: created_at de system_backups) —
// nunca cortar a string na mão (`.slice(0,10)`): um timestamp serializado em
// UTC pode cair no dia seguinte ao de São Luís perto da meia-noite.
const fmtDataHora = (iso) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: FUSO_OPERACAO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const isMonday = (d) => new Date(`${d}T12:00:00`).getDay() === 1;
const diaSemana = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
const shiftHour = (hhmm, ativo, horas = 1) => {
  if (!ativo) return hhmm;
  let [h, m] = hhmm.split(":").map(Number);
  h = (h - horas + 24) % 24;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
function contemCidadeIntermediaria(texto) {
  if (!texto) return false;
  const t = texto.toLowerCase();
  return CIDADES_INTERMEDIARIAS.some((c) => t.includes(c));
}
function normalizar(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
function digitos(tel) {
  return (tel || "").replace(/\D/g, "");
}

/* ============================= bairros → precificação de busca em casa ============================= */
const BAIRROS_80 = [
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
const BAIRROS_90 = [
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
const BAIRROS_80_NORM = BAIRROS_80.map(normalizar);
const BAIRROS_90_NORM = BAIRROS_90.map(normalizar);
function precoBairro(bairro) {
  const n = normalizar(bairro);
  if (!n) return undefined;
  if (BAIRROS_80_NORM.includes(n)) return 80;
  if (BAIRROS_90_NORM.includes(n)) return 90;
  return null; // não reconhecido
}

/* ============================= status ============================= */
const STATUS_META = {
  pendente: { emoji: "🟡", label: "Pendente", cor: C.warn, bg: C.warnSoft },
  confirmada: { emoji: "🟢", label: "Confirmada", cor: C.green, bg: C.greenSoft },
  embarcado: { emoji: "🔵", label: "Embarcado", cor: C.blue, bg: C.blueSoft },
  cancelada: { emoji: "🔴", label: "Cancelada", cor: C.red, bg: C.redSoft },
  nao_compareceu: { emoji: "⚫", label: "Não compareceu", cor: C.gray, bg: C.graySoft },
  espera: { emoji: "⏳", label: "Lista de espera", cor: C.purple, bg: C.purpleSoft },
};
const OCUPA_VAGA = ["confirmada", "embarcado"];

/* Config de rota (pontos, valores, ajuste de segunda) vem do Postgres via
 * useRouteConfig. Ordem de agrupamento da Lista/Agenda: */
const IDA_PRIORIDADE = { rodoviaria: 0, retorno: 1, postocarone: 2, br: 3 };
const IDA_ORDEM_SECOES = ["busca", "rodoviaria", "retorno", "postocarone", "br"];
const VOLTA_ORDEM = ["cantanhede", "pirapemas"];

/* ---- Desembarque (rota do motorista) — ver database/10-dropoff-plan.sql --- */
// Baldes de entrega por direção, na ordem em que o ônibus os alcança.
const DESEMBARQUE_IDA = [
  { id: "cantanhede", label: "Cantanhede" },
  { id: "pirapemas", label: "Pirapemas" },
  { id: "outro", label: "Outros locais" },
];
const DESEMBARQUE_VOLTA = [
  { id: "br", label: "BR (ponto de referência)" },
  { id: "retorno", label: "Retorno" },
  { id: "rodoviaria", label: "Rodoviária" },
  { id: "casa", label: "Em casa (bairro)" },
];
const baldesDesembarque = (direcao) => (direcao === "ida" ? DESEMBARQUE_IDA : DESEMBARQUE_VOLTA);
const rotuloBalde = (direcao, id) =>
  baldesDesembarque(direcao).find((b) => b.id === id)?.label || id;

// Rótulo/placeholder do campo de detalhe do desembarque, por balde. `req`
// = o cliente é obrigado a preencher (BR precisa de referência, casa
// precisa do bairro, "outro" precisa dizer onde).
const DETALHE_DESEMBARQUE = {
  cantanhede: { label: "Onde em Cantanhede", ph: "Rua / ponto de referência", req: false },
  pirapemas: { label: "Onde em Pirapemas", ph: "Rua / ponto de referência", req: false },
  outro: { label: "Onde você vai ficar", ph: "Descreva o local", req: true },
  br: { label: "Ponto de referência na BR", ph: "Km, o que tem por perto", req: true },
  retorno: { label: "Ponto de referência (opcional)", ph: "", req: false },
  rodoviaria: { label: "Ponto de referência (opcional)", ph: "", req: false },
  casa: { label: "Bairro onde vai ficar", ph: "Ex.: Cohama", req: true },
};
const detalheDesembarqueObrigatorio = (area) => !!DETALHE_DESEMBARQUE[area]?.req;

// String legível para dropoff_location (usada na Lista/Agenda e telas de
// sucesso). O que estrutura a rota é dropoff_area/dropoff_detail.
function textoDesembarque(direcao, area, detalhe) {
  if (!area) return null;
  const rotulo = rotuloBalde(direcao, area);
  const d = (detalhe || "").trim();
  return d ? `${rotulo} — ${d}` : rotulo;
}

// Balde da reserva: usa a classificação manual (dropoff_area) se existir;
// senão chuta pelo texto livre que o cliente deu no agendamento.
function inferirBaldeDesembarque(r) {
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
function detalheDesembarque(r) {
  if (r.desembarqueDetalhe) return r.desembarqueDetalhe;
  const balde = inferirBaldeDesembarque(r);
  if (balde === "casa") return r.bairro || r.desembarque || "";
  if (balde === "br") return r.referencia || r.desembarque || r.rua || "";
  return r.desembarque || r.referencia || "";
}

/* ============================= error boundary ============================= */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }
  static getDerivedStateFromError(erro) {
    return { erro };
  }
  componentDidCatch(erro, info) {
    console.error("Erro capturado pelo painel:", erro, info);
  }
  render() {
    if (this.state.erro) {
      return (
        <div
          className="min-h-screen w-full flex items-center justify-center p-6"
          style={{ background: C.bg, color: C.ink, fontFamily: "'Inter', sans-serif" }}
        >
          <div className="max-w-sm text-center">
            <AlertTriangle size={28} style={{ color: C.red, margin: "0 auto" }} />
            <div
              className="mt-3 font-semibold"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Algo deu errado nesta tela
            </div>
            <p className="text-xs mt-2" style={{ color: C.inkSoft }}>
              Seus dados não foram perdidos — ficam salvos separadamente. Recarregue para continuar.
            </p>
            <button
              onClick={() => this.setState({ erro: null })}
              className="btn-press mt-4 text-sm px-4 py-2 rounded-lg"
              style={{ background: C.amber, color: C.onBrand }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ============================= animation shell ============================= */
function GlobalStyles() {
  return (
    <style>{`
      @keyframes fadeUp { from { opacity:0; transform:translateY(8px);} to {opacity:1; transform:translateY(0);} }
      @keyframes fadeIn { from { opacity:0;} to {opacity:1;} }
      @keyframes popIn { from { opacity:0; transform:scale(.96);} to {opacity:1; transform:scale(1);} }
      @keyframes slideDown { from { opacity:0; transform:translateY(-6px);} to {opacity:1; transform:translateY(0);} }
      @keyframes shimmer { 0% { background-position:-400px 0;} 100% { background-position:400px 0;} }
      @keyframes scaleIn { from { opacity:0; transform:scale(.94) translateZ(0);} to {opacity:1; transform:scale(1) translateZ(0);} }
      * { -webkit-tap-highlight-color: transparent; }
      html, body { -webkit-font-smoothing: antialiased; overscroll-behavior-y: contain; }
      button, a, select, input { touch-action: manipulation; }
      .anim-fadeUp { animation: fadeUp .32s cubic-bezier(.16,1,.3,1) both; will-change: transform, opacity; }
      .anim-fadeIn { animation: fadeIn .24s cubic-bezier(.16,1,.3,1) both; }
      .anim-pop { animation: scaleIn .28s cubic-bezier(.16,1,.3,1) both; will-change: transform, opacity; }
      .anim-slideDown { animation: slideDown .2s cubic-bezier(.16,1,.3,1) both; }
      .stagger > * { animation: fadeUp .3s cubic-bezier(.16,1,.3,1) both; will-change: transform, opacity; }
      .stagger > *:nth-child(1){animation-delay:.01s} .stagger > *:nth-child(2){animation-delay:.04s}
      .stagger > *:nth-child(3){animation-delay:.07s} .stagger > *:nth-child(n+4){animation-delay:.1s}
      .skel { position:relative; overflow:hidden; background:${C.panel2}; }
      .skel::after { content:""; position:absolute; inset:0; transform:translateX(-100%);
        background:linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent); animation: shimmer 1.4s infinite; }
      .btn-press { transition: transform .1s cubic-bezier(.16,1,.3,1), filter .1s ease, background-color .15s ease; }
      .btn-press:active { transform: scale(.96); filter:brightness(.94); }
      .row-hover { transition: background-color .15s ease, transform .15s cubic-bezier(.16,1,.3,1); }
      .tab-btn { transition: background-color .16s ease, color .16s ease, transform .12s cubic-bezier(.16,1,.3,1); }
      .bar-fill { transition: width .45s cubic-bezier(.16,1,.3,1); }
      .check-anim { transition: transform .16s cubic-bezier(.34,1.56,.64,1), background-color .16s ease, border-color .16s ease; }
      .check-anim:active { transform: scale(.86); }
      .pulse-dot { animation: pulseDot 1.6s ease-in-out infinite; }
      @keyframes pulseDot { 0%,100% { opacity:1; } 50% { opacity:.35; } }
      ::-webkit-scrollbar { width:8px; height:8px; }
      ::-webkit-scrollbar-thumb { background:${C.border}; border-radius:8px; }
      ::-webkit-scrollbar-thumb:hover { background:${C.brandDim}; }
      ::selection { background:${C.brand}; color:#fff; }
      body { background:${C.bg}; }
      @keyframes roadDash { to { background-position: -48px 0; } }
      .aritur-hero { position:relative; overflow:hidden;
        background:
          radial-gradient(120% 140% at 88% 20%, ${C.brandGlow} 0%, transparent 55%),
          linear-gradient(105deg, ${C.brandDim} 0%, #6c0910 42%, ${C.panel} 100%); }
      .aritur-road { height:3px; border-radius:3px;
        background-image: linear-gradient(90deg, ${C.brand} 0 60%, transparent 60% 100%);
        background-size: 24px 3px; background-repeat: repeat-x;
        animation: roadDash 1.6s linear infinite; }

      /* ---- hero cinematográfico do Dashboard ---- */
      @keyframes heroLanes { from { background-position: 0 0; } to { background-position: -640px 0; } }
      @keyframes heroBusBob { 0%,100% { transform: translateY(0) rotate(-.4deg); } 50% { transform: translateY(-5px) rotate(.3deg); } }
      @keyframes heroHeadlight { 0%,100% { opacity:.55; } 50% { opacity:1; } }
      @keyframes heroSky { 0%,100% { opacity:.9; } 50% { opacity:1; } }
      @keyframes heroTextIn { from { opacity:0; transform:translateY(14px); filter:blur(4px); } to { opacity:1; transform:translateY(0); filter:blur(0); } }
      @keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      @keyframes glowPulse { 0%,100% { box-shadow: 0 0 0 0 ${C.brandGlow}; } 50% { box-shadow: 0 0 24px 2px ${C.brandGlow}; } }
      @keyframes barGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      @keyframes sweep { to { transform: translateX(220%); } }
      .hero-lanes { background-image: repeating-linear-gradient(90deg, rgba(255,255,255,.85) 0 46px, transparent 46px 132px);
        animation: heroLanes 1.05s linear infinite; }
      .hero-bus { animation: heroBusBob 4.5s ease-in-out infinite; will-change: transform; }
      .hero-headlight { animation: heroHeadlight 2.6s ease-in-out infinite; }
      .hero-t { animation: heroTextIn .7s cubic-bezier(.16,1,.3,1) both; }
      .hero-t-1 { animation-delay: .05s; } .hero-t-2 { animation-delay: .16s; }
      .hero-t-3 { animation-delay: .27s; } .hero-t-4 { animation-delay: .38s; }
      .float-y { animation: floatY 5s ease-in-out infinite; }
      .glow-pulse { animation: glowPulse 3.2s ease-in-out infinite; }
      .card-lift { transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, border-color .2s ease; }
      .card-lift:hover { transform: translateY(-3px); border-color: ${C.brandDim}; box-shadow: 0 14px 34px -18px rgba(0,0,0,.7); }
      .bar-grow { transform-origin: bottom; animation: barGrow .7s cubic-bezier(.16,1,.3,1) both; }
      .sheen { position:relative; overflow:hidden; }
      .sheen::after { content:""; position:absolute; top:0; left:-60%; width:40%; height:100%;
        background:linear-gradient(100deg, transparent, rgba(255,255,255,.10), transparent);
        transform: translateX(0); animation: sweep 6s ease-in-out 1s infinite; }

      .safe-bottom { padding-bottom: max(0.5rem, env(safe-area-inset-bottom)); }
      @media (max-width: 640px) {
        button, select, input, textarea, a[role="button"] { min-height: 42px; }
        /* botões/ícones minúsculos dentro de linhas densas não precisam do mínimo */
        table button, .no-min-h, .no-min-h button { min-height: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; }
        .aritur-road, .hero-lanes, .hero-bus, .hero-headlight, .float-y, .glow-pulse, .sheen::after { animation: none !important; }
      }
    `}</style>
  );
}

/* ===================== IDENTIDADE ARITUR =============================
 * Recriação vetorial da logo AriTur Transportes: monograma "AT" (serifa
 * de alto contraste, "A" vermelho em itálico + "T" grafite) atravessado
 * pela fita da rodovia, wordmark "AriTur" em serifa itálica e
 * "TRANSPORTES" espaçado. Não é imagem — escala em qualquer tamanho.
 */
const SERIF = "'Fraunces', 'Times New Roman', Georgia, serif";
const MONO_T = "#DDDEE2";

function AriturMark({ size = 42, ribbon = true }) {
  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      aria-hidden="true"
    >
      {ribbon && (
        <svg viewBox="0 0 100 100" width={size} height={size} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
          <path
            d="M1 62 C 22 34, 44 12, 76 8 C 90 6, 99 13, 99 26 C 92 19, 82 19, 71 23 C 44 33, 24 55, 12 76 Z"
            fill="#2A2A30"
          />
          <path
            d="M6 60 C 26 34, 46 15, 76 12"
            stroke={C.brand}
            strokeWidth="2.6"
            strokeDasharray="5 6"
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />
        </svg>
      )}
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: SERIF,
          lineHeight: 1,
        }}
      >
        <span
          style={{
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: size * 0.9,
            color: C.brand,
            textShadow: "0 1px 2px rgba(0,0,0,.55)",
          }}
        >
          A
        </span>
        <span
          style={{
            fontWeight: 700,
            fontSize: size * 0.82,
            color: MONO_T,
            marginLeft: -size * 0.28,
          }}
        >
          T
        </span>
      </span>
    </div>
  );
}

function AriturLogo({ compact = false, tagline = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <AriturMark size={compact ? 30 : 44} ribbon={!compact} />
      <div className="leading-none">
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: compact ? "1.2rem" : "1.65rem",
            letterSpacing: "0.005em",
            lineHeight: 1,
          }}
        >
          <span style={{ color: C.brand }}>Ari</span>
          <span style={{ color: MONO_T }}>Tur</span>
        </div>
        {!compact && (
          <div
            className="mt-1.5"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "0.58rem",
              fontWeight: 600,
              letterSpacing: "0.44em",
              color: C.inkSoft,
              paddingLeft: 2,
            }}
          >
            TRANSPORTES
          </div>
        )}
        {tagline && (
          <div
            className="mt-1.5"
            style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: "0.66rem", color: C.inkFaint }}
          >
            Conectando destinos, cuidando de cada viagem
          </div>
        )}
      </div>
    </div>
  );
}

// Silhueta de ônibus para decoração (rodapé da barra lateral, login, hero).
function BusSilhueta({ className = "", style, color = C.brand, opacity = 0.12 }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 220 84"
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <g fill={color} opacity={opacity}>
        <path d="M6 20c0-6 4-10 10-10h150c22 0 40 12 48 30l4 9c1 3 2 6 2 9v9c0 4-3 7-7 7h-14a16 16 0 0 0-32 0H70a16 16 0 0 0-32 0H14c-4 0-8-3-8-8V20Z" />
      </g>
      <g fill={C.bg} opacity={Math.min(opacity + 0.05, 1)}>
        <rect x="18" y="20" width="26" height="18" rx="3" />
        <rect x="50" y="20" width="26" height="18" rx="3" />
        <rect x="82" y="20" width="26" height="18" rx="3" />
        <rect x="114" y="20" width="26" height="18" rx="3" />
        <rect x="148" y="20" width="22" height="18" rx="3" />
      </g>
      <g fill={color} opacity={Math.min(opacity + 0.25, 1)}>
        <circle cx="54" cy="72" r="11" />
        <circle cx="186" cy="72" r="11" />
      </g>
    </svg>
  );
}

/* Cena animada do hero — céu em degradê, morros, estrada com faixas
   correndo e um ônibus com faróis pulsando. Tudo CSS/SVG, sem imagem. */
function HeroBusScene() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* céu / atmosfera */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #1a0407 0%, #5c0a11 38%, #b3161f 70%, #f0533a 100%)",
          opacity: 0.9,
        }}
      />
      <div
        className="absolute float-y"
        style={{
          right: "5%",
          top: "-34%",
          width: 130,
          height: 130,
          borderRadius: "50%",
          background: "radial-gradient(circle, #ffe1b0 0%, #ff7a3c 42%, transparent 70%)",
          opacity: 0.8,
          filter: "blur(3px)",
        }}
      />
      {/* morros */}
      <svg aria-hidden="true"
        className="absolute bottom-0 left-0 w-full"
        viewBox="0 0 1200 220"
        preserveAspectRatio="none"
        style={{ height: "62%" }}
      >
        <path d="M0 150 Q 200 70 430 130 T 900 120 T 1200 150 V220 H0 Z" fill="#2a0508" opacity="0.85" />
        <path d="M0 180 Q 260 120 560 165 T 1200 175 V220 H0 Z" fill="#160305" />
      </svg>
      {/* estrada */}
      <div
        className="absolute left-0 w-full"
        style={{
          bottom: 0,
          height: "34%",
          background: "linear-gradient(180deg, #241a1b 0%, #0c0708 100%)",
          transform: "perspective(420px) rotateX(48deg)",
          transformOrigin: "bottom",
        }}
      >
        <div
          className="hero-lanes absolute left-1/2 -translate-x-1/2"
          style={{ bottom: "18%", width: "68%", height: 6 }}
        />
      </div>
      {/* ônibus */}
      <div
        className="hero-bus absolute"
        style={{ right: "3%", bottom: "16%", width: 340, maxWidth: "52%" }}
      >
        <svg viewBox="0 0 300 120" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="busBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2b2b30" />
              <stop offset="1" stopColor="#0d0d10" />
            </linearGradient>
          </defs>
          <ellipse cx="150" cy="112" rx="140" ry="10" fill="#000" opacity="0.5" />
          <path
            d="M8 30c0-8 5-14 14-14h214c30 0 52 14 60 40l4 14c2 6 3 12 3 18v10c0 5-4 9-9 9h-20a20 20 0 0 0-40 0H86a20 20 0 0 0-40 0H16c-5 0-8-4-8-9V30Z"
            fill="url(#busBody)"
            stroke="#3a0a0e"
            strokeWidth="1.5"
          />
          <g fill="#1b1112">
            <rect x="22" y="30" width="34" height="22" rx="4" />
            <rect x="62" y="30" width="34" height="22" rx="4" />
            <rect x="102" y="30" width="34" height="22" rx="4" />
            <rect x="142" y="30" width="34" height="22" rx="4" />
            <rect x="182" y="30" width="34" height="22" rx="4" />
          </g>
          <rect x="8" y="60" width="284" height="4" fill={C.brand} opacity="0.9" />
          <circle cx="66" cy="96" r="16" fill="#111" stroke="#333" strokeWidth="3" />
          <circle cx="234" cy="96" r="16" fill="#111" stroke="#333" strokeWidth="3" />
          {/* faróis */}
          <g className="hero-headlight">
            <circle cx="292" cy="72" r="6" fill="#fff3c4" />
            <path d="M292 66 L300 40 L300 104 Z" fill="#ffe9a8" opacity="0.28" />
          </g>
          <circle cx="12" cy="74" r="4" fill={C.brand} />
        </svg>
      </div>
      {/* vinheta — escurece a esquerda pro texto, deixa o ônibus aparecer */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(6,6,8,.82) 0%, rgba(6,6,8,.4) 38%, rgba(6,6,8,.05) 62%, transparent 100%)",
        }}
      />
    </div>
  );
}

/* ===================== BUSCA GLOBAL ============================= */
// Lupa fixa no topo (todas as telas) + atalho "/" e Ctrl/⌘+K no desktop.
// Resultados agrupados: passageiros, reservas, viagens e "ir para" (telas).

// Reconhece dd/mm, dd/mm/aaaa, dd-mm, aaaa-mm-dd → ISO aaaa-mm-dd.
function termoParaData(termo) {
  const t = (termo || "").trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3] || String(new Date().getFullYear());
    if (y.length === 2) y = `20${y}`;
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
    return `${y}-${mo}-${d}`;
  }
  return null;
}

// Telas / funcionalidades navegáveis pela busca (respeita o papel via NAV).
const DESTINOS_BUSCA = [
  { tab: "reservar", label: "Reservar passagem", termos: "nova reserva atendimento whatsapp bot" },
  { tab: "agenda", label: "Agenda de viagens", termos: "viagens dia pendentes confirmar" },
  { tab: "lista", label: "Lista do dia", termos: "embarque desembarque motorista rota passageiros do dia" },
  { tab: "passageiros", label: "Passageiros / CRM", termos: "clientes histórico contatos telefone" },
  { tab: "financeiro", label: "Financeiro", termos: "caixa receita despesa lucro lançamento" },
  { tab: "financeiro", sub: "contas_receber", label: "Contas a receber", termos: "cobrança pendente devendo whatsapp pagamento" },
  { tab: "gestao", sub: "resultado", label: "Gestão Operacional", termos: "resultado líquido dre margem empresarial" },
  { tab: "gestao", sub: "recorrentes", label: "Custos recorrentes", termos: "salário pró-labore imposto seguro ipva depreciação automação" },
  { tab: "operacao", label: "Operação — combustível", termos: "abastecimento km consumo veículo" },
  { tab: "operacao", label: "Manutenção preventiva", termos: "troca óleo revisão preventiva veículo" },
  { tab: "dashboard", label: "Dashboard", termos: "visão geral indicadores gráficos" },
  { tab: "sistema", label: "Sistema / Configurações", termos: "backup usuários pontos valores horários pix" },
  { tab: "sistema", label: "Backup completo", termos: "exportar json csv excel pdf cópia dados" },
];

function normalizaBusca(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Botão de ações rápidas — flutua no canto inferior direito (acima da
// barra de navegação no celular), disponível em todas as telas. Abre um
// menuzinho com Buscar / Agendar / Hoje.
function FabItem({ icon: Icon, label, onClick, accent = C.panel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-press flex items-center gap-2 rounded-full border pl-3 pr-4 py-2 text-sm font-medium"
      style={{ background: accent, borderColor: C.border, color: C.ink, boxShadow: "0 2px 10px rgba(0,0,0,.35)" }}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function QuickActionsFab({ onBuscar, onAgendar, onHoje, mostrarHoje, podeAgendar }) {
  const [aberto, setAberto] = useState(false);
  const fechar = () => setAberto(false);
  return (
    <>
      {aberto && (
        <button
          type="button"
          aria-label="Fechar ações rápidas"
          className="fixed inset-0 z-30"
          style={{ background: "rgba(0,0,0,.25)" }}
          onClick={fechar}
        />
      )}
      <div
        className="fixed z-30 flex flex-col items-end gap-2.5 right-3.5 md:right-6 bottom-[calc(4.9rem+env(safe-area-inset-bottom))] md:bottom-6"
      >
        {aberto && (
          <div className="flex flex-col items-end gap-2.5 anim-fadeUp">
            {mostrarHoje && (
              <FabItem
                icon={Calendar}
                label="Ir para hoje"
                onClick={() => {
                  onHoje();
                  fechar();
                }}
              />
            )}
            {podeAgendar && (
              <FabItem
                icon={Plus}
                label="Agendar passagem"
                onClick={() => {
                  onAgendar();
                  fechar();
                }}
              />
            )}
            <FabItem
              icon={Search}
              label="Buscar"
              onClick={() => {
                onBuscar();
                fechar();
              }}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-label="Ações rápidas"
          className="btn-press rounded-full flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            background: C.amber,
            color: C.onBrand,
            boxShadow: "0 4px 18px rgba(0,0,0,.45)",
          }}
        >
          {aberto ? <X size={24} /> : <Plus size={26} />}
        </button>
      </div>
    </>
  );
}

function GrupoResultados({ titulo, children }) {
  return (
    <div className="mb-3">
      <div
        className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: C.inkFaint }}
      >
        {titulo}
      </div>
      {children}
    </div>
  );
}

function ItemResultado({ icon: Icon, titulo, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="row-hover w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
      style={{ color: C.ink }}
    >
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: C.panel2, color: C.inkSoft }}
      >
        <Icon size={15} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm truncate">{titulo}</span>
        {sub && (
          <span className="block text-xs truncate" style={{ color: C.inkFaint }}>
            {sub}
          </span>
        )}
      </span>
    </button>
  );
}

function GlobalSearchOverlay({ onClose, onNavigate, navIds }) {
  const [termo, setTermo] = useState("");
  const { passageiros, reservas, loading, error } = useGlobalSearch(termo);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const t = termo.trim();
  const dataAlvo = termoParaData(t);
  const nt = normalizaBusca(t);
  const destinos =
    t.length >= 2
      ? DESTINOS_BUSCA.filter(
          (d) =>
            navIds.includes(d.tab) &&
            (normalizaBusca(d.label).includes(nt) || normalizaBusca(d.termos).includes(nt)),
        ).slice(0, 6)
      : [];

  const temResultado =
    passageiros.length > 0 || reservas.length > 0 || !!dataAlvo || destinos.length > 0;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onClose}
    >
      <div
        className="anim-pop w-full m-3 rounded-2xl border overflow-hidden"
        style={{
          maxWidth: 560,
          marginTop: "max(0.75rem, env(safe-area-inset-top))",
          background: C.panel,
          borderColor: C.border,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 px-4 border-b"
          style={{ borderColor: C.border, height: 52 }}
        >
          <Search size={17} style={{ color: C.inkFaint }} className="shrink-0" />
          <input
            ref={inputRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar passageiro, telefone, reserva, data, tela…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: C.ink }}
          />
          {loading && (
            <RefreshCw size={14} className="pulse-dot shrink-0" style={{ color: C.inkFaint }} />
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn-press shrink-0 text-xs px-2 py-1 rounded-md"
            style={{ color: C.inkFaint }}
          >
            Esc
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto py-2">
          {error && (
            <div className="px-4 py-3 text-xs" style={{ color: C.red }}>
              Não foi possível buscar agora. Tente de novo.
            </div>
          )}

          {t.length < 2 && (
            <div className="px-4 py-6 text-center text-xs" style={{ color: C.inkFaint }}>
              Digite ao menos 2 caracteres. Ex.: nome do passageiro, telefone, “05/09”, “financeiro”.
            </div>
          )}

          {t.length >= 2 && !loading && !temResultado && (
            <div className="px-4 py-6 text-center text-xs" style={{ color: C.inkFaint }}>
              Nada encontrado para “{t}”.
            </div>
          )}

          {dataAlvo && (
            <GrupoResultados titulo="Viagens">
              <ItemResultado
                icon={Calendar}
                titulo={`Agenda de ${fmtDate(dataAlvo)}`}
                sub="Ver viagens e reservas do dia"
                onClick={() => onNavigate({ tab: "agenda", deepLink: { kind: "data", data: dataAlvo } })}
              />
              <ItemResultado
                icon={ClipboardList}
                titulo={`Lista do dia — ${fmtDate(dataAlvo)}`}
                sub="Embarque e desembarque"
                onClick={() => onNavigate({ tab: "lista", deepLink: { kind: "data", data: dataAlvo } })}
              />
            </GrupoResultados>
          )}

          {passageiros.length > 0 && (
            <GrupoResultados titulo="Passageiros">
              {passageiros.map((c) => (
                <ItemResultado
                  key={c.id}
                  icon={Users}
                  titulo={c.name}
                  sub={[c.phone, c.default_neighborhood].filter(Boolean).join(" · ")}
                  onClick={() =>
                    onNavigate({
                      tab: "passageiros",
                      deepLink: { kind: "passageiro", termo: c.name || c.phone },
                    })
                  }
                />
              ))}
            </GrupoResultados>
          )}

          {reservas.length > 0 && (
            <GrupoResultados titulo="Reservas">
              {reservas.map((r) => {
                const meta = STATUS_META[r.status] || {};
                const quando = r.data ? fmtDate(r.data) : "sem data";
                const dir = r.direcao === "ida" ? "Ida" : r.direcao === "volta" ? "Volta" : r.tipo;
                return (
                  <ItemResultado
                    key={r.id}
                    icon={Bus}
                    titulo={`${r.nome || "—"} · ${quando} · ${dir}`}
                    sub={`${meta.emoji || ""} ${meta.label || r.status} · ${r.telefone || ""}`}
                    onClick={() =>
                      onNavigate({
                        tab: r.data ? "lista" : "agenda",
                        deepLink: { kind: "data", data: r.data, reservaId: r.id },
                      })
                    }
                  />
                );
              })}
            </GrupoResultados>
          )}

          {destinos.length > 0 && (
            <GrupoResultados titulo="Ir para">
              {destinos.map((d) => (
                <ItemResultado
                  key={d.label}
                  icon={ArrowRight}
                  titulo={d.label}
                  onClick={() =>
                    onNavigate({
                      tab: d.tab,
                      deepLink: d.sub ? { kind: "subview", sub: d.sub } : undefined,
                    })
                  }
                />
              ))}
            </GrupoResultados>
          )}
        </div>
      </div>
    </div>
  );
}

/* Skeletons por aba: ../ui/skeletons/TabSkeleton.jsx (sistema de motion, issue #2). */

/* ============================= shared UI ============================= */
function Header({ title, subtitle, right }) {
  return (
    <div className="px-6 md:px-10 pr-6 md:pr-16 pt-5 md:pt-8 pb-5 flex items-start justify-between flex-wrap gap-3 anim-fadeUp">
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
      </div>
      {right}
    </div>
  );
}
function Card({ children, style, className = "" }) {
  return (
    <div
      className={`card-lift rounded-xl border p-5 ${className}`}
      style={{ background: C.panel, borderColor: C.border, ...style }}
    >
      {children}
    </div>
  );
}
function Pill({ children, color = C.blue, bg = C.blueSoft }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1"
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}
function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.confirmada;
  return (
    <Pill color={m.cor} bg={m.bg}>
      {m.emoji} {m.label}
    </Pill>
  );
}
function StatCard({ label, value, icon: Icon, accent = C.blue, hint }) {
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
function MiniStat({ label, value, cor }) {
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
function Field({ label, children }) {
  return (
    <label className="block text-xs mb-1" style={{ color: C.inkSoft }}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
const inputStyle = { background: C.panel2, borderColor: C.border, color: C.ink };
const inputCls = "border rounded-lg px-3 py-2 text-sm w-full outline-none";
function TextInput(props) {
  return (
    <input
      {...props}
      style={{ ...inputStyle, ...(props.style || {}) }}
      className={`${inputCls} ${props.className || ""}`}
    />
  );
}
function Select(props) {
  return (
    <select
      {...props}
      style={{ ...inputStyle, ...(props.style || {}) }}
      className={`${inputCls} ${props.className || ""}`}
    />
  );
}
function useLazyTab(tab) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const t = setTimeout(() => setReady(true), 220);
    return () => clearTimeout(t);
  }, [tab]);
  return ready;
}

const PREFERS_REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Anima um número de 0 até `target` na montagem (e a cada mudança de
// target). Respeita prefers-reduced-motion.
function useCountUp(target, duration = 900) {
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
function useDeepLinkData(deepLink, setData) {
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
function useDeepLinkSubview(deepLink, setSubview) {
  const aplicadoEm = useRef(null);
  useEffect(() => {
    if (deepLink?.kind === "subview" && deepLink.sub && deepLink.at !== aplicadoEm.current) {
      aplicadoEm.current = deepLink.at;
      setSubview(deepLink.sub);
    }
  }, [deepLink, setSubview]);
}
function pontoDe(reserva, trips) {
  return trips[reserva.direcao]?.pontos.find((p) => p.id === reserva.pontoId);
}
function labelLocal(reserva, trips) {
  const p = pontoDe(reserva, trips);
  if (!p) return "—";
  if (p.id === "busca") return reserva.bairro || "bairro não informado";
  if (p.id === "outro" && reserva.localOutro) return reserva.localOutro;
  if (p.id === "br" && reserva.localExato) return `BR (${reserva.localExato})`;
  return p.nome;
}
/** formato pedido: para busca em casa "NP - BAIRRO - TELEFONE"; para os demais "NP Local (telefone)" */
function linhaReserva(r, trips) {
  if (r.pontoId === "busca")
    return `${r.quantidade}P - ${(r.bairro || "bairro não informado").toUpperCase()} - ${r.telefone}`;
  return `${r.quantidade}P ${labelLocal(r, trips)} (${r.telefone})`;
}
function vagasDisponiveis(reservas, data, direcao, capacidade) {
  const usados = reservas
    .filter((r) => r.data === data && r.direcao === direcao && OCUPA_VAGA.includes(r.status))
    .reduce((s, r) => s + (r.quantidade || 1), 0);
  return Math.max(0, capacidade - usados);
}

/* diagnóstico e auto-correção */
function runDiagnostics(reservas, capacidade, trips) {
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
const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
function previsaoDemanda(reservas) {
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
function gerarInsightsIA(reservas, operacao, capacidade, trips) {
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
// Reservas de -JANELA_DIAS a +JANELA_DIAS ficam carregadas no painel. É o
// suficiente para operação, agenda futura e histórico recente; Passageiros/
// Dashboard usam a mesma janela. (issue #10 — ver APP-INTEGRATION-PLAN.md)
const JANELA_DIAS = 120;

// Quais papéis enxergam cada aba. O RLS do banco já barra os DADOS (um
// motorista que abrisse Financeiro só via erro de permissão); isto é só
// navegação — esconde o que a pessoa não usa. `admin` vê tudo.
const TAB_ROLES = {
  reservar: ["admin", "atendente"],
  agenda: ["admin", "atendente", "motorista", "financeiro"],
  lista: ["admin", "atendente", "motorista", "financeiro"],
  passageiros: ["admin", "atendente", "financeiro"],
  financeiro: ["admin"],
  gestao: ["admin"],
  operacao: ["admin"],
  dashboard: ["admin"],
  sistema: ["admin"],
};

const NAV_ITENS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, grupo: "Principal" },
  { id: "reservar", label: "Reservar", icon: MessageCircle, grupo: "Operação" },
  { id: "agenda", label: "Agenda", icon: Calendar, grupo: "Operação" },
  { id: "lista", label: "Lista do Dia", icon: ClipboardList, grupo: "Operação" },
  { id: "passageiros", label: "Passageiros", icon: Users, grupo: "Clientes" },
  { id: "operacao", label: "Operação", icon: Bus, grupo: "Frota" },
  { id: "financeiro", label: "Financeiro", icon: Wallet, grupo: "Financeiro" },
  { id: "gestao", label: "Gestão", icon: Landmark, grupo: "Financeiro" },
  { id: "sistema", label: "Sistema", icon: ShieldCheck, grupo: "Administração" },
];
const NAV_GRUPOS = ["Principal", "Operação", "Clientes", "Frota", "Financeiro", "Administração"];

// Navegação inferior (celular). Muitas abas não cabem numa linha só —
// mostra as principais + "Mais" numa folha. A aba ativa sempre aparece
// na barra, mesmo que normalmente estivesse em "Mais".
function MobileNavItem({ n, active, grande, badge, onClick }) {
  const Icon = n.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        grande
          ? "btn-press flex flex-col items-center gap-1 py-3 rounded-xl"
          : "tab-btn flex-1 flex flex-col items-center gap-0.5 py-2 min-w-0"
      }
      style={
        grande
          ? { background: active ? C.amberSoft : C.panel2, color: active ? C.amber : C.inkSoft }
          : { color: active ? C.amber : C.inkFaint }
      }
    >
      <span className="relative flex items-center justify-center" style={{ minHeight: 20 }}>
        <Icon size={grande ? 18 : 20} />
        {badge > 0 && (
          <span
            className="absolute -top-1.5 -right-2.5 text-[8px] font-bold px-1 rounded-full"
            style={{ background: C.purple, color: "#fff" }}
          >
            {badge}
          </span>
        )}
      </span>
      <span className={grande ? "text-[10px]" : "text-[9px] leading-none truncate max-w-full"}>
        {n.label}
      </span>
    </button>
  );
}

function MobileNav({ nav, tab, onSelect, pendentesCount }) {
  const [maisAberto, setMaisAberto] = useState(false);
  const LIMITE = 5;
  let visiveis = nav;
  let extras = [];
  if (nav.length > LIMITE) {
    visiveis = nav.slice(0, LIMITE - 1);
    extras = nav.slice(LIMITE - 1);
    const ativoNosExtras = extras.find((n) => n.id === tab);
    if (ativoNosExtras) {
      const trocado = visiveis[visiveis.length - 1];
      visiveis = [...visiveis.slice(0, -1), ativoNosExtras];
      extras = [trocado, ...extras.filter((n) => n.id !== tab)];
    }
  }
  const escolher = (id) => {
    onSelect(id);
    setMaisAberto(false);
  };
  return (
    <>
      {maisAberto && (
        <div
          className="md:hidden fixed inset-0 z-30 anim-fadeIn"
          style={{ background: "rgba(0,0,0,.5)" }}
          onClick={() => setMaisAberto(false)}
        >
          <div
            className="absolute left-0 right-0 bottom-0 rounded-t-2xl border-t p-3 pb-6 safe-bottom anim-slideDown"
            style={{ background: C.panel, borderColor: C.border }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="w-9 h-1 rounded-full mx-auto mb-3"
              style={{ background: C.border }}
            />
            <div className="grid grid-cols-4 gap-2">
              {extras.map((n) => (
                <MobileNavItem
                  key={n.id}
                  n={n}
                  grande
                  active={tab === n.id}
                  badge={n.id === "agenda" ? pendentesCount : 0}
                  onClick={() => escolher(n.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      <div
        className="md:hidden safe-bottom fixed bottom-0 left-0 right-0 z-20 flex border-t"
        style={{ background: C.panel, borderColor: C.border }}
      >
        {visiveis.map((n) => (
          <MobileNavItem
            key={n.id}
            n={n}
            active={tab === n.id}
            badge={n.id === "agenda" ? pendentesCount : 0}
            onClick={() => escolher(n.id)}
          />
        ))}
        {extras.length > 0 && (
          <button
            type="button"
            onClick={() => setMaisAberto(true)}
            className="tab-btn flex-1 flex flex-col items-center gap-0.5 py-2"
            style={{ color: maisAberto ? C.amber : C.inkFaint }}
          >
            <span className="flex items-center justify-center" style={{ minHeight: 20 }}>
              <MoreHorizontal size={20} />
            </span>
            <span className="text-[9px] leading-none">Mais</span>
          </button>
        )}
      </div>
    </>
  );
}

function AppInner() {
  // As fontes (Space Grotesk / Fraunces / Inter / JetBrains Mono) são
  // carregadas no index.html — valem também para a tela de login.
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const [tab, setTab] = useState("dashboard");
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [agendarAberto, setAgendarAberto] = useState(false);
  const [agendou, setAgendou] = useState("");
  // deep-link da busca global: leva a aba destino a pré-selecionar data /
  // pré-preencher o filtro. `at` força o efeito a rodar de novo mesmo se
  // o alvo repetir.
  const [deepLink, setDeepLink] = useState(null);

  // Rede de segurança para a Agenda nunca aparecer vazia num dia ainda sem
  // reserva (o trabalho de fato é do pg_cron `ensure-upcoming-trips`).
  useEnsureTrips(30);

  // --- Reservas: fonte de verdade = Postgres (janela + realtime) --------
  const janela = useMemo(
    () => ({ from: dataOperacao(-JANELA_DIAS), to: dataOperacao(JANELA_DIAS) }),
    [],
  );
  const R = useReservationsWindow(janela.from, janela.to);
  const reservas = R.reservations;

  // --- tudo no Postgres agora ------------------------------------------
  const cfgSettings = useSettings();
  const { defaultVehicle } = useVehicles();
  const cfg = useRouteConfig();
  const modoAtendimento = cfgSettings.attendanceMode;
  const capacidadeAtiva = defaultVehicle?.capacity ?? 31;
  const trips = cfg.trips;

  const usuario = profile?.name || "—";

  const NAV = useMemo(
    () => NAV_ITENS.filter((n) => (TAB_ROLES[n.id] ?? []).includes(role)),
    [role],
  );
  const tabPermitida = NAV.some((n) => n.id === tab);

  // Papel não enxerga a aba atual (ex.: motorista cai no app com "reservar"
  // selecionado) → manda para a primeira aba que ele pode ver.
  useEffect(() => {
    if (role && NAV.length > 0 && !tabPermitida) setTab(NAV[0].id);
  }, [role, NAV, tabPermitida]);

  // Atalho de teclado (desktop): "/" ou Ctrl/⌘+K abre a busca global.
  useEffect(() => {
    const onKey = (e) => {
      const alvo = e.target;
      const digitando =
        alvo &&
        (alvo.tagName === "INPUT" ||
          alvo.tagName === "TEXTAREA" ||
          alvo.tagName === "SELECT" ||
          alvo.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setBuscaAberta(true);
      } else if (e.key === "/" && !digitando && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setBuscaAberta(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const irParaBusca = ({ tab: destino, deepLink: dl }) => {
    setTab(destino);
    setDeepLink(dl ? { ...dl, at: Date.now() } : null);
    setBuscaAberta(false);
  };
  // Troca de aba pela navegação normal: descarta qualquer deep-link pendente.
  const mudarAba = (id) => {
    setTab(id);
    setDeepLink(null);
  };
  const irParaHoje = () => setDeepLink({ kind: "data", data: todayStr(), at: Date.now() });
  useEffect(() => {
    if (!agendou) return undefined;
    const t = setTimeout(() => setAgendou(""), 5000);
    return () => clearTimeout(t);
  }, [agendou]);
  const podeAgendar = ["admin", "atendente"].includes(role);
  const tabComData = tab === "agenda" || tab === "lista";

  const ready = useLazyTab(tab);
  const loading =
    (R.loading && reservas.length === 0) || (cfg.loading && cfg.trips.ida.pontos.length === 0);
  const pendentesCount = reservas.filter(
    (r) => r.status === "pendente" || r.status === "espera",
  ).length;

  return (
    <div
      className="min-h-screen w-full flex"
      style={{ background: C.bg, fontFamily: "'Inter', sans-serif", color: C.ink }}
    >
      <GlobalStyles />
      <QuickActionsFab
        onBuscar={() => setBuscaAberta(true)}
        onAgendar={() => setAgendarAberto(true)}
        onHoje={irParaHoje}
        mostrarHoje={tabComData}
        podeAgendar={podeAgendar}
      />
      {buscaAberta && (
        <GlobalSearchOverlay
          onClose={() => setBuscaAberta(false)}
          onNavigate={irParaBusca}
          navIds={NAV.map((n) => n.id)}
        />
      )}
      {agendarAberto && (
        <NovaReservaModal
          dataInicial={deepLink?.kind === "data" ? deepLink.data : todayStr()}
          trips={trips}
          onCriar={R.createReservation}
          onClose={(r) => {
            setAgendarAberto(false);
            if (r?.ok) {
              setTab("lista");
              setDeepLink({ kind: "data", data: r.data, at: Date.now() });
              setAgendou(
                r.status === "pendente"
                  ? `${r.nome} agendado(a) como pendente.`
                  : r.status === "espera"
                    ? `${r.nome} entrou na lista de espera.`
                    : `${r.nome} agendado(a) e confirmado(a).`,
              );
            }
          }}
        />
      )}
      {agendou && (
        <div
          className="anim-slideDown fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 text-xs rounded-lg px-4 py-2.5 max-w-[92vw]"
          style={{
            top: "max(0.75rem, env(safe-area-inset-top))",
            background: C.green,
            color: "#0C1F16",
            boxShadow: "0 4px 16px rgba(0,0,0,.4)",
          }}
        >
          <CheckCircle2 size={15} />
          <span className="font-medium">{agendou}</span>
          <button type="button" onClick={() => setAgendou("")} className="ml-1">
            <X size={13} />
          </button>
        </div>
      )}
      <div
        className="hidden md:flex flex-col w-64 shrink-0 border-r relative overflow-hidden"
        style={{ borderColor: C.border, background: C.panel }}
      >
        <div
          className="px-5 pt-6 pb-5 border-b relative"
          style={{
            borderColor: C.border,
            background: `linear-gradient(160deg, ${C.amberSoft} 0%, transparent 65%)`,
          }}
        >
          <AriturLogo />
          <div className="aritur-road mt-3" style={{ width: 72 }} />
          <div className="text-[11px] mt-2 flex items-center gap-1.5" style={{ color: C.inkFaint }}>
            <Wifi
              size={11}
              className={R.loading ? "pulse-dot" : ""}
              style={{ color: R.error ? C.red : C.green }}
            />
            {R.error ? "Sem conexão…" : "Sincronizado"} ·{" "}
            {modoAtendimento === "ia" ? "IA atendendo" : "Atend. manual"}
          </div>
        </div>
        <nav className="flex-1 py-3 px-3 overflow-y-auto relative z-10">
          {NAV_GRUPOS.map((grupo) => {
            const itens = NAV.filter((n) => n.grupo === grupo);
            if (itens.length === 0) return null;
            return (
              <div key={grupo} className="mb-1.5">
                {grupo !== "Principal" && (
                  <div
                    className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.18em]"
                    style={{ color: C.inkFaint }}
                  >
                    {grupo.toUpperCase()}
                  </div>
                )}
                {itens.map((n) => {
                  const Icon = n.icon;
                  const active = tab === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => mudarAba(n.id)}
                      className="nav-item tab-btn btn-press w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm relative my-0.5"
                      style={{
                        background: active ? C.brand : "transparent",
                        color: active ? C.onBrand : C.inkSoft,
                        fontWeight: active ? 600 : 500,
                        boxShadow: active ? `0 8px 20px -8px ${C.brandGlow}` : "none",
                      }}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                          style={{ width: 3, height: 18, background: "#fff" }}
                        />
                      )}
                      <Icon size={16} />
                      {n.label}
                      {n.id === "agenda" && pendentesCount > 0 && (
                        <span
                          className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                          style={{
                            background: active ? "rgba(255,255,255,.22)" : C.purpleSoft,
                            color: active ? C.onBrand : C.purple,
                          }}
                        >
                          {pendentesCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t relative" style={{ borderColor: C.border }}>
          <div
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2"
            style={{ background: C.panel2 }}
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: C.brand, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {(usuario || "?").slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-xs font-semibold truncate" style={{ color: C.ink }}>
                {usuario}
              </span>
              <span className="block text-[10px] capitalize" style={{ color: C.inkFaint }}>
                {profile?.role || "—"}
              </span>
            </span>
          </div>
          <div
            className="mt-2.5 text-[10px] leading-snug"
            style={{ color: C.inkFaint, fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Mais que transporte,{" "}
            <span style={{ color: C.brand }}>conectamos pessoas.</span>
          </div>
        </div>
        <BusSilhueta
          className="absolute pointer-events-none"
          style={{ width: 240, bottom: -12, left: -30, opacity: 0.9 }}
          opacity={0.055}
        />
      </div>

      <MobileNav nav={NAV} tab={tab} onSelect={mudarAba} pendentesCount={pendentesCount} />

      <div className="flex-1 min-w-0 pb-20 md:pb-0 overflow-x-hidden">
        <div
          className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 border-b"
          style={{
            background: C.panel,
            borderColor: C.border,
            paddingTop: "max(0.6rem, env(safe-area-inset-top))",
          }}
        >
          <AriturLogo compact />
          <div className="aritur-road" style={{ width: 42 }} />
        </div>
        {R.error && !loading && (
          <div
            className="anim-slideDown mx-4 md:mx-10 mt-4 rounded-lg border px-3 py-2.5 flex items-center justify-between gap-3"
            style={{ borderColor: C.red, background: C.redSoft }}
          >
            <div className="flex items-center gap-2 text-xs" style={{ color: C.red }}>
              <AlertTriangle size={14} className="shrink-0" />
              <span>Não foi possível carregar as reservas do servidor.</span>
            </div>
            <button
              onClick={R.refetch}
              className="btn-press text-xs px-2 py-1 rounded-md"
              style={{ background: C.red, color: C.onBrand }}
            >
              Tentar de novo
            </button>
          </div>
        )}
        {loading || !ready || !tabPermitida ? (
          <TabSkeleton tab={tab} />
        ) : (
          <div className="anim-fadeIn">
            {tab === "reservar" && (
              <ReservarTab
                reservas={reservas}
                R={R}
                capacidade={capacidadeAtiva}
                modoAtendimento={modoAtendimento}
                trips={trips}
                segundaAtiva={cfg.segundaAtiva}
                segundaHoras={cfg.segundaHoras}
                pix={cfgSettings.pix}
              />
            )}
            {tab === "agenda" && (
              <AgendaTab
                reservas={reservas}
                R={R}
                capacidade={capacidadeAtiva}
                trips={trips}
                segundaAtiva={cfg.segundaAtiva}
                segundaHoras={cfg.segundaHoras}
                deepLink={deepLink}
                onAgendar={podeAgendar ? () => setAgendarAberto(true) : null}
              />
            )}
            {tab === "lista" && (
              <ListaTab
                reservas={reservas}
                R={R}
                trips={trips}
                deepLink={deepLink}
                onAgendar={podeAgendar ? () => setAgendarAberto(true) : null}
              />
            )}
            {tab === "passageiros" && (
              <PassageirosTab
                reservas={reservas}
                trips={trips}
                deepLink={deepLink}
              />
            )}
            {tab === "financeiro" && (
              <FinanceiroTab pix={cfgSettings.pix} deepLink={deepLink} />
            )}
            {tab === "gestao" && <GestaoTab deepLink={deepLink} />}
            {tab === "operacao" && <OperacaoTab />}
            {tab === "dashboard" && (
              <DashboardTab
                reservas={reservas}
                capacidade={capacidadeAtiva}
                trips={trips}
                segundaAtiva={cfg.segundaAtiva}
                segundaHoras={cfg.segundaHoras}
              />
            )}
            {tab === "sistema" && (
              <SistemaTab
                reservas={reservas}
                capacidade={capacidadeAtiva}
                cfg={cfg}
                modoAtendimento={modoAtendimento}
                onSetModo={cfgSettings.setAttendanceMode}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

/* ============================= 1. RESERVAR ============================= */
function ReservarTab({
  reservas,
  R,
  capacidade,
  modoAtendimento,
  trips,
  segundaAtiva,
  segundaHoras,
  pix,
}) {
  // Chave Pix: vem de settings.pix (aba Sistema); cai no valor fixo se a
  // config ainda não foi preenchida.
  const pixKey = pix?.key || PIX_KEY;
  const pixName = pix?.name || PIX_NAME;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    data: todayStr(),
    direcao: "",
    pontoId: "",
    quantidade: 1,
    bairro: "",
    localExato: "",
    localOutro: "",
    rua: "",
    referencia: "",
    desembarqueArea: "",
    desembarqueDetalhe: "",
    nome: "",
    telefone: "",
    pagamento: "dinheiro",
    encItem: "",
    encTipo: "",
    encEmbarque: "",
    encDesembarque: "",
    encRecebedorNome: "",
    encRecebedorTelefone: "",
  });
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");
  const [enviando, setEnviando] = useState(false);

  const segunda = isMonday(form.data) && segundaAtiva;
  const viagem =
    form.direcao && !["frete", "espera"].includes(form.direcao) ? trips[form.direcao] : null;
  const ponto = viagem?.pontos.find((p) => p.id === form.pontoId);
  const precoDoBairro = ponto?.campo === "bairro" ? precoBairro(form.bairro) : undefined;
  const bairroNaoReconhecido = ponto?.campo === "bairro" && form.bairro && precoDoBairro === null;
  const valorUnit = ponto?.campo === "bairro" ? precoDoBairro || 80 : ponto?.valor || 60;
  const total = valorUnit * (Number.parseInt(form.quantidade) || 1);
  const vagasIda = vagasDisponiveis(reservas, form.data, "ida", capacidade);
  const vagasVolta = vagasDisponiveis(reservas, form.data, "volta", capacidade);
  const vagasDaViagem = form.direcao === "ida" ? vagasIda : vagasVolta;
  const excedeVagas = ponto && Number.parseInt(form.quantidade || 1) > vagasDaViagem;
  const camposTexto = {
    localExato: form.localExato,
    localOutro: form.localOutro,
    rua: form.rua,
    desembarque: form.desembarqueDetalhe,
  };
  const pendente =
    ponto?.id === "outro" || Object.values(camposTexto).some(contemCidadeIntermediaria);
  const camposFaltando = () => {
    if (!form.nome || !form.telefone || !form.desembarqueArea || !form.quantidade || excedeVagas)
      return true;
    if (detalheDesembarqueObrigatorio(form.desembarqueArea) && !form.desembarqueDetalhe.trim())
      return true;
    if (ponto?.campo === "bairro" && !form.bairro) return true;
    if (ponto?.campo && ponto.campo !== "bairro" && !form[ponto.campo]) return true;
    if (form.direcao === "volta" && form.desembarqueArea === "casa" && !form.rua) return true;
    return false;
  };
  // resumo local só para as telas de sucesso — a fonte de verdade é o
  // que o banco gravou (o realtime traz a reserva para a Agenda sozinho).
  const resumoLocal = (status) => ({
    data: form.data,
    direcao: form.direcao === "espera" ? form._direcaoOriginal : form.direcao,
    pontoId: form.pontoId || null,
    bairro: form.bairro,
    localExato: form.localExato,
    localOutro: form.localOutro,
    quantidade: Number.parseInt(form.quantidade, 10) || 1,
    valorTotal: total,
    pagamento: form.pagamento,
    nome: form.nome,
    telefone: form.telefone,
    status,
  });
  const confirmar = async () => {
    setErroEnvio("");
    setEnviando(true);
    try {
      const res = await R.createReservation({
        tripDate: form.data,
        direction: form.direcao,
        customerName: form.nome,
        customerPhone: form.telefone,
        routePointCode: form.pontoId || null,
        quantity: Number.parseInt(form.quantidade, 10) || 1,
        unitPrice: valorUnit,
        paymentMethod: form.pagamento,
        pickupNeighborhood: form.bairro || null,
        pickupDetail: form.localExato || form.localOutro || null,
        street: form.rua || null,
        referencePoint: form.referencia || null,
        dropoffLocation: textoDesembarque(form.direcao, form.desembarqueArea, form.desembarqueDetalhe),
        dropoffArea: form.desembarqueArea || null,
        dropoffDetail: form.desembarqueDetalhe.trim() || null,
        pendingReason: pendente
          ? "Embarque/desembarque fora de São Luís, Cantanhede ou Pirapemas — aguardando confirmação."
          : null,
        status: pendente ? "pendente" : "confirmada",
      });
      setDone(resumoLocal(res?.status || (pendente ? "pendente" : "confirmada")));
      setStep(9);
    } catch (e) {
      if (e?.code === "CAPACITY_OR_BUSINESS_RULE") {
        setForm({ ...form, _direcaoOriginal: form.direcao });
        setStep("espera-form");
      } else setErroEnvio(e?.message || "Não foi possível enviar a reserva. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  };
  const confirmarEspera = async () => {
    setErroEnvio("");
    setEnviando(true);
    try {
      const res = await R.createReservation({
        tripDate: form.data,
        direction: form.direcao === "espera" ? form._direcaoOriginal : form.direcao,
        customerName: form.nome,
        customerPhone: form.telefone,
        routePointCode: form.pontoId || null,
        quantity: Number.parseInt(form.quantidade, 10) || 1,
        unitPrice: valorUnit,
        paymentMethod: form.pagamento,
        status: "espera",
      });
      setDone(resumoLocal(res?.status || "espera"));
      setStep(10);
    } catch (e) {
      setErroEnvio(e?.message || "Não foi possível entrar na lista de espera.");
    } finally {
      setEnviando(false);
    }
  };
  const reiniciar = () => {
    setForm({
      data: todayStr(),
      direcao: "",
      pontoId: "",
      quantidade: 1,
      bairro: "",
      localExato: "",
      localOutro: "",
      rua: "",
      referencia: "",
      desembarqueArea: "",
      desembarqueDetalhe: "",
      nome: "",
      telefone: "",
      pagamento: "dinheiro",
    });
    setStep(0);
    setDone(null);
    setCopied(false);
    setErroEnvio("");
  };
  const copiarPix = () => {
    navigator.clipboard?.writeText(pixKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const irParaAtendente = () => setStep(8);
  const irParaFrete = async () => {
    setErroEnvio("");
    setEnviando(true);
    try {
      await R.createReservation({
        tripDate: form.data,
        direction: "ida",
        type: "frete",
        customerName: form.nome || "(a coletar no atendimento)",
        customerPhone: form.telefone || "",
        pendingReason: "Pedido de frete — encaminhar para atendimento humano.",
        status: "pendente",
        extraData: { data: form.data },
      });
      setStep(7);
    } catch (e) {
      setErroEnvio(e?.message || "Não foi possível registrar o frete.");
    } finally {
      setEnviando(false);
    }
  };
  const irParaEncomenda = async () => {
    setErroEnvio("");
    setEnviando(true);
    try {
      await R.createReservation({
        tripDate: form.data,
        direction: "ida",
        type: "encomenda",
        customerName: form.encRecebedorNome,
        customerPhone: form.encRecebedorTelefone,
        pendingReason:
          "Encomenda — encaminhar para atendimento humano (sem valor definido no fluxo automático).",
        status: "pendente",
        extraData: {
          data: form.data,
          encItem: form.encItem,
          encTipo: form.encTipo,
          encEmbarque: form.encEmbarque,
          encDesembarque: form.encDesembarque,
        },
      });
      setStep(11);
    } catch (e) {
      setErroEnvio(e?.message || "Não foi possível registrar a encomenda.");
    } finally {
      setEnviando(false);
    }
  };
  const stepsTotal = 6;
  const progressPct = Math.min(
    100,
    (Math.min(typeof step === "number" ? step : 6, 6) / stepsTotal) * 100,
  );

  return (
    <div>
      <Header
        title="Atendimento automático — WhatsApp"
        subtitle="Roteiro conduzido pela IA; horários, pontos e valores vêm da configuração em Sistema."
      />
      <div className="px-6 md:px-10 pb-10 grid lg:grid-cols-[1fr_320px] gap-6">
        <Card style={{ maxWidth: 600 }}>
          {modoAtendimento === "manual" && step < 7 && (
            <div
              className="text-xs rounded-lg px-3 py-2 mb-4 flex items-center gap-2"
              style={{ background: C.warnSoft, color: C.warn }}
            >
              <UserCog size={13} /> Atendimento manual ativo — a equipe está respondendo
              diretamente.
            </div>
          )}
          {erroEnvio && (
            <div
              className="text-xs rounded-lg px-3 py-2 mb-4 flex items-center gap-2"
              style={{ background: C.redSoft, color: C.red }}
            >
              <AlertTriangle size={13} /> {erroEnvio}
            </div>
          )}
          {typeof step === "number" && step < 6 && (
            <div className="w-full h-1 rounded-full mb-5" style={{ background: C.panel2 }}>
              <div
                className="h-1 rounded-full bar-fill"
                style={{ width: `${progressPct}%`, background: C.amber }}
              />
            </div>
          )}
          {typeof step === "number" && step < 7 && (
            <button
              onClick={irParaAtendente}
              className="text-xs mb-3 flex items-center gap-1.5"
              style={{ color: C.inkFaint }}
            >
              <Headset size={13} /> Sair e falar com um atendente
            </button>
          )}

          {step === 0 && (
            <StepBlock icon={Calendar} title="Para quando é a viagem?">
              <TextInput
                type="date"
                value={form.data}
                min={todayStr()}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
              {isMonday(form.data) && segundaAtiva && (
                <div className="mt-2 text-xs flex items-center gap-1.5" style={{ color: C.amber }}>
                  <Sunrise size={13} /> Segunda-feira: ida sai {segundaHoras}h mais cedo.
                </div>
              )}
              <NextBtn onClick={() => setStep(1)} disabled={!form.data} />
            </StepBlock>
          )}

          {step === 1 && (
            <StepBlock icon={Clock} title="O que você precisa?">
              <div className="space-y-2">
                {[
                  { dir: "ida", icon: ArrowRight, vagas: vagasIda },
                  { dir: "volta", icon: ArrowLeft, vagas: vagasVolta },
                ].map(({ dir, icon: Icon, vagas }) => {
                  const v = trips[dir];
                  const horaAjustada =
                    dir === "ida" ? shiftHour(v.pontos[0].horaBase, segunda, segundaHoras) : null;
                  const lotado = vagas <= 0;
                  return (
                    <button
                      key={dir}
                      onClick={() => {
                        if (lotado) {
                          setForm({
                            ...form,
                            direcao: "espera",
                            _direcaoOriginal: dir,
                            pontoId: "",
                          });
                          setStep("espera-form");
                        } else {
                          setForm({ ...form, direcao: dir, pontoId: "" });
                          setStep(2);
                        }
                      }}
                      className="row-hover btn-press w-full flex items-center justify-between border rounded-lg px-4 py-3 text-left"
                      style={{ borderColor: lotado ? C.purple : C.border, background: C.panel2 }}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={16} style={{ color: C.amber }} />
                        <div>
                          <div className="text-sm font-medium">
                            {v.nome} · {v.label}
                          </div>
                          <div className="text-xs" style={{ color: lotado ? C.purple : C.inkSoft }}>
                            {dir === "ida"
                              ? `A partir de ${horaAjustada}`
                              : v.pontos.map((p) => p.horaBase).join(" e ")}{" "}
                            · {lotado ? "Lotado — entrar na lista de espera" : `${vagas} vaga(s)`}
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={16} style={{ color: C.inkFaint }} />
                    </button>
                  );
                })}
                <button
                  onClick={() => setForm({ ...form, direcao: "frete" }) || setStep(6.5)}
                  className="row-hover btn-press w-full flex items-center justify-between border rounded-lg px-4 py-3 text-left"
                  style={{ borderColor: C.border, background: C.panel2 }}
                >
                  <div className="flex items-center gap-3">
                    <Truck size={16} style={{ color: C.purple }} />
                    <div>
                      <div className="text-sm font-medium">Frete para outra cidade</div>
                      <div className="text-xs" style={{ color: C.inkSoft }}>
                        Encaminha direto para nossa equipe
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: C.inkFaint }} />
                </button>
                <button
                  onClick={() =>
                    setForm({ ...form, direcao: "encomenda" }) || setStep("encomenda-form")
                  }
                  className="row-hover btn-press w-full flex items-center justify-between border rounded-lg px-4 py-3 text-left"
                  style={{ borderColor: C.border, background: C.panel2 }}
                >
                  <div className="flex items-center gap-3">
                    <Package size={16} style={{ color: C.purple }} />
                    <div>
                      <div className="text-sm font-medium">Enviar uma encomenda</div>
                      <div className="text-xs" style={{ color: C.inkSoft }}>
                        Coletamos os dados e encaminhamos para a equipe (sem valor no automático)
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: C.inkFaint }} />
                </button>
              </div>
            </StepBlock>
          )}

          {step === "encomenda-form" && (
            <StepBlock icon={Package} title="Dados da encomenda">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Field label="O que é a encomenda?">
                  <TextInput
                    placeholder="Ex.: documentos, caixa de remédios…"
                    value={form.encItem}
                    onChange={(e) => setForm({ ...form, encItem: e.target.value })}
                  />
                </Field>
                <Field label="Tipo do item">
                  <TextInput
                    placeholder="Ex.: envelope, caixa, sacola"
                    value={form.encTipo}
                    onChange={(e) => setForm({ ...form, encTipo: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Field label="Local de embarque">
                  <TextInput
                    value={form.encEmbarque}
                    onChange={(e) => setForm({ ...form, encEmbarque: e.target.value })}
                  />
                </Field>
                <Field label="Local de desembarque">
                  <TextInput
                    value={form.encDesembarque}
                    onChange={(e) => setForm({ ...form, encDesembarque: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Field label="Nome de quem vai receber">
                  <TextInput
                    value={form.encRecebedorNome}
                    onChange={(e) => setForm({ ...form, encRecebedorNome: e.target.value })}
                  />
                </Field>
                <Field label="Telefone de contato de quem recebe">
                  <TextInput
                    value={form.encRecebedorTelefone}
                    onChange={(e) => setForm({ ...form, encRecebedorTelefone: e.target.value })}
                  />
                </Field>
              </div>
              <div className="text-xs mb-2 flex items-center gap-1.5" style={{ color: C.purple }}>
                <AlertTriangle size={13} /> O valor da encomenda é combinado direto com a equipe —
                não é informado aqui.
              </div>
              <NextBtn
                onClick={irParaEncomenda}
                disabled={
                  enviando ||
                  !form.encItem ||
                  !form.encEmbarque ||
                  !form.encDesembarque ||
                  !form.encRecebedorNome ||
                  !form.encRecebedorTelefone
                }
                label={enviando ? "Enviando…" : "Encaminhar para a equipe"}
              />
            </StepBlock>
          )}

          {step === "espera-form" && (
            <StepBlock icon={Hourglass} title="Lista de espera">
              <p className="text-xs mb-3" style={{ color: C.purple }}>
                Essa viagem está lotada. Deixe seus dados que avisamos assim que abrir vaga — mover
                para a agenda é feito manualmente pela nossa equipe.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Field label="Quantidade desejada">
                  <TextInput
                    type="number"
                    min={1}
                    value={form.quantidade}
                    onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                  />
                </Field>
                <Field label="Ponto de embarque preferido">
                  <Select
                    value={form.pontoId}
                    onChange={(e) => setForm({ ...form, pontoId: e.target.value })}
                  >
                    <option value="">Qualquer um</option>
                    {trips[form._direcaoOriginal].pontos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nome">
                  <TextInput
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </Field>
                <Field label="WhatsApp">
                  <TextInput
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  />
                </Field>
              </div>
              <NextBtn
                onClick={confirmarEspera}
                disabled={enviando || !form.nome || !form.telefone}
                label={enviando ? "Enviando…" : "Entrar na lista de espera"}
              />
            </StepBlock>
          )}

          {step === 6.5 && (
            <StepBlock icon={Truck} title="Frete — seus dados para contato">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nome">
                  <TextInput
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </Field>
                <Field label="WhatsApp">
                  <TextInput
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  />
                </Field>
              </div>
              <NextBtn
                onClick={irParaFrete}
                disabled={enviando}
                label={enviando ? "Enviando…" : "Encaminhar para a equipe"}
              />
            </StepBlock>
          )}

          {step === 2 && viagem && (
            <StepBlock icon={MapPin} title="Local de embarque">
              <div className="space-y-2">
                {viagem.pontos.map((p) => {
                  const hora = shiftHour(
                    p.horaBase,
                    viagem.direcao === "ida" && segunda,
                    segundaHoras,
                  );
                  return (
                    <button
                      key={p.id}
                      onClick={() => setForm({ ...form, pontoId: p.id }) || setStep(3)}
                      className="row-hover btn-press w-full flex items-center justify-between border rounded-lg px-4 py-3 text-left"
                      style={{ borderColor: C.border, background: C.panel2 }}
                    >
                      <div className="flex items-center gap-3">
                        {p.campo === "bairro" ? (
                          <HomeIcon size={15} style={{ color: C.amber }} />
                        ) : (
                          <MapPin size={15} style={{ color: C.blue }} />
                        )}
                        <div>
                          <div className="text-sm font-medium">{p.nome}</div>
                          <div className="text-xs" style={{ color: C.inkSoft }}>
                            {hora}
                            {p.campo === "bairro"
                              ? " · valor depende do bairro"
                              : ` · ${fmtBRL(p.valor)} por passagem`}
                            {p.janela ? ` · janela: ${p.janela}` : ""}
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={16} style={{ color: C.inkFaint }} />
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setStep(1)}
                className="text-xs mt-3"
                style={{ color: C.inkSoft }}
              >
                ← voltar
              </button>
            </StepBlock>
          )}

          {step === 3 && ponto && (
            <StepBlock icon={Users} title="Dados da reserva">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Field label="Quantidade de passagens">
                  <TextInput
                    type="number"
                    min={1}
                    max={vagasDaViagem}
                    value={form.quantidade}
                    onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                  />
                </Field>
                <Field label="Vagas restantes">
                  <div className="text-sm py-2" style={{ color: C.inkSoft }}>
                    {vagasDaViagem}
                  </div>
                </Field>
              </div>
              {excedeVagas && (
                <div className="text-xs mb-2" style={{ color: C.red }}>
                  Só restam {vagasDaViagem} vaga(s) — pode reduzir a quantidade ou entrar na lista
                  de espera pelo atendente.
                </div>
              )}
              {ponto.campo === "bairro" && (
                <div className="mb-2">
                  <Field label="Bairro">
                    <TextInput
                      placeholder="Ex.: Cohama"
                      value={form.bairro}
                      onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                    />
                  </Field>
                  {form.bairro && precoDoBairro > 0 && (
                    <div
                      className="text-xs mt-1 flex items-center gap-1.5"
                      style={{ color: C.green }}
                    >
                      <Check size={12} /> Valor para {form.bairro}: {fmtBRL(precoDoBairro)} por
                      passagem.
                    </div>
                  )}
                  {bairroNaoReconhecido && (
                    <div
                      className="text-xs mt-1 flex items-center gap-1.5"
                      style={{ color: C.purple }}
                    >
                      <AlertTriangle size={12} /> Não localizamos esse bairro — valor a partir de{" "}
                      {fmtBRL(80)}, um atendente vai confirmar certinho com você.
                    </div>
                  )}
                </div>
              )}
              {ponto.campo && ponto.campo !== "bairro" && (
                <Field label={ponto.campoLabel}>
                  <TextInput
                    value={form[ponto.campo]}
                    onChange={(e) => setForm({ ...form, [ponto.campo]: e.target.value })}
                  />
                </Field>
              )}
              <div className="mt-2">
                <Field label="Onde você vai ficar (desembarque)">
                  <Select
                    value={form.desembarqueArea}
                    onChange={(e) =>
                      setForm({ ...form, desembarqueArea: e.target.value, desembarqueDetalhe: "" })
                    }
                  >
                    <option value="" disabled>
                      Escolha o local…
                    </option>
                    {baldesDesembarque(form.direcao).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {form.desembarqueArea && (
                <div className="mt-2">
                  <Field
                    label={`${DETALHE_DESEMBARQUE[form.desembarqueArea].label}${
                      detalheDesembarqueObrigatorio(form.desembarqueArea) ? " *" : ""
                    }`}
                  >
                    <TextInput
                      value={form.desembarqueDetalhe}
                      placeholder={DETALHE_DESEMBARQUE[form.desembarqueArea].ph}
                      onChange={(e) => setForm({ ...form, desembarqueDetalhe: e.target.value })}
                    />
                  </Field>
                  {detalheDesembarqueObrigatorio(form.desembarqueArea) &&
                    !form.desembarqueDetalhe.trim() && (
                      <div className="text-xs mt-1" style={{ color: C.purple }}>
                        {form.desembarqueArea === "br"
                          ? "Diga um ponto de referência na BR (km, o que tem por perto)."
                          : form.desembarqueArea === "casa"
                            ? "Informe o bairro onde você vai ficar."
                            : "Descreva onde você vai ficar."}
                      </div>
                    )}
                </div>
              )}
              {form.direcao === "volta" && form.desembarqueArea === "casa" && (
                <div className="mt-2">
                  <Field label="Nome da rua *">
                    <TextInput
                      value={form.rua}
                      onChange={(e) => setForm({ ...form, rua: e.target.value })}
                    />
                  </Field>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Field label="Nome completo">
                  <TextInput
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </Field>
                <Field label="WhatsApp">
                  <TextInput
                    placeholder="DDD + número"
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  />
                </Field>
              </div>
              <div
                className="mt-3 flex items-center justify-between rounded-lg px-3 py-2"
                style={{ background: C.amberSoft }}
              >
                <span className="text-xs" style={{ color: C.inkSoft }}>
                  Total ({form.quantidade || 1}x {fmtBRL(valorUnit)})
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                    color: C.amber,
                  }}
                >
                  {fmtBRL(total)}
                </span>
              </div>
              {pendente && (
                <div className="text-xs mt-2 flex items-center gap-1.5" style={{ color: C.purple }}>
                  <AlertTriangle size={13} /> Esse trajeto sai da nossa área padrão — ficará
                  pendente até nossa confirmação.
                </div>
              )}
              {bairroNaoReconhecido ? (
                <NextBtn onClick={irParaAtendente} label="Falar com atendente" />
              ) : (
                <NextBtn onClick={() => setStep(4)} disabled={camposFaltando()} />
              )}
            </StepBlock>
          )}

          {step === 4 && (
            <StepBlock icon={CreditCard} title="Forma de pagamento">
              <div className="grid grid-cols-2 gap-2 mb-3">
                {["dinheiro", "pix"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setForm({ ...form, pagamento: p })}
                    className="btn-press border rounded-lg px-4 py-3 text-sm capitalize"
                    style={{
                      borderColor: form.pagamento === p ? C.amber : C.border,
                      background: form.pagamento === p ? C.amberSoft : C.panel2,
                      color: form.pagamento === p ? C.amber : C.ink,
                    }}
                  >
                    {p === "pix" ? "Pix" : "Dinheiro"}
                  </button>
                ))}
              </div>
              {form.pagamento === "pix" && (
                <div
                  className="anim-slideDown rounded-lg border px-3 py-3 mb-3"
                  style={{ borderColor: C.border, background: C.panel2 }}
                >
                  <div className="text-xs mb-1" style={{ color: C.inkSoft }}>
                    Chave Pix · {pixName}
                  </div>
                  <div className="flex items-center justify-between">
                    <span
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.95rem" }}
                    >
                      {pixKey}
                    </span>
                    <button
                      onClick={copiarPix}
                      className="btn-press flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                      style={{
                        background: copied ? C.greenSoft : C.border,
                        color: copied ? C.green : C.inkSoft,
                      }}
                    >
                      {copied ? (
                        <>
                          <Check size={12} /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> Copiar
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
                    Não é preciso pagar antes. Se pagar por Pix, envie o comprovante aqui no
                    WhatsApp.
                  </div>
                </div>
              )}
              <NextBtn
                onClick={confirmar}
                disabled={enviando}
                label={enviando ? "Enviando…" : "Confirmar reserva"}
              />
            </StepBlock>
          )}

          {step === 7 && (
            <div className="text-center py-6 anim-pop">
              <Truck size={32} style={{ color: C.purple, margin: "0 auto" }} />
              <div
                className="mt-3 font-semibold"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Pedido de frete recebido!
              </div>
              <p className="text-sm mt-2" style={{ color: C.inkSoft }}>
                Nossa equipe vai te chamar por aqui mesmo.
              </p>
              <button
                onClick={reiniciar}
                className="btn-press mt-4 text-sm px-4 py-2 rounded-lg"
                style={{ background: C.amber, color: C.onBrand }}
              >
                Voltar ao início
              </button>
            </div>
          )}
          {step === 8 && (
            <div className="text-center py-6 anim-pop">
              <Headset size={32} style={{ color: C.blue, margin: "0 auto" }} />
              <div
                className="mt-3 font-semibold"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Encaminhando para um atendente
              </div>
              <p className="text-sm mt-2" style={{ color: C.inkSoft }}>
                Alguém da nossa equipe assume a conversa a partir daqui — inclusive para confirmar o
                valor do seu bairro.
              </p>
              <button
                onClick={reiniciar}
                className="btn-press mt-4 text-sm px-4 py-2 rounded-lg"
                style={{ background: C.amber, color: C.onBrand }}
              >
                Voltar ao início
              </button>
            </div>
          )}

          {step === 9 && done && (
            <div className="text-center py-6 anim-pop">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                style={{ background: done.status === "pendente" ? C.purpleSoft : C.greenSoft }}
              >
                {done.status === "pendente" ? (
                  <AlertTriangle size={26} style={{ color: C.purple }} />
                ) : (
                  <CheckCircle2 size={28} style={{ color: C.green }} />
                )}
              </div>
              <div
                className="mt-3 font-semibold"
                style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.1rem" }}
              >
                {done.status === "pendente" ? "Recebemos sua solicitação!" : "Reserva confirmada!"}
              </div>
              <div className="text-sm mt-2 space-y-1" style={{ color: C.inkSoft }}>
                <div>
                  {fmtDate(done.data)} · {labelLocal(done, trips)}
                </div>
                <div>
                  {done.quantidade}x passagem · {fmtBRL(done.valorTotal)} ·{" "}
                  {done.pagamento === "pix" ? "Pix" : "Dinheiro"}
                </div>
                <div>
                  {done.nome} · {done.telefone}
                </div>
              </div>
              {done.status === "pendente" ? (
                <p className="text-xs mt-3" style={{ color: C.purple }}>
                  Vamos verificar a disponibilidade e te avisamos por aqui.
                </p>
              ) : (
                <p className="text-xs mt-4" style={{ color: C.inkFaint }}>
                  Já está na agenda do dia.
                </p>
              )}
              <button
                onClick={reiniciar}
                className="btn-press mt-4 text-sm px-4 py-2 rounded-lg"
                style={{ background: C.amber, color: C.onBrand }}
              >
                Simular nova reserva
              </button>
            </div>
          )}
          {step === 10 && done && (
            <div className="text-center py-6 anim-pop">
              <Hourglass size={30} style={{ color: C.purple, margin: "0 auto" }} />
              <div
                className="mt-3 font-semibold"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Você entrou na lista de espera!
              </div>
              <p className="text-sm mt-2" style={{ color: C.inkSoft }}>
                {done.quantidade}x passagem · {fmtDate(done.data)}. Avisamos assim que houver vaga.
              </p>
              <button
                onClick={reiniciar}
                className="btn-press mt-4 text-sm px-4 py-2 rounded-lg"
                style={{ background: C.amber, color: C.onBrand }}
              >
                Voltar ao início
              </button>
            </div>
          )}
          {step === 11 && (
            <div className="text-center py-6 anim-pop">
              <Package size={30} style={{ color: C.purple, margin: "0 auto" }} />
              <div
                className="mt-3 font-semibold"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Encomenda registrada!
              </div>
              <p className="text-sm mt-2" style={{ color: C.inkSoft }}>
                Nossa equipe vai confirmar o valor e os detalhes com você por aqui.
              </p>
              <button
                onClick={reiniciar}
                className="btn-press mt-4 text-sm px-4 py-2 rounded-lg"
                style={{ background: C.amber, color: C.onBrand }}
              >
                Voltar ao início
              </button>
            </div>
          )}
        </Card>
        <Card>
          <div className="text-sm font-semibold mb-3" style={{ color: C.amber }}>
            Fluxo até virar automação real
          </div>
          <ol className="space-y-3 text-xs" style={{ color: C.inkSoft }}>
            {[
              "Cliente escreve no WhatsApp comercial.",
              "Bot lê horários/valores da configuração e pergunta o bairro quando é busca em casa.",
              "Se lotado, oferece lista de espera (mover para a agenda é sempre manual).",
              "Se o bairro não é reconhecido, encaminha para um atendente confirmar o valor.",
              "Confirmada, pendente ou em espera — tudo cai direto nesta base.",
            ].map((t, i) => (
              <li key={i} className="flex gap-2">
                <span
                  className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold"
                  style={{ background: C.amberSoft, color: C.amber }}
                >
                  {i + 1}
                </span>
                {t}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
function StepBlock({ icon: Icon, title, children }) {
  return (
    <div className="anim-fadeUp">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={17} style={{ color: C.amber }} />
        <div className="font-semibold text-sm">{title}</div>
      </div>
      {children}
    </div>
  );
}
function NextBtn({ onClick, disabled, label = "Continuar" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn-press mt-4 px-4 py-2 rounded-lg text-sm font-medium"
      style={{
        background: disabled ? C.border : C.amber,
        color: disabled ? C.inkFaint : C.onBrand,
      }}
    >
      {label}
    </button>
  );
}

/* ============================= 2. AGENDA — tela operacional ============================= */
function AgendaTab({
  reservas,
  R,
  capacidade,
  trips,
  segundaAtiva,
  segundaHoras,
  deepLink,
  onAgendar,
}) {
  const [data, setData] = useState(todayStr());
  useDeepLinkData(deepLink, setData);
  const [editando, setEditando] = useState(null);
  const [acaoErro, setAcaoErro] = useState("");
  const T = useTrips(data);
  // Mantém a reserva em edição durante a animação de saída do modal (issue #2).
  const modalHeld = useRef(null);
  if (editando) modalHeld.current = editando;
  const segunda = isMonday(data) && segundaAtiva;
  const doDia = reservas.filter((r) => r.data === data && !["frete", "encomenda"].includes(r.tipo));
  const pendentesDoDia = doDia.filter((r) => r.status === "pendente");
  const esperaDoDia = doDia.filter((r) => r.status === "espera");
  const fretesPendentes = reservas.filter((r) => r.tipo === "frete" && r.status === "pendente");
  const encomendasPendentes = reservas.filter(
    (r) => r.tipo === "encomenda" && r.status === "pendente",
  );

  // Toda escrita passa pelas RPCs (capacidade decidida pelo banco). Erro de
  // regra de negócio (ex.: lotou) volta como mensagem — não reexecuta.
  const acao = async (promise, msgFalha) => {
    setAcaoErro("");
    try {
      await promise;
    } catch (e) {
      setAcaoErro(e?.message || msgFalha);
    }
  };
  const atualizarStatus = (id, novoStatus) => {
    if (novoStatus === "cancelada")
      return acao(R.cancelReservation(id), "Não foi possível cancelar.");
    if (novoStatus === "embarcado")
      return acao(R.markPassengers(id, "embarcado"), "Não foi possível marcar embarque.");
    if (novoStatus === "nao_compareceu")
      return acao(R.markPassengers(id, "nao_compareceu"), "Não foi possível marcar.");
    if (novoStatus === "confirmada")
      return acao(
        R.markPassengers(id, "confirmado").then(() => R.confirmReservation(id)),
        "Não foi possível reverter o embarque.",
      );
    return Promise.resolve();
  };
  const confirmarPendente = (r) =>
    acao(
      R.confirmReservation(r.id, { routePointCode: r.pontoId || null }),
      "Não foi possível confirmar (viagem pode estar lotada).",
    );
  const moverDaEspera = (r) => {
    if (!r.pontoId) {
      setAcaoErro("Defina o ponto de embarque ao mover da lista de espera (edite a reserva).");
      return;
    }
    return acao(
      R.confirmReservation(r.id, { routePointCode: r.pontoId }),
      "Ainda não há vaga suficiente na viagem.",
    );
  };
  const salvarEdicao = async ({ id, move, details, quantidade, contato, cancel }) => {
    setAcaoErro("");
    try {
      if (cancel) {
        await R.cancelReservation(id);
        setEditando(null);
        return;
      }
      if (move) await R.moveReservation(id, move);
      if (details && Object.keys(details).length > 0) await R.editReservation(id, details);
      if (quantidade) await R.setQuantity(id, quantidade.qty);
      if (contato) await R.updateContact(contato.customerId, contato.fields);
      setEditando(null);
    } catch (e) {
      setAcaoErro(e?.message || "Não foi possível salvar a edição.");
    }
  };
  const togglePagamento = (r) =>
    acao(
      R.setPaid({ reservationId: r.id, paid: !r.pago, amount: r.valorTotal, method: r.pagamento }),
      "Não foi possível atualizar o pagamento.",
    );
  const toggleComprovante = (r) =>
    acao(
      R.setProof({
        reservationId: r.id,
        received: !r.comprovanteRecebido,
        amount: r.valorTotal,
        method: r.pagamento,
      }),
      "Não foi possível atualizar o comprovante.",
    );
  const dataFrete = (r) => r.data || r.extra?.data || null;

  return (
    <div>
      <Header
        title="Agenda"
        subtitle="Painel operacional do dia — capacidade, confirmados, pendentes, vagas e embarcados."
        right={
          <div className="flex items-center gap-2">
            <TextInput
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-auto"
            />
            {onAgendar && (
              <span className="hidden sm:block">
                <BotaoAgendar onClick={onAgendar} />
              </span>
            )}
          </div>
        }
      />
      <div className="px-6 md:px-10 pb-10 space-y-6 stagger">
        <div className="text-xs" style={{ color: C.inkFaint }}>
          {data === todayStr() ? "Hoje" : fmtDate(data)} — {fmtDate(data)} ·{" "}
          <span className="capitalize">{diaSemana(data)}</span>
        </div>
        {segunda && (
          <div
            className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.warnSoft, color: C.warn }}
          >
            <Sunrise size={14} /> Segunda-feira: horários de ida ajustados automaticamente.
          </div>
        )}
        {acaoErro && (
          <div
            className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} /> {acaoErro}
            </span>
            <button onClick={() => setAcaoErro("")}>
              <XIcon size={13} />
            </button>
          </div>
        )}

        {(pendentesDoDia.length > 0 ||
          esperaDoDia.length > 0 ||
          fretesPendentes.length > 0 ||
          encomendasPendentes.length > 0) && (
          <Card style={{ borderColor: C.purple }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} style={{ color: C.purple }} />
              <div className="text-sm font-semibold" style={{ color: C.purple }}>
                Pendentes e lista de espera
              </div>
            </div>
            <div className="space-y-2">
              {pendentesDoDia.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
                  style={{ background: C.purpleSoft }}
                >
                  <div className="text-xs">
                    <StatusPill status="pendente" />{" "}
                    <span className="font-semibold ml-1">{linhaReserva(r, trips)}</span> · {r.nome}{" "}
                    · {r.motivoPendente}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmarPendente(r)}
                      className="btn-press text-xs px-2 py-1 rounded-md"
                      style={{ background: C.greenSoft, color: C.green }}
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => atualizarStatus(r.id, "cancelada")}
                      className="btn-press text-xs px-2 py-1 rounded-md"
                      style={{ background: C.redSoft, color: C.red }}
                    >
                      Recusar
                    </button>
                  </div>
                </div>
              ))}
              {esperaDoDia.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
                  style={{ background: C.purpleSoft }}
                >
                  <div className="text-xs">
                    <StatusPill status="espera" />{" "}
                    <span className="font-semibold ml-1">
                      {r.quantidade}P {r.pontoId ? labelLocal(r, trips) : "(qualquer ponto)"}
                    </span>{" "}
                    · {r.nome} · {r.telefone}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => moverDaEspera(r)}
                      className="btn-press text-xs px-2 py-1 rounded-md"
                      style={{ background: C.greenSoft, color: C.green }}
                    >
                      Mover p/ reservas (manual)
                    </button>
                    <button
                      onClick={() => setEditando(r)}
                      className="btn-press text-xs px-2 py-1 rounded-md"
                      style={{ background: C.border, color: C.inkSoft }}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
              {fretesPendentes.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
                  style={{ background: C.purpleSoft }}
                >
                  <div className="text-xs flex items-center gap-1.5">
                    <Truck size={12} /> Frete · {r.nome} · {r.telefone}
                    {dataFrete(r) ? ` · ${fmtDate(dataFrete(r))}` : ""}
                  </div>
                  <button
                    onClick={() => atualizarStatus(r.id, "cancelada")}
                    className="btn-press text-xs px-2 py-1 rounded-md"
                    style={{ background: C.border, color: C.inkSoft }}
                  >
                    Arquivar
                  </button>
                </div>
              ))}
              {encomendasPendentes.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
                  style={{ background: C.purpleSoft }}
                >
                  <div className="text-xs flex items-center gap-1.5">
                    <Package size={12} /> Encomenda: {r.extra?.encItem || "—"}
                    {r.extra?.encTipo ? ` (${r.extra.encTipo})` : ""} ·{" "}
                    {r.extra?.encEmbarque || "?"} → {r.extra?.encDesembarque || "?"} · recebe:{" "}
                    {r.nome} ({r.telefone}){dataFrete(r) ? ` · ${fmtDate(dataFrete(r))}` : ""}
                  </div>
                  <button
                    onClick={() => atualizarStatus(r.id, "cancelada")}
                    className="btn-press text-xs px-2 py-1 rounded-md"
                    style={{ background: C.border, color: C.inkSoft }}
                  >
                    Arquivar
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {["ida", "volta"].map((dir) => (
          <ViagemOperacional
            key={dir}
            direcao={dir}
            segunda={segunda}
            segundaHoras={segundaHoras}
            doDia={doDia}
            capacidade={capacidade}
            trips={trips}
            T={T}
            onStatus={atualizarStatus}
            onEditar={setEditando}
            onPagamento={togglePagamento}
            onComprovante={toggleComprovante}
          />
        ))}
      </div>
      <Presence when={!!editando} duration={200}>
        {(state) =>
          modalHeld.current && (
            <div
              style={{
                transition: "opacity 200ms var(--ease-in)",
                opacity: state === "entered" ? 1 : 0,
              }}
            >
              <EditarReservaModal
                reserva={modalHeld.current}
                onClose={() => setEditando(null)}
                onSave={salvarEdicao}
                trips={trips}
              />
            </div>
          )
        }
      </Presence>
    </div>
  );
}
function QuickActions({ r, trips, onStatus, onEditar, onPagamento, onComprovante }) {
  const abrirWhats = () => window.open(`https://wa.me/55${digitos(r.telefone)}`, "_blank");
  const abrirLocal = () => {
    const q = r.pontoId === "busca" ? r.bairro : `${labelLocal(r, trips)} São Luís`;
    window.open(`https://www.google.com/maps/search/${encodeURIComponent(q || "")}`, "_blank");
  };
  const btn = (icon, title, onClick, ativo, corAtivo) => {
    const Icon = icon;
    return (
      <button
        title={title}
        onClick={onClick}
        className="btn-press p-1 rounded"
        style={{ color: ativo ? corAtivo || C.green : C.inkFaint }}
      >
        <Icon size={12} />
      </button>
    );
  };
  return (
    <div className="flex items-center gap-1 shrink-0 flex-wrap">
      {btn(MessageCircle, "WhatsApp", abrirWhats)}
      {btn(MapPin, "Abrir localização", abrirLocal)}
      {btn(Pencil, "Editar", () => onEditar(r))}
      {r.status !== "cancelada" && btn(X, "Cancelar", () => onStatus(r.id, "cancelada"))}
      {r.status !== "embarcado"
        ? btn(CheckCircle2, "Marcar como embarcado", () => onStatus(r.id, "embarcado"))
        : btn(UserX, "Desfazer embarque", () => onStatus(r.id, "confirmada"))}
      {btn(Wallet, r.pago ? "Pago" : "Marcar pagamento", () => onPagamento(r), r.pago)}
      {btn(
        Receipt,
        r.comprovanteRecebido ? "Comprovante recebido" : "Marcar comprovante",
        () => onComprovante(r),
        r.comprovanteRecebido,
        C.blue,
      )}
    </div>
  );
}
function LinhaOperacional({ r, trips, onStatus, onEditar, onPagamento, onComprovante }) {
  const marcado = r.status === "embarcado" || r.status === "nao_compareceu";
  return (
    <div
      className="row-hover flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
      style={{ background: C.panel }}
    >
      <button
        onClick={() => onStatus(r.id, r.status === "embarcado" ? "confirmada" : "embarcado")}
        className="check-anim shrink-0 w-4 h-4 rounded border flex items-center justify-center"
        style={{
          borderColor: r.status === "embarcado" ? C.blue : C.border,
          background: r.status === "embarcado" ? C.blue : "transparent",
        }}
      >
        {r.status === "embarcado" && <Check size={11} color="#0E1116" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className="text-xs font-semibold truncate"
          style={{
            color: marcado ? C.inkFaint : C.ink,
            textDecoration: r.status === "nao_compareceu" ? "line-through" : "none",
          }}
        >
          {linhaReserva(r, trips)}
        </div>
        <div className="text-[10px] truncate flex items-center gap-1" style={{ color: C.inkFaint }}>
          <StatusPill status={r.status} /> {r.desembarque ? `· desembarque: ${r.desembarque}` : ""}
          {r.pagamento === "pix" ? " · Pix" : ""}
        </div>
      </div>
      <QuickActions
        r={r}
        trips={trips}
        onStatus={onStatus}
        onEditar={onEditar}
        onPagamento={onPagamento}
        onComprovante={onComprovante}
      />
    </div>
  );
}
function ViagemOperacional({
  direcao,
  segunda,
  segundaHoras,
  doDia,
  capacidade,
  trips,
  T,
  onStatus,
  onEditar,
  onPagamento,
  onComprovante,
}) {
  const viagem = trips[direcao];
  const doGrupo = doDia.filter((r) => r.direcao === direcao);
  const confirmados = doGrupo
    .filter((r) => OCUPA_VAGA.includes(r.status))
    .reduce((s, r) => s + r.quantidade, 0);
  const pendentesQtd = doGrupo
    .filter((r) => r.status === "pendente")
    .reduce((s, r) => s + r.quantidade, 0);
  const embarcados = doGrupo
    .filter((r) => r.status === "embarcado")
    .reduce((s, r) => s + r.quantidade, 0);
  const vagas = Math.max(0, capacidade - confirmados);
  const horaPrincipal =
    direcao === "ida"
      ? shiftHour(
          viagem.pontos.find((p) => p.id === "rodoviaria")?.horaBase || "05:40",
          segunda,
          segundaHoras,
        )
      : viagem.pontos.map((p) => p.horaBase).join(" / ");
  const Icon = direcao === "ida" ? ArrowRight : ArrowLeft;

  const idOrdem = direcao === "ida" ? IDA_ORDEM_SECOES : VOLTA_ORDEM;
  // já contém todos os pontos (os que não estão em idOrdem vão para o fim).
  const pontosOrdenados = [...viagem.pontos].sort(
    (a, b) =>
      (idOrdem.indexOf(a.id) === -1 ? 99 : idOrdem.indexOf(a.id)) -
      (idOrdem.indexOf(b.id) === -1 ? 99 : idOrdem.indexOf(b.id)),
  );

  const trip = T?.byDirection?.[direcao] || null;
  const viagemAtiva = trip?.status === "em_andamento" ? trip : null;
  const viagemConcluida = trip?.status === "concluida" ? trip : null;
  const iniciarViagem = () => {
    if (!trip?.trip_id) {
      alert("Ainda não há viagem para este dia/direção — crie uma reserva primeiro.");
      return;
    }
    const kmTxt = prompt("Km atual do veículo na saída?");
    if (kmTxt === null) return;
    T.startTrip(trip.trip_id, { km: Number.parseFloat(kmTxt) || 0 }).catch((e) =>
      alert(e?.message || "Não foi possível iniciar a viagem."),
    );
  };
  const finalizarViagem = () => {
    if (!viagemAtiva?.trip_id) return;
    const kmTxt = prompt("Km atual do veículo na chegada?");
    if (kmTxt === null) return;
    T.finishTrip(viagemAtiva.trip_id, { km: Number.parseFloat(kmTxt) || 0 }).catch((e) =>
      alert(e?.message || "Não foi possível finalizar a viagem."),
    );
  };
  const avisarJanela = (nomeCidade) =>
    alert(
      `Mensagem simulada enviada aos passageiros de ${nomeCidade}: "Estamos a caminho para te buscar! 🚐"`,
    );

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-lg flex items-center justify-center"
            style={{ background: C.blueSoft }}
          >
            <Icon size={18} style={{ color: C.blue }} />
          </div>
          <div>
            <div className="text-sm font-semibold">
              🚌 {viagem.nome} — {horaPrincipal}
            </div>
            <div className="text-xs" style={{ color: C.inkSoft }}>
              {viagem.label}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {viagemConcluida ? (
            <span
              className="text-xs px-2 py-1.5 rounded-lg"
              style={{ background: C.greenSoft, color: C.green }}
            >
              ✓ Viagem concluída
            </span>
          ) : !viagemAtiva ? (
            <button
              onClick={iniciarViagem}
              className="btn-press flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg"
              style={{ background: C.greenSoft, color: C.green }}
            >
              <PlayCircle size={13} /> Iniciar viagem
            </button>
          ) : (
            <button
              onClick={finalizarViagem}
              className="btn-press flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg"
              style={{ background: C.redSoft, color: C.red }}
            >
              <StopCircle size={13} /> Finalizar viagem
            </button>
          )}
        </div>
      </div>
      {viagemAtiva && (
        <div
          className="text-xs mb-3 rounded-lg px-3 py-2 flex items-center gap-1.5"
          style={{ background: C.blueSoft, color: C.blue }}
        >
          <Route size={12} /> Em andamento desde{" "}
          {viagemAtiva.started_at ? fmtHora(viagemAtiva.started_at) : "—"} · km saída{" "}
          {viagemAtiva.start_km ?? "—"}
        </div>
      )}
      {viagemConcluida && (
        <div
          className="text-xs mb-3 rounded-lg px-3 py-2 flex items-center gap-1.5"
          style={{ background: C.greenSoft, color: C.green }}
        >
          <Route size={12} /> Concluída
          {viagemConcluida.duration_min ? ` em ${viagemConcluida.duration_min} min` : ""}
          {viagemConcluida.end_km ? ` · km chegada ${viagemConcluida.end_km}` : ""}
        </div>
      )}
      <div
        className="grid grid-cols-3 sm:grid-cols-5 gap-2 rounded-lg px-3 py-3 mb-4"
        style={{ background: C.panel2 }}
      >
        <MiniStat label="Capacidade" value={capacidade} />
        <MiniStat label="Confirmados" value={confirmados} cor={C.green} />
        <MiniStat label="Pendentes" value={pendentesQtd} cor={C.warn} />
        <MiniStat label="Vagas" value={vagas} cor={vagas === 0 ? C.red : C.ink} />
        <MiniStat label="Embarcados" value={embarcados} cor={C.blue} />
      </div>
      <div className="space-y-3">
        {pontosOrdenados.map((p) => {
          const hora = shiftHour(p.horaBase, direcao === "ida" && segunda, segundaHoras);
          const itens = doGrupo.filter(
            (r) => r.pontoId === p.id && r.status !== "cancelada" && r.status !== "espera",
          );
          return (
            <div key={p.id}>
              <div
                className="text-xs font-semibold mb-1.5 flex items-center gap-2"
                style={{ color: C.inkSoft }}
              >
                <span>
                  {hora} — {p.nome.toUpperCase()}
                </span>
                {p.janela && <Pill color={C.purple}>{p.janela}</Pill>}
                {p.janela && (
                  <button
                    onClick={() => avisarJanela(p.nome)}
                    className="btn-press flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: C.blueSoft, color: C.blue }}
                  >
                    <Megaphone size={10} /> Avisar
                  </button>
                )}
              </div>
              {itens.length === 0 ? (
                <div className="text-xs pl-1" style={{ color: C.inkFaint }}>
                  Sem reservas.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {itens.map((r) => (
                    <LinhaOperacional
                      key={r.id}
                      r={r}
                      trips={trips}
                      onStatus={onStatus}
                      onEditar={onEditar}
                      onPagamento={onPagamento}
                      onComprovante={onComprovante}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
// Fase 1 (issue #10): a edição foi enxugada para o que o banco aceita com
// segurança — data/direção/ponto passam pela RPC de realocação (revalida
// capacidade no destino); desembarque/rua/referência/bairro/pagamento são
// campos que não mexem em vaga. Quantidade, nome e telefone ficam para a
// fase 2 (precisam de RPC própria / edição de cliente). Status muda pelos
// botões da linha, não aqui.
function EditarReservaModal({ reserva, onClose, onSave, trips }) {
  const [f, setF] = useState({ ...reserva });
  const [salvando, setSalvando] = useState(false);
  const viagem = trips[f.direcao] || trips.ida;
  const ponto = viagem.pontos.find((p) => p.id === f.pontoId);
  const campoDetalhe = ponto?.campo; // 'bairro' | 'localExato' | 'localOutro' | undefined

  const salvar = async () => {
    setSalvando(true);
    const move =
      f.data !== reserva.data ||
      f.direcao !== reserva.direcao ||
      (f.pontoId || null) !== (reserva.pontoId || null)
        ? { tripDate: f.data, direction: f.direcao, routePointCode: f.pontoId || null }
        : null;
    const details = {};
    const set = (col, atual, orig) => {
      if ((atual ?? "") !== (orig ?? "")) details[col] = atual || null;
    };
    set("dropoff_location", f.desembarque, reserva.desembarque);
    set("payment_method", f.pagamento, reserva.pagamento);
    set("street", f.rua, reserva.rua);
    set("reference_point", f.referencia, reserva.referencia);
    if (campoDetalhe === "bairro") set("pickup_neighborhood", f.bairro, reserva.bairro);
    if (campoDetalhe && campoDetalhe !== "bairro")
      set("pickup_detail", f[campoDetalhe], reserva.localExato);

    const novaQtd = Number.parseInt(f.quantidade, 10) || 1;
    const quantidade = novaQtd !== reserva.quantidade ? { qty: novaQtd } : null;
    const contatoFields = {};
    if ((f.nome || "") !== (reserva.nome || "")) contatoFields.name = f.nome || null;
    if ((f.telefone || "") !== (reserva.telefone || "")) contatoFields.phone = f.telefone || null;
    const contato =
      reserva.customer_id && Object.keys(contatoFields).length > 0
        ? { customerId: reserva.customer_id, fields: contatoFields }
        : null;

    await onSave({ id: reserva.id, move, details, quantidade, contato });
    setSalvando(false);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 anim-fadeIn"
      style={{ background: "rgba(0,0,0,.65)" }}
      onClick={onClose}
    >
      <div
        className="anim-pop w-full max-w-lg rounded-xl border p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: C.panel, borderColor: C.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div
            className="font-semibold text-sm"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Editar reserva
          </div>
          <button type="button" onClick={onClose}>
            <X size={16} style={{ color: C.inkSoft }} />
          </button>
        </div>
        <div className="text-xs mb-3 flex items-center gap-1.5" style={{ color: C.inkFaint }}>
          <Clock size={12} /> {f.quantidade}P
          {f.criadoEm ? ` · reservado ${fmtHora(f.criadoEm)}` : ""}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Nome">
            <TextInput
              value={f.nome || ""}
              onChange={(e) => setF({ ...f, nome: e.target.value })}
            />
          </Field>
          <Field label="Telefone">
            <TextInput
              value={f.telefone || ""}
              onChange={(e) => setF({ ...f, telefone: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Direção">
            <Select
              value={f.direcao || "ida"}
              onChange={(e) =>
                setF({ ...f, direcao: e.target.value, pontoId: trips[e.target.value].pontos[0].id })
              }
            >
              <option value="ida">Ida</option>
              <option value="volta">Volta</option>
            </Select>
          </Field>
          <Field label="Local de embarque">
            <Select
              value={f.pontoId || ""}
              onChange={(e) => setF({ ...f, pontoId: e.target.value })}
            >
              <option value="">—</option>
              {viagem.pontos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Data">
            <TextInput
              type="date"
              value={f.data || ""}
              onChange={(e) => setF({ ...f, data: e.target.value })}
            />
          </Field>
          <Field label="Quantidade">
            <TextInput
              type="number"
              min={1}
              value={f.quantidade}
              onChange={(e) => setF({ ...f, quantidade: e.target.value })}
            />
          </Field>
        </div>
        {campoDetalhe === "bairro" && (
          <Field label="Bairro">
            <TextInput
              value={f.bairro || ""}
              onChange={(e) => setF({ ...f, bairro: e.target.value })}
            />
          </Field>
        )}
        {campoDetalhe && campoDetalhe !== "bairro" && (
          <Field label={ponto.campoLabel}>
            <TextInput
              value={f[campoDetalhe] || ""}
              onChange={(e) => setF({ ...f, [campoDetalhe]: e.target.value })}
            />
          </Field>
        )}
        {f.direcao === "volta" && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Field label="Rua">
              <TextInput
                value={f.rua || ""}
                onChange={(e) => setF({ ...f, rua: e.target.value })}
              />
            </Field>
            <Field label="Referência">
              <TextInput
                value={f.referencia || ""}
                onChange={(e) => setF({ ...f, referencia: e.target.value })}
              />
            </Field>
          </div>
        )}
        <div className="mt-2">
          <Field label="Local de desembarque">
            <TextInput
              value={f.desembarque || ""}
              onChange={(e) => setF({ ...f, desembarque: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Field label="Pagamento">
            <Select
              value={f.pagamento || "dinheiro"}
              onChange={(e) => setF({ ...f, pagamento: e.target.value })}
            >
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
            </Select>
          </Field>
          <div />
        </div>
        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={() => onSave({ id: reserva.id, cancel: true })}
            className="btn-press text-xs px-3 py-2 rounded-lg"
            style={{ color: C.red, background: C.redSoft }}
          >
            Cancelar reserva
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={salvar}
            className="btn-press text-sm px-4 py-2 rounded-lg font-medium"
            style={{
              background: salvando ? C.border : C.amber,
              color: salvando ? C.inkFaint : C.onBrand,
            }}
          >
            {salvando ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Agendamento manual (Agenda / Lista do Dia) ------------------------
   Atalho interno: a equipe marca um passageiro direto na tela operacional,
   sem passar pelo roteiro do bot. Vai pela MESMA RPC (rpc_create_reservation
   via R.createReservation) — a capacidade é decidida pelo banco. */
const BAIRROS_BUSCA = [...new Set([...BAIRROS_80, ...BAIRROS_90])].sort((a, b) =>
  a.localeCompare(b, "pt-BR"),
);

function NovaReservaModal({ dataInicial, direcaoInicial = "ida", trips, onClose, onCriar }) {
  const primeiroPonto = (dir) => trips[dir]?.pontos?.[0]?.id || "";
  const [f, setF] = useState({
    nome: "",
    telefone: "",
    data: dataInicial || todayStr(),
    direcao: direcaoInicial,
    pontoId: primeiroPonto(direcaoInicial),
    bairro: "",
    detalhe: "",
    quantidade: "1",
    pagamento: "dinheiro",
    valorManual: "",
    desembarque: "",
    rua: "",
    referencia: "",
    comoPendente: false,
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ofereceEspera, setOfereceEspera] = useState(false);

  const viagem = trips[f.direcao] || trips.ida;
  const ponto = viagem.pontos.find((p) => p.id === f.pontoId);
  const campoDetalhe = ponto?.campo; // 'bairro' | 'localExato' | 'localOutro' | undefined
  const precoBairroAtual = campoDetalhe === "bairro" ? precoBairro(f.bairro) : undefined;
  const bairroNaoReconhecido =
    campoDetalhe === "bairro" && f.bairro.trim() && precoBairroAtual === null;
  const precoAuto =
    campoDetalhe === "bairro" ? (precoBairroAtual ?? 80) : (ponto?.valor ?? 60);
  const valorUnit =
    f.valorManual !== "" ? Number.parseFloat(f.valorManual) || 0 : precoAuto;
  const qtd = Number.parseInt(f.quantidade, 10) || 1;
  const podeEnviar =
    f.nome.trim() &&
    f.telefone.trim() &&
    f.pontoId &&
    (campoDetalhe !== "bairro" || f.bairro.trim());

  const trocarDirecao = (dir) =>
    setF((s) => ({ ...s, direcao: dir, pontoId: primeiroPonto(dir), bairro: "", detalhe: "" }));

  const montarPayload = (status) => ({
    tripDate: f.data,
    direction: f.direcao,
    customerName: f.nome.trim(),
    customerPhone: f.telefone.trim(),
    routePointCode: f.pontoId || null,
    quantity: qtd,
    unitPrice: valorUnit,
    paymentMethod: f.pagamento,
    pickupNeighborhood: campoDetalhe === "bairro" ? f.bairro.trim() || null : null,
    pickupDetail:
      campoDetalhe && campoDetalhe !== "bairro" ? f.detalhe.trim() || null : null,
    street: f.direcao === "volta" ? f.rua.trim() || null : null,
    referencePoint: f.direcao === "volta" ? f.referencia.trim() || null : null,
    dropoffLocation: f.desembarque.trim() || null,
    status,
    pendingReason:
      status === "pendente" ? "Agendamento manual — aguardando confirmação." : null,
    extraData: { origem: "agendamento_manual" },
  });

  const criar = async (status) => {
    setErro("");
    setSalvando(true);
    try {
      const res = await onCriar(montarPayload(status));
      onClose({ ok: true, nome: f.nome.trim(), status: res?.status || status, data: f.data });
    } catch (e) {
      if (e?.code === "CAPACITY_OR_BUSINESS_RULE" && status !== "espera") {
        setOfereceEspera(true);
        setErro(e?.message || "Viagem lotada.");
      } else {
        setErro(e?.message || "Não foi possível agendar. Tente de novo.");
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 anim-fadeIn"
      style={{ background: "rgba(0,0,0,.65)" }}
      onClick={() => onClose()}
    >
      <div
        className="anim-pop w-full max-w-lg rounded-xl border p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: C.panel, borderColor: C.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Agendar passagem
          </div>
          <button type="button" onClick={() => onClose()}>
            <X size={16} style={{ color: C.inkSoft }} />
          </button>
        </div>

        {erro && (
          <div
            className="mb-3 flex items-start gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Nome *">
            <TextInput value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          </Field>
          <Field label="Telefone *">
            <TextInput
              value={f.telefone}
              inputMode="tel"
              onChange={(e) => setF({ ...f, telefone: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Data">
            <TextInput
              type="date"
              value={f.data}
              onChange={(e) => setF({ ...f, data: e.target.value })}
            />
          </Field>
          <Field label="Direção">
            <Select value={f.direcao} onChange={(e) => trocarDirecao(e.target.value)}>
              <option value="ida">Ida</option>
              <option value="volta">Volta</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Ponto de embarque">
            <Select value={f.pontoId} onChange={(e) => setF({ ...f, pontoId: e.target.value })}>
              {viagem.pontos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantidade">
            <TextInput
              type="number"
              min={1}
              value={f.quantidade}
              onChange={(e) => setF({ ...f, quantidade: e.target.value })}
            />
          </Field>
        </div>

        {campoDetalhe === "bairro" && (
          <div className="mb-2">
            <Field label="Bairro (busca em casa)">
              <TextInput
                list="bairros-agendamento"
                value={f.bairro}
                onChange={(e) => setF({ ...f, bairro: e.target.value })}
                placeholder="Ex.: Centro"
              />
            </Field>
            <datalist id="bairros-agendamento">
              {BAIRROS_BUSCA.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            {f.bairro.trim() && !bairroNaoReconhecido && (
              <div className="text-[11px] mt-1" style={{ color: C.green }}>
                Valor de busca para {f.bairro.trim()}: {fmtBRL(precoAuto)} / passagem
              </div>
            )}
            {bairroNaoReconhecido && (
              <div className="text-[11px] mt-1" style={{ color: C.warn }}>
                Bairro fora da tabela — confira o valor abaixo antes de salvar.
              </div>
            )}
          </div>
        )}

        {campoDetalhe && campoDetalhe !== "bairro" && (
          <div className="mb-2">
            <Field label={ponto.campoLabel || "Local"}>
              <TextInput
                value={f.detalhe}
                onChange={(e) => setF({ ...f, detalhe: e.target.value })}
              />
            </Field>
          </div>
        )}

        {f.direcao === "volta" && (
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Field label="Rua (opcional)">
              <TextInput value={f.rua} onChange={(e) => setF({ ...f, rua: e.target.value })} />
            </Field>
            <Field label="Referência (opcional)">
              <TextInput
                value={f.referencia}
                onChange={(e) => setF({ ...f, referencia: e.target.value })}
              />
            </Field>
          </div>
        )}

        <div className="mb-2">
          <Field label="Local de desembarque (opcional)">
            <TextInput
              value={f.desembarque}
              onChange={(e) => setF({ ...f, desembarque: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <Field label="Pagamento">
            <Select
              value={f.pagamento}
              onChange={(e) => setF({ ...f, pagamento: e.target.value })}
            >
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">Pix</option>
            </Select>
          </Field>
          <Field label={`Valor / passagem (auto: ${fmtBRL(precoAuto)})`}>
            <TextInput
              type="number"
              value={f.valorManual}
              placeholder={String(precoAuto)}
              onChange={(e) => setF({ ...f, valorManual: e.target.value })}
            />
          </Field>
        </div>

        <label
          className="flex items-center gap-2 text-xs mb-4 cursor-pointer"
          style={{ color: C.inkSoft }}
        >
          <input
            type="checkbox"
            checked={f.comoPendente}
            onChange={(e) => setF({ ...f, comoPendente: e.target.checked })}
          />
          Deixar como pendente (não reserva a vaga ainda)
        </label>

        <div
          className="flex items-center justify-between text-xs mb-3 rounded-lg px-3 py-2"
          style={{ background: C.panel2, color: C.inkSoft }}
        >
          <span>
            {qtd}× {fmtDate(f.data)} · {f.direcao === "ida" ? "Ida" : "Volta"}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: C.ink }}>
            {fmtBRL(valorUnit * qtd)}
          </span>
        </div>

        <div className="flex items-center justify-end gap-2">
          {ofereceEspera && (
            <button
              type="button"
              disabled={salvando}
              onClick={() => criar("espera")}
              className="btn-press text-xs px-3 py-2 rounded-lg"
              style={{ background: C.purpleSoft, color: C.purple, fontWeight: 600 }}
            >
              Pôr na lista de espera
            </button>
          )}
          <button
            type="button"
            disabled={salvando || !podeEnviar}
            onClick={() => criar(f.comoPendente ? "pendente" : "confirmada")}
            className="btn-press text-sm px-4 py-2 rounded-lg font-medium"
            style={{
              background: salvando || !podeEnviar ? C.border : C.amber,
              color: salvando || !podeEnviar ? C.inkFaint : C.onBrand,
            }}
          >
            {salvando ? "Agendando…" : "Agendar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BotaoAgendar({ onClick }) {
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

/* ============================= 3. LISTA DO DIA ============================= */
function ListaTab({ reservas, R, trips, deepLink, onAgendar }) {
  const [data, setData] = useState(todayStr());
  useDeepLinkData(deepLink, setData);
  const [erro, setErro] = useState("");
  const [subview, setSubview] = useState("embarque");
  const doDia = reservas.filter(
    (r) =>
      r.data === data &&
      !["frete", "encomenda"].includes(r.tipo) &&
      r.status !== "cancelada" &&
      r.status !== "espera",
  );
  const pendentes = doDia.filter((r) => r.status === "pendente");
  const ativos = doDia.filter((r) => OCUPA_VAGA.includes(r.status));
  const alvos = useMemo(
    () => [
      ...trips.ida.pontos.map((p) => ({
        key: `ida__${p.id}`,
        direcao: "ida",
        pontoId: p.id,
        nome: p.nome,
      })),
      ...trips.volta.pontos.map((p) => ({
        key: `volta__${p.id}`,
        direcao: "volta",
        pontoId: p.id,
        nome: p.nome,
      })),
    ],
    [trips],
  );
  const mover = async (id, chaveAlvo) => {
    const alvo = alvos.find((a) => a.key === chaveAlvo);
    if (!alvo) return;
    setErro("");
    try {
      await R.moveReservation(id, {
        tripDate: data,
        direction: alvo.direcao,
        routePointCode: alvo.pontoId,
      });
    } catch (e) {
      setErro(e?.message || "Não foi possível realocar.");
    }
  };
  const remove = async (id) => {
    setErro("");
    try {
      await R.cancelReservation(id);
    } catch (e) {
      setErro(e?.message || "Não foi possível remover.");
    }
  };
  // Ações do motorista direto na lista de embarque.
  const marcar = async (id, acao) => {
    setErro("");
    try {
      if (acao === "embarcado") await R.markPassengers(id, "embarcado");
      else if (acao === "nao_compareceu") await R.markPassengers(id, "nao_compareceu");
      else await R.markPassengers(id, "confirmado").then(() => R.confirmReservation(id));
    } catch (e) {
      setErro(e?.message || "Não foi possível atualizar o passageiro.");
    }
  };
  // inclui quem já foi marcado "não compareceu" (some da contagem de pax,
  // mas o motorista ainda vê e pode reverter).
  const naRota = doDia.filter(
    (r) => OCUPA_VAGA.includes(r.status) || r.status === "nao_compareceu",
  );
  const buscaItens = naRota.filter((r) => r.direcao === "ida" && r.pontoId === "busca");
  const agrupadosIda = naRota
    .filter((r) => r.direcao === "ida" && r.pontoId !== "busca")
    .sort((a, b) => (IDA_PRIORIDADE[a.pontoId] ?? 3) - (IDA_PRIORIDADE[b.pontoId] ?? 3));
  const cantanhedeItens = naRota.filter((r) => r.direcao === "volta" && r.pontoId === "cantanhede");
  const pirapemasItens = naRota.filter((r) => r.direcao === "volta" && r.pontoId === "pirapemas");
  const outrasVolta = naRota.filter(
    (r) => r.direcao === "volta" && r.pontoId !== "cantanhede" && r.pontoId !== "pirapemas",
  );

  return (
    <div>
      <Header
        title="Lista do Dia"
        subtitle='Anotações por local — busca em casa no formato "NP - BAIRRO - TELEFONE".'
        right={
          <div className="flex items-center gap-2">
            <TextInput
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-auto"
            />
            {onAgendar && (
              <span className="hidden sm:block">
                <BotaoAgendar onClick={onAgendar} />
              </span>
            )}
          </div>
        }
      />
      <div className="px-6 md:px-10 pb-10 space-y-6 stagger">
        {erro && (
          <div
            className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} /> {erro}
            </span>
            <button onClick={() => setErro("")}>
              <XIcon size={13} />
            </button>
          </div>
        )}
        <div className="flex gap-1 rounded-lg p-1 w-fit" style={{ background: C.panel2 }}>
          {[
            { id: "embarque", label: "Embarque", Icon: ClipboardList },
            { id: "desembarque", label: "Desembarque (rota)", Icon: MapPin },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubview(id)}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
              style={{
                background: subview === id ? C.amberSoft : "transparent",
                color: subview === id ? C.amber : C.inkSoft,
                fontWeight: subview === id ? 600 : 500,
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
        {subview === "desembarque" && (
          <DesembarqueView reservas={reservas} R={R} data={data} />
        )}
        {subview === "embarque" && (
          <>
        {pendentes.length > 0 && (
          <Card style={{ borderColor: C.purple }}>
            <div
              className="text-xs font-semibold mb-2 flex items-center gap-1.5"
              style={{ color: C.purple }}
            >
              <AlertTriangle size={13} /> Pendentes (fora da rota padrão)
            </div>
            <div className="space-y-1.5">
              {pendentes.map((r) => (
                <div
                  key={r.id}
                  className="text-xs rounded-md px-2 py-1.5"
                  style={{ background: C.purpleSoft }}
                >
                  {linhaReserva(r, trips)} — {r.desembarque}
                </div>
              ))}
            </div>
          </Card>
        )}
        <div className="text-center">
          <span
            className="inline-block px-4 py-1 rounded-full text-sm font-bold tracking-wide"
            style={{
              background: C.amberSoft,
              color: C.amber,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            IDA
          </span>
        </div>
        <ListaSecao
          titulo="BUSCAR EM CASA"
          itens={buscaItens}
          trips={trips}
          alvos={alvos}
          marcar={marcar}
          mover={mover}
          remove={remove}
        />
        <ListaSecao
          titulo="RODOVIÁRIA / RETORNO / POSTO CARONE / BR / OUTROS"
          itens={agrupadosIda}
          trips={trips}
          alvos={alvos}
          marcar={marcar}
          mover={mover}
          remove={remove}
        />
        <div className="text-center pt-2">
          <span
            className="inline-block px-4 py-1 rounded-full text-sm font-bold tracking-wide"
            style={{
              background: C.blueSoft,
              color: C.blue,
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            VOLTA
          </span>
        </div>
        <ListaSecao
          titulo="CANTANHEDE"
          itens={cantanhedeItens}
          trips={trips}
          alvos={alvos}
          marcar={marcar}
          mover={mover}
          remove={remove}
        />
        <ListaSecao
          titulo="PIRAPEMAS"
          itens={[...pirapemasItens, ...outrasVolta]}
          trips={trips}
          alvos={alvos}
          marcar={marcar}
          mover={mover}
          remove={remove}
        />
          </>
        )}
      </div>
    </div>
  );
}

/* --- Desembarque: rota de entrega do motorista, editável (issue: rota) --- */
function DesembarqueView({ reservas, R, data }) {
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const doDia = useMemo(
    () =>
      reservas.filter(
        (r) =>
          r.data === data &&
          !["frete", "encomenda"].includes(r.tipo) &&
          OCUPA_VAGA.includes(r.status),
      ),
    [reservas, data],
  );

  const acao = async (p) => {
    setErro("");
    setSalvando(true);
    try {
      await p;
    } catch (e) {
      setErro(e?.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };
  const mudarBalde = (r, area) =>
    acao(R.setDropoff(r.id, { area, detail: detalheDesembarque(r) }));
  const mudarDetalhe = (r, detalhe) => {
    if ((detalhe || "") === (detalheDesembarque(r) || "")) return;
    acao(R.setDropoff(r.id, { area: inferirBaldeDesembarque(r), detail: detalhe }));
  };
  const reordenar = (idsNaOrdem) => acao(R.reorderDropoff(idsNaOrdem));

  const temAlguem = doDia.length > 0;

  return (
    <div className="space-y-6">
      <div className="text-xs" style={{ color: C.inkFaint }}>
        Ordem de entrega por local, editável. Base: o desembarque que o cliente
        informou no agendamento — ajuste o balde e a ordem para montar a rota.
        {salvando && " · salvando…"}
      </div>
      {erro && (
        <div
          className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> {erro}
          </span>
          <button type="button" onClick={() => setErro("")}>
            <XIcon size={13} />
          </button>
        </div>
      )}
      {!temAlguem && (
        <div className="text-sm" style={{ color: C.inkFaint }}>
          Nenhum passageiro confirmado nesse dia.
        </div>
      )}
      {temAlguem &&
        ["ida", "volta"].map((direcao) => {
          const itens = doDia.filter((r) => r.direcao === direcao);
          if (itens.length === 0) return null;
          return (
            <div key={direcao} className="space-y-3">
              <div className="text-center">
                <span
                  className="inline-block px-4 py-1 rounded-full text-sm font-bold tracking-wide"
                  style={{
                    background: direcao === "ida" ? C.amberSoft : C.blueSoft,
                    color: direcao === "ida" ? C.amber : C.blue,
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  {direcao === "ida" ? "IDA — desembarque" : "VOLTA — desembarque"}
                </span>
              </div>
              {baldesDesembarque(direcao).map((balde) => {
                const doBalde = itens
                  .filter((r) => inferirBaldeDesembarque(r) === balde.id)
                  .sort(
                    (a, b) =>
                      (a.desembarqueSeq ?? 9999) - (b.desembarqueSeq ?? 9999) ||
                      (a.nome || "").localeCompare(b.nome || ""),
                  );
                return (
                  <DesembarqueBalde
                    key={balde.id}
                    balde={balde}
                    direcao={direcao}
                    itens={doBalde}
                    salvando={salvando}
                    onBalde={mudarBalde}
                    onDetalhe={mudarDetalhe}
                    onReordenar={reordenar}
                  />
                );
              })}
            </div>
          );
        })}
    </div>
  );
}

function DesembarqueBalde({ balde, direcao, itens, salvando, onBalde, onDetalhe, onReordenar }) {
  const pax = itens.reduce((s, r) => s + (r.quantidade || 1), 0);
  const mover = (idx, dir) => {
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= itens.length) return;
    const ids = itens.map((r) => r.id);
    [ids[idx], ids[alvo]] = [ids[alvo], ids[idx]];
    onReordenar(ids);
  };
  const placeholder =
    balde.id === "casa"
      ? "Bairro onde vai ficar"
      : balde.id === "br"
        ? "Ponto de referência na BR"
        : "Endereço / referência";

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold tracking-wide" style={{ color: C.inkSoft }}>
          {balde.label.toUpperCase()}
        </div>
        <Pill color={C.blue}>{pax} pax</Pill>
      </div>
      {itens.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          — ninguém —
        </div>
      ) : (
        <ol className="list-none space-y-1.5">
          {itens.map((r, idx) => (
            <li key={r.id} className="rounded-md px-2.5 py-2" style={{ background: C.panel2 }}>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="tabular-nums shrink-0"
                  style={{ color: C.inkFaint, fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {idx + 1}.
                </span>
                <span className="font-semibold truncate" style={{ color: C.ink }}>
                  {r.nome || "—"}
                </span>
                <span className="shrink-0" style={{ color: C.inkSoft }}>
                  · {r.quantidade}P
                </span>
                <StatusPill status={r.status} />
                <span className="ml-auto flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0 || salvando}
                    onClick={() => mover(idx, -1)}
                    title="Entregar antes"
                    style={{ opacity: idx === 0 ? 0.3 : 1 }}
                  >
                    <ChevronUp size={15} style={{ color: C.inkSoft }} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === itens.length - 1 || salvando}
                    onClick={() => mover(idx, 1)}
                    title="Entregar depois"
                    style={{ opacity: idx === itens.length - 1 ? 0.3 : 1 }}
                  >
                    <ChevronDown size={15} style={{ color: C.inkSoft }} />
                  </button>
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <input
                  key={`${r.id}:${detalheDesembarque(r)}`}
                  defaultValue={detalheDesembarque(r)}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => onDetalhe(r, e.target.value.trim())}
                  placeholder={placeholder}
                  className="flex-1 min-w-0 text-xs rounded px-2 py-1 outline-none"
                  style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.ink }}
                />
                <select
                  value={balde.id}
                  onChange={(e) => onBalde(r, e.target.value)}
                  className="text-xs rounded px-1 py-1 outline-none shrink-0"
                  style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.inkSoft }}
                >
                  {baldesDesembarque(direcao).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              {(r.telefone || r.desembarque) && (
                <div className="text-[11px] mt-1 truncate" style={{ color: C.inkFaint }}>
                  {r.telefone}
                  {r.desembarque ? ` · cliente informou: "${r.desembarque}"` : ""}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function ListaSecao({ titulo, itens, trips, alvos, mover, remove, marcar }) {
  const paxAtivos = itens
    .filter((r) => OCUPA_VAGA.includes(r.status))
    .reduce((s, r) => s + r.quantidade, 0);
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold tracking-wide" style={{ color: C.inkSoft }}>
          {titulo}
        </div>
        <Pill color={C.blue}>{paxAtivos} pax</Pill>
      </div>
      {itens.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          — sem anotações —
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((r) => (
            <LinhaEmbarque
              key={r.id}
              r={r}
              trips={trips}
              alvos={alvos}
              mover={mover}
              remove={remove}
              marcar={marcar}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// Linha de passageiro na lista de embarque — pensada pro celular do
// motorista: nome grande, telefone com toque pra ligar / abrir WhatsApp,
// e dois botões grandes "Embarcou" / "Faltou".
function LinhaEmbarque({ r, trips, alvos, mover, remove, marcar }) {
  const tel = digitos(r.telefone);
  const embarcado = r.status === "embarcado";
  const faltou = r.status === "nao_compareceu";
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: C.panel2, opacity: faltou ? 0.6 : 1 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="text-sm font-bold"
            style={{ color: C.ink, textDecoration: faltou ? "line-through" : "none" }}
          >
            {linhaReserva(r, trips)}
          </div>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            <StatusPill status={r.status} />
            {r.pago ? (
              <span className="text-[10px]" style={{ color: C.green }}>
                pago
              </span>
            ) : (
              <span className="text-[10px]" style={{ color: C.warn }}>
                a receber {fmtBRL(r.valorTotal)}
              </span>
            )}
          </div>
        </div>
        {(mover || remove) && (
          <div className="flex items-center gap-1.5 shrink-0">
            {mover && <MoverCompacto reservaId={r.id} alvos={alvos} mover={mover} />}
            {remove && (
              <button type="button" onClick={() => remove(r.id)} aria-label="Cancelar">
                <X size={14} style={{ color: C.red }} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {tel && (
          <>
            <a
              href={`tel:${tel}`}
              className="btn-press flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md"
              style={{ background: C.panel, color: C.inkSoft }}
            >
              <PhoneCall size={12} /> {r.telefone}
            </a>
            <a
              href={`https://wa.me/55${tel}`}
              target="_blank"
              rel="noreferrer"
              className="btn-press flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md"
              style={{ background: C.greenSoft, color: C.green }}
            >
              <MessageCircle size={12} /> WhatsApp
            </a>
          </>
        )}
      </div>

      {marcar && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => marcar(r.id, embarcado ? "reverter" : "embarcado")}
            className="btn-press flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold"
            style={{
              background: embarcado ? C.green : C.greenSoft,
              color: embarcado ? "#0C1F16" : C.green,
            }}
          >
            <Check size={15} /> {embarcado ? "Embarcou ✓" : "Embarcou"}
          </button>
          <button
            type="button"
            onClick={() => marcar(r.id, faltou ? "reverter" : "nao_compareceu")}
            className="btn-press flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold"
            style={{
              background: faltou ? C.gray : C.graySoft,
              color: faltou ? "#0E1116" : C.inkSoft,
            }}
          >
            <UserX size={15} /> {faltou ? "Faltou" : "Não veio"}
          </button>
        </div>
      )}
    </div>
  );
}
function MoverCompacto({ reservaId, alvos, mover }) {
  const [aberto, setAberto] = useState(false);
  if (!aberto)
    return (
      <button onClick={() => setAberto(true)} title="Mover">
        <ArrowLeftRight size={12} style={{ color: C.inkFaint }} />
      </button>
    );
  return (
    <select
      onBlur={() => setAberto(false)}
      onChange={(e) => {
        mover(reservaId, e.target.value);
        setAberto(false);
      }}
      defaultValue=""
      className="text-[10px] rounded px-1 py-0.5 outline-none"
      style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.ink, width: 88 }}
    >
      <option value="" disabled>
        mover…
      </option>
      {alvos.map((a) => (
        <option key={a.key} value={a.key}>
          {a.nome}
        </option>
      ))}
    </select>
  );
}

/* ============================= 4. PASSAGEIROS / CRM ============================= */
function PassageirosTab({ reservas, trips, deepLink }) {
  const [busca, setBusca] = useState("");
  const deepLinkAplicado = useRef(null);
  useEffect(() => {
    if (
      deepLink?.kind === "passageiro" &&
      deepLink.termo &&
      deepLink.at !== deepLinkAplicado.current
    ) {
      deepLinkAplicado.current = deepLink.at;
      setBusca(deepLink.termo);
    }
  }, [deepLink]);
  const [aberto, setAberto] = useState(null);
  const [erro, setErro] = useState("");
  const { customers, updateNotes } = useCustomers();
  const notaDe = (cid) => customers.find((c) => c.id === cid)?.notes || "";
  const passageiros = useMemo(() => {
    const map = {};
    reservas
      .filter((r) => !["frete", "encomenda"].includes(r.tipo) && r.customer_id)
      .forEach((r) => {
        const key = r.customer_id;
        if (!map[key])
          map[key] = { customer_id: key, nome: r.nome, telefone: r.telefone, viagens: [] };
        map[key].viagens.push(r);
      });
    return Object.values(map)
      .map((p) => ({
        ...p,
        totalPassagens: p.viagens
          .filter((v) => OCUPA_VAGA.includes(v.status))
          .reduce((s, v) => s + v.quantidade, 0),
        viagensCount: p.viagens.filter((v) => OCUPA_VAGA.includes(v.status)).length,
        cancelamentos: p.viagens.filter((v) => v.status === "cancelada").length,
        naoCompareceu: p.viagens.filter((v) => v.status === "nao_compareceu").length,
        totalGasto: p.viagens
          .filter((v) => OCUPA_VAGA.includes(v.status))
          .reduce((s, v) => s + (v.valorTotal || 0), 0),
        ultima: p.viagens
          .map((v) => v.data)
          .sort()
          .slice(-1)[0],
        ultimoTrajeto: [...p.viagens].sort((a, b) => a.data.localeCompare(b.data)).slice(-1)[0],
      }))
      .sort((a, b) => b.totalGasto - a.totalGasto);
  }, [reservas]);
  const filtrados = passageiros.filter(
    (p) =>
      (p.nome || "").toLowerCase().includes(busca.toLowerCase()) ||
      (p.telefone || "").includes(busca),
  );
  const salvarNota = (customerId, texto) => {
    setErro("");
    updateNotes(customerId, texto).catch((e) =>
      setErro(e?.message || "Não foi possível salvar a nota."),
    );
  };

  return (
    <div>
      <Header
        title="Passageiros · CRM"
        subtitle="Histórico, valor gerado e notas de atendimento por cliente."
      />
      <div className="px-6 md:px-10 pb-10">
        {erro && (
          <div
            className="mb-3 flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} /> {erro}
            </span>
            <button onClick={() => setErro("")}>
              <X size={13} />
            </button>
          </div>
        )}
        <TextInput
          placeholder="Buscar por nome ou telefone…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-sm mb-4"
        />
        <div className="space-y-2 stagger">
          {filtrados.length === 0 && (
            <Card>
              <div className="text-center py-4 text-xs" style={{ color: C.inkFaint }}>
                Nenhum passageiro ainda.
              </div>
            </Card>
          )}
          {filtrados.map((p, i) => {
            const abertoAqui = aberto === p.customer_id;
            return (
              <Card key={i} className="anim-fadeUp">
                <button
                  className="w-full flex items-center justify-between text-left"
                  onClick={() => setAberto(abertoAqui ? null : p.customer_id)}
                >
                  <div>
                    <div className="text-sm font-medium">
                      {p.nome}{" "}
                      <span className="font-normal text-xs" style={{ color: C.inkSoft }}>
                        · {p.telefone}
                      </span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>
                      {p.ultimoTrajeto ? trips[p.ultimoTrajeto.direcao]?.label : "—"} ·{" "}
                      {fmtBRL(p.totalGasto)} gerados
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.viagensCount >= 5 ? (
                      <Pill color={C.amber} bg={C.amberSoft}>
                        <Repeat size={11} />
                        Frequente
                      </Pill>
                    ) : p.viagensCount >= 2 ? (
                      <Pill>Recorrente</Pill>
                    ) : (
                      <Pill color={C.inkSoft} bg={C.panel2}>
                        Novo
                      </Pill>
                    )}
                    <ChevronRight
                      size={14}
                      style={{
                        color: C.inkFaint,
                        transform: abertoAqui ? "rotate(90deg)" : "none",
                        transition: "transform .15s",
                      }}
                    />
                  </div>
                </button>
                {abertoAqui && (
                  <div
                    className="anim-slideDown mt-3 pt-3 border-t grid sm:grid-cols-2 gap-3"
                    style={{ borderColor: C.borderSoft }}
                  >
                    <div className="text-xs space-y-1" style={{ color: C.inkSoft }}>
                      <div>
                        Passagens: <b style={{ color: C.ink }}>{p.totalPassagens}</b>
                      </div>
                      <div>
                        Cancelamentos: <b style={{ color: C.ink }}>{p.cancelamentos}</b>
                      </div>
                      <div>
                        Não compareceu: <b style={{ color: C.ink }}>{p.naoCompareceu}</b>
                      </div>
                      <div>
                        Última viagem:{" "}
                        <b style={{ color: C.ink }}>{p.ultima ? fmtDate(p.ultima) : "—"}</b>
                      </div>
                      <button
                        onClick={() =>
                          window.open(`https://wa.me/55${digitos(p.telefone)}`, "_blank")
                        }
                        className="btn-press mt-2 flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg"
                        style={{ background: C.greenSoft, color: C.green }}
                      >
                        <MessageCircle size={12} /> Abrir WhatsApp
                      </button>
                    </div>
                    <div>
                      <Field label="Notas do CRM">
                        <textarea
                          key={p.customer_id}
                          defaultValue={notaDe(p.customer_id)}
                          onBlur={(e) =>
                            e.target.value !== notaDe(p.customer_id) &&
                            salvarNota(p.customer_id, e.target.value)
                          }
                          rows={4}
                          className={inputCls}
                          style={inputStyle}
                          placeholder="Preferências, observações, combinados…"
                        />
                      </Field>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ============================= 5. FINANCEIRO (com lucro real) ============================= */
// Categorias fixas de despesa — combustível/manutenção também chegam
// sozinhas via trigger (Operação), mas continuam escolhíveis aqui pra
// cobrir um lançamento manual (ex.: abastecimento pago sem passar pela
// aba Operação).
const CATEGORIAS_DESPESA = [
  { id: "combustivel", label: "Combustível", icon: Fuel },
  { id: "alimentacao", label: "Alimentação", icon: UtensilsCrossed },
  { id: "motorista", label: "Motorista(s)", icon: Users },
  { id: "manutencao", label: "Manutenção", icon: Wrench },
  { id: "outro", label: "Outro", icon: Receipt },
];
// estorno/reembolso/ajuste são categorias de AJUSTE ligadas a uma reserva
// (ver database/18-receita-automatica-contas-a-receber.sql) — não aparecem
// nos botões rápidos de lançamento manual, só na tabela de lançamentos.
const ROTULOS_AJUSTE = { estorno: "Estorno", reembolso: "Reembolso", ajuste: "Ajuste" };

// --- Gestão Operacional: os 14 custos empresariais pedidos, agrupados
// para uma leitura de DRE. São categorias de `financial_entries`
// (type='despesa') distintas das do caixa do dia (combustível etc.) e da
// manutenção preventiva (que é 'manutencao', automática da aba Operação).
// Ver database/19-gestao-operacional.sql.
const GRUPOS_GESTAO = ["Pessoal", "Impostos & Taxas", "Veículo", "Estrutura"];
const CATEGORIAS_GESTAO = [
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
const CATEGORIA_GESTAO_IDS = new Set(CATEGORIAS_GESTAO.map((c) => c.id));
const rotuloCategoriaGestao = (id) => CATEGORIAS_GESTAO.find((c) => c.id === id)?.label || id;
const grupoDaCategoriaGestao = (id) =>
  CATEGORIAS_GESTAO.find((c) => c.id === id)?.grupo || "Estrutura";
const MESES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const rotuloCategoriaDespesa = (id) =>
  CATEGORIAS_DESPESA.find((c) => c.id === id)?.label ||
  ROTULOS_AJUSTE[id] ||
  CATEGORIAS_GESTAO.find((c) => c.id === id)?.label ||
  "Outro";

// Mapeia a linha do banco (financial_entries) para o formato que a tela usa.
function mapEntry(e) {
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
function somaTipo(lista, tipo) {
  return lista.filter((f) => f.tipo === tipo).reduce((s, f) => s + f.valor, 0);
}

function FinanceiroTab({ pix, deepLink }) {
  const [subview, setSubview] = useState("lancamentos");
  useDeepLinkSubview(deepLink, setSubview);
  const [mesRef, setMesRef] = useState(new Date());
  const [diaSel, setDiaSel] = useState(todayStr());
  const [novo, setNovo] = useState({
    tipo: "receita",
    categoria: "combustivel",
    valor: "",
    descricao: "",
  });
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const ano = mesRef.getFullYear();
  const mes = mesRef.getMonth();

  const fin = useFinanceMonth(ano, mes + 1);
  const financeiro = useMemo(() => (fin.entries || []).map(mapEntry), [fin.entries]);

  const run = async (fn) => {
    setErro("");
    setSalvando(true);
    try {
      await fn();
    } catch (e) {
      setErro(e?.message || "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };
  const add = () => {
    if (!novo.valor) return;
    run(async () => {
      await fin.addEntry({
        entryDate: diaSel,
        type: novo.tipo,
        category: novo.tipo === "despesa" ? novo.categoria : undefined,
        amount: Number.parseFloat(novo.valor),
        description: novo.descricao || null,
      });
      setNovo({ tipo: "receita", categoria: "combustivel", valor: "", descricao: "" });
    });
  };
  const remove = (id) => run(() => fin.removeEntry(id));
  const iniciarEdicao = (f) => {
    setEditId(f.id);
    setEditVal({ ...f });
  };
  const salvarEdicao = () =>
    run(async () => {
      const campos = {
        type: editVal.tipo,
        amount: Number.parseFloat(editVal.valor),
        description: editVal.descricao || null,
      };
      // categoria só faz sentido pra despesa; receita mantém o que já tinha
      if (editVal.tipo === "despesa") campos.category = editVal.categoria || "outro";
      await fin.updateEntry(editId, campos);
      setEditId(null);
    });
  const primeiroDia = new Date(ano, mes, 1);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const offset = primeiroDia.getDay();
  const cells = [
    ...Array(offset).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];
  const lucroPorDia = useCallback(
    (diaNum) => {
      const ds = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(diaNum).padStart(2, "0")}`;
      const receitas = financeiro
        .filter((f) => f.data === ds && f.tipo === "receita")
        .reduce((s, f) => s + f.valor, 0);
      const despesas = financeiro
        .filter((f) => f.data === ds && f.tipo === "despesa")
        .reduce((s, f) => s + f.valor, 0);
      return { ds, lucro: receitas - despesas, temMovimento: receitas > 0 || despesas > 0 };
    },
    [financeiro, ano, mes],
  );
  const doDia = financeiro.filter((f) => f.data === diaSel);
  const receitaDia = doDia.filter((f) => f.tipo === "receita").reduce((s, f) => s + f.valor, 0);
  const despesaDia = doDia.filter((f) => f.tipo === "despesa").reduce((s, f) => s + f.valor, 0);
  // combustível e manutenção já entram como 'despesa' via trigger do banco —
  // então despesaDia já é o total real; "lucro real" = receita − despesa.
  const despesaAutoDia = doDia
    .filter((f) => f.tipo === "despesa" && f.auto)
    .reduce((s, f) => s + f.valor, 0);
  const lucroReal = receitaDia - despesaDia;
  return (
    <div>
      <Header
        title="Financeiro"
        subtitle="Faturamento, despesas e lucro real do dia — combustível e manutenção entram automaticamente."
        right={
          fin.loading ? (
            <span className="text-xs" style={{ color: C.inkFaint }}>
              carregando…
            </span>
          ) : null
        }
      />
      {(erro || fin.error) && (
        <div
          className="mx-6 md:mx-10 mb-3 flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} />{" "}
            {erro || "Erro ao carregar lançamentos (só admin/financeiro têm acesso)."}
          </span>
          {erro && (
            <button onClick={() => setErro("")}>
              <X size={13} />
            </button>
          )}
        </div>
      )}
      <div className="px-6 md:px-10 mb-4 flex gap-1 rounded-lg p-1 w-fit" style={{ background: C.panel2 }}>
        {[
          { id: "lancamentos", label: "Lançamentos", Icon: Wallet },
          { id: "contas_receber", label: "Contas a receber", Icon: MessageCircle },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubview(id)}
            className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
            style={{
              background: subview === id ? C.amberSoft : "transparent",
              color: subview === id ? C.amber : C.inkSoft,
              fontWeight: subview === id ? 600 : 500,
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
      {subview === "contas_receber" && <ContasReceberView pix={pix} />}
      {subview === "lancamentos" && (
      <div className="px-6 md:px-10 pb-10 grid lg:grid-cols-[340px_1fr] gap-6">
        <Card className="anim-fadeUp">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setMesRef(new Date(ano, mes - 1, 1))}
              className="btn-press p-1 rounded"
              style={{ color: C.inkSoft }}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-sm font-semibold capitalize">
              {mesRef.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </div>
            <button
              onClick={() => setMesRef(new Date(ano, mes + 1, 1))}
              className="btn-press p-1 rounded"
              style={{ color: C.inkSoft }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div
            className="grid grid-cols-7 gap-1 text-center text-[10px] mb-1"
            style={{ color: C.inkFaint }}
          >
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const { ds, lucro, temMovimento } = lucroPorDia(d);
              const sel = ds === diaSel;
              return (
                <button
                  key={i}
                  onClick={() => setDiaSel(ds)}
                  className="btn-press aspect-square rounded-lg flex flex-col items-center justify-center text-xs"
                  style={{
                    background: sel ? C.amber : C.panel2,
                    color: sel ? C.onBrand : C.ink,
                    border:
                      ds === todayStr() && !sel ? `1px solid ${C.amber}` : "1px solid transparent",
                  }}
                >
                  {d}
                  {temMovimento && (
                    <span
                      className="w-1 h-1 rounded-full mt-0.5"
                      style={{ background: sel ? C.onBrand : lucro >= 0 ? C.green : C.red }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </Card>
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={`Faturamento ${fmtDate(diaSel)}`}
              value={fmtBRL(receitaDia)}
              icon={Wallet}
              accent={C.green}
            />
            <StatCard
              label="Despesas (total)"
              value={fmtBRL(despesaDia)}
              icon={TrendingUp}
              accent={C.red}
            />
            <StatCard
              label="Combustível + manut."
              value={fmtBRL(despesaAutoDia)}
              icon={Fuel}
              accent={C.amber}
            />
            <StatCard
              label="Lucro do dia"
              value={fmtBRL(lucroReal)}
              icon={Route}
              accent={lucroReal >= 0 ? C.blue : C.red}
            />
          </div>
          <Card>
            <div className="text-sm font-semibold mb-3">Lançar em {fmtDate(diaSel)}</div>
            <div className="text-xs mb-1.5" style={{ color: C.inkFaint }}>
              Despesa rápida — escolhe a categoria e só falta o valor
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {CATEGORIAS_DESPESA.map((c) => {
                const Icon = c.icon;
                const ativo = novo.tipo === "despesa" && novo.categoria === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setNovo((n) => ({ ...n, tipo: "despesa", categoria: c.id }));
                      document.getElementById("financeiro-valor-input")?.focus();
                    }}
                    className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full"
                    style={{
                      background: ativo ? C.amberSoft : C.panel2,
                      color: ativo ? C.amber : C.inkSoft,
                      fontWeight: ativo ? 600 : 500,
                      border: `1px solid ${ativo ? C.amber : C.border}`,
                    }}
                  >
                    <Icon size={13} />
                    {c.label}
                  </button>
                );
              })}
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              <Select
                value={novo.tipo}
                onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}
              >
                <option value="receita">Receita</option>
                <option value="despesa">Despesa</option>
              </Select>
              {novo.tipo === "despesa" && (
                <Select
                  value={novo.categoria}
                  onChange={(e) => setNovo({ ...novo, categoria: e.target.value })}
                >
                  {CATEGORIAS_DESPESA.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
              <TextInput
                id="financeiro-valor-input"
                placeholder="Valor"
                type="number"
                className={novo.tipo === "despesa" ? "" : "sm:col-span-2"}
                value={novo.valor}
                onChange={(e) => setNovo({ ...novo, valor: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <div className="mt-2">
              <TextInput
                placeholder="Descrição"
                className="w-full"
                value={novo.descricao}
                onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <button
              onClick={add}
              disabled={salvando || !novo.valor}
              className="btn-press mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: salvando || !novo.valor ? C.border : C.amber,
                color: salvando || !novo.valor ? C.inkFaint : C.onBrand,
              }}
            >
              <Plus size={14} /> {salvando ? "Salvando…" : "Lançar"}
            </button>
          </Card>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: C.panel2, color: C.inkSoft }}>
                  <th className="text-left px-4 py-2.5 font-medium">Tipo</th>
                  <th className="text-left px-4 py-2.5 font-medium">Categoria</th>
                  <th className="text-left px-4 py-2.5 font-medium">Valor</th>
                  <th className="text-left px-4 py-2.5 font-medium">Descrição</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...doDia].reverse().map((f) =>
                  editId === f.id ? (
                    <tr
                      key={f.id}
                      className="border-t anim-slideDown"
                      style={{ borderColor: C.borderSoft, background: C.panel2 }}
                    >
                      <td className="px-2 py-2">
                        <Select
                          value={editVal.tipo}
                          onChange={(e) => setEditVal({ ...editVal, tipo: e.target.value })}
                          className="text-xs py-1"
                        >
                          <option value="receita">Receita</option>
                          <option value="despesa">Despesa</option>
                        </Select>
                      </td>
                      <td className="px-2 py-2">
                        {editVal.tipo === "despesa" ? (
                          <Select
                            value={editVal.categoria || "outro"}
                            onChange={(e) => setEditVal({ ...editVal, categoria: e.target.value })}
                            className="text-xs py-1"
                          >
                            {CATEGORIAS_DESPESA.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-xs" style={{ color: C.inkFaint }}>
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <TextInput
                          type="number"
                          value={editVal.valor}
                          onChange={(e) => setEditVal({ ...editVal, valor: e.target.value })}
                          className="text-xs py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <TextInput
                          value={editVal.descricao}
                          onChange={(e) => setEditVal({ ...editVal, descricao: e.target.value })}
                          className="text-xs py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button onClick={salvarEdicao}>
                          <Save size={13} style={{ color: C.green }} />
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={f.id}
                      className="row-hover border-t"
                      style={{ borderColor: C.borderSoft }}
                    >
                      <td className="px-4 py-2">
                        <Pill
                          color={f.tipo === "receita" ? C.green : C.red}
                          bg={f.tipo === "receita" ? C.greenSoft : C.redSoft}
                        >
                          {f.tipo}
                        </Pill>
                      </td>
                      <td className="px-4 py-2 text-xs" style={{ color: C.inkSoft }}>
                        {f.tipo === "despesa" ? rotuloCategoriaDespesa(f.categoria) : "—"}
                      </td>
                      <td
                        className="px-4 py-2"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {fmtBRL(f.valor)}
                      </td>
                      <td className="px-4 py-2" style={{ color: C.inkSoft }}>
                        {f.descricao}
                        {f.auto ? (
                          <span className="ml-1.5 text-[10px]" style={{ color: C.inkFaint }}>
                            · automático
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {f.auto ? (
                          <span className="text-[10px]" style={{ color: C.inkFaint }}>
                            da operação
                          </span>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => iniciarEdicao(f)}>
                              <Pencil size={12} style={{ color: C.inkFaint }} />
                            </button>
                            <button onClick={() => remove(f.id)}>
                              <X size={13} style={{ color: C.inkFaint }} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ),
                )}
                {doDia.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center py-8 text-xs"
                      style={{ color: C.inkFaint }}
                    >
                      Nenhum lançamento neste dia.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}

/* --- Contas a receber: passageiros com reserva confirmada e pagamento
   ainda pendente — ver database/18-receita-automatica-contas-a-receber.sql.
   A receita nasce sozinha (trigger); esta tela é só cobrança do que falta
   receber, com botão de cobrança direta pelo WhatsApp. --- */
function ContasReceberView({ pix }) {
  const { contas, loading, error, registrarAjuste, registrando } = useContasReceber();
  const pixKey = pix?.key || PIX_KEY;
  const [ajusteAberto, setAjusteAberto] = useState(null); // reservation_id em edição
  const [ajusteVal, setAjusteVal] = useState({ categoria: "estorno", valor: "", descricao: "" });
  const [erroAjuste, setErroAjuste] = useState("");

  const vencida = (venc) => !!venc && venc < todayStr();

  const abrirCobranca = (c) => {
    const venc = c.vencimento ? fmtDate(c.vencimento) : "sem data definida";
    const msg =
      `Olá, ${c.nome}! Tudo bem? Aqui é da Rota Pirapemas. ` +
      `Notamos que sua passagem de ${venc} no valor de ${fmtBRL(c.valor_devido)} ainda está pendente de pagamento. ` +
      `Você pode pagar via Pix na chave ${pixKey}. Qualquer dúvida, estamos à disposição!`;
    window.open(`https://wa.me/55${digitos(c.telefone)}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const iniciarAjuste = (reservationId) => {
    setErroAjuste("");
    setAjusteAberto(reservationId);
    setAjusteVal({ categoria: "estorno", valor: "", descricao: "" });
  };
  const salvarAjuste = async () => {
    if (!ajusteVal.valor) return;
    setErroAjuste("");
    try {
      await registrarAjuste(ajusteAberto, {
        category: ajusteVal.categoria,
        amount: Number.parseFloat(ajusteVal.valor),
        description: ajusteVal.descricao || null,
      });
      setAjusteAberto(null);
    } catch (e) {
      setErroAjuste(e?.message || "Não foi possível registrar o ajuste.");
    }
  };

  return (
    <div className="px-6 md:px-10 pb-10">
      {error && (
        <div
          className="mb-3 flex items-center gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <AlertTriangle size={14} /> {error?.message || "Erro ao carregar contas a receber."}
        </div>
      )}
      <Card className="anim-fadeUp">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Passageiros com pagamento pendente</div>
          {loading && (
            <span className="text-xs" style={{ color: C.inkFaint }}>
              carregando…
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
                <th className="px-4 py-2 font-medium">Passageiro</th>
                <th className="px-4 py-2 font-medium">Valor devido</th>
                <th className="px-4 py-2 font-medium">Vencimento</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <React.Fragment key={c.reservation_id}>
                  <tr className="row-hover border-t" style={{ borderColor: C.borderSoft }}>
                    <td className="px-4 py-2">
                      <div>{c.nome}</div>
                      <div className="text-xs" style={{ color: C.inkFaint }}>
                        {c.telefone}
                      </div>
                    </td>
                    <td className="px-4 py-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtBRL(c.valor_devido)}
                    </td>
                    <td className="px-4 py-2" style={{ color: C.inkSoft }}>
                      {c.vencimento ? fmtDate(c.vencimento) : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Pill
                        color={vencida(c.vencimento) ? C.red : C.amber}
                        bg={vencida(c.vencimento) ? C.redSoft : C.amberSoft}
                      >
                        {vencida(c.vencimento) ? "Vencido" : "No prazo"}
                      </Pill>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirCobranca(c)}
                          className="btn-press flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                          style={{ background: C.greenSoft, color: C.green, fontWeight: 600 }}
                        >
                          <MessageCircle size={12} /> Cobrar no WhatsApp
                        </button>
                        <button
                          onClick={() => iniciarAjuste(c.reservation_id)}
                          className="btn-press text-xs px-2 py-1 rounded-md"
                          style={{ background: C.panel2, color: C.inkSoft }}
                        >
                          Estorno/ajuste
                        </button>
                      </div>
                    </td>
                  </tr>
                  {ajusteAberto === c.reservation_id && (
                    <tr className="border-t" style={{ borderColor: C.borderSoft, background: C.panel2 }}>
                      <td colSpan={5} className="px-4 py-3">
                        {erroAjuste && (
                          <div className="mb-2 text-xs" style={{ color: C.red }}>
                            {erroAjuste}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={ajusteVal.categoria}
                            onChange={(e) => setAjusteVal({ ...ajusteVal, categoria: e.target.value })}
                          >
                            <option value="estorno">Estorno</option>
                            <option value="reembolso">Reembolso</option>
                            <option value="ajuste">Ajuste</option>
                          </Select>
                          <TextInput
                            type="number"
                            placeholder="Valor"
                            value={ajusteVal.valor}
                            onChange={(e) => setAjusteVal({ ...ajusteVal, valor: e.target.value })}
                            className="w-28"
                          />
                          <TextInput
                            placeholder="Descrição (opcional)"
                            value={ajusteVal.descricao}
                            onChange={(e) => setAjusteVal({ ...ajusteVal, descricao: e.target.value })}
                            className="flex-1 min-w-[160px]"
                          />
                          <button
                            onClick={salvarAjuste}
                            disabled={registrando || !ajusteVal.valor}
                            className="btn-press text-xs px-3 py-1.5 rounded-md"
                            style={{ background: C.amberSoft, color: C.amber, fontWeight: 600 }}
                          >
                            Registrar
                          </button>
                          <button
                            onClick={() => setAjusteAberto(null)}
                            className="btn-press text-xs px-2 py-1.5 rounded-md"
                            style={{ color: C.inkFaint }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {contas.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-xs" style={{ color: C.inkFaint }}>
                    Nenhuma conta pendente — tudo em dia.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ===================== 5c. GESTÃO OPERACIONAL ============================= */
// Visão empresarial: DRE do mês com TODOS os custos (caixa + recorrentes)
// e o resultado líquido. Custos fixos/recorrentes são lançados sozinhos
// pelo banco (fn_generate_recurring_expenses / cron) e continuam 100%
// editáveis. Ver database/19-gestao-operacional.sql.

function quandoLanca(t) {
  if (t.frequency === "anual")
    return `todo dia ${t.due_day} de ${MESES_PT[(t.due_month || 1) - 1]}`;
  return `todo dia ${t.due_day}`;
}

function LinhaDRE({ label, valor, negativo = false, forte = false, indent = false }) {
  return (
    <div
      className="flex items-center justify-between py-1.5"
      style={{ borderTop: forte ? `1px solid ${C.border}` : "none", marginTop: forte ? 4 : 0 }}
    >
      <span
        className={indent ? "pl-3" : ""}
        style={{
          color: forte ? C.ink : C.inkSoft,
          fontWeight: forte ? 600 : 400,
          fontSize: forte ? "0.9rem" : "0.83rem",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: forte ? 700 : 500,
          color: forte ? (valor >= 0 ? C.green : C.red) : negativo && valor > 0 ? C.red : C.ink,
        }}
      >
        {negativo && valor > 0 ? "− " : ""}
        {fmtBRL(valor)}
      </span>
    </div>
  );
}

function GestaoTab({ deepLink }) {
  const [mesRef, setMesRef] = useState(new Date());
  const ano = mesRef.getFullYear();
  const mes = mesRef.getMonth();
  const fin = useFinanceMonth(ano, mes + 1);
  const rec = useRecurringExpenses();

  const [aba, setAba] = useState("resultado");
  useDeepLinkSubview(deepLink, setAba);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const entries = useMemo(() => (fin.entries || []).map(mapEntry), [fin.entries]);
  const receita = useMemo(() => somaTipo(entries, "receita"), [entries]);
  const despesaTotal = useMemo(() => somaTipo(entries, "despesa"), [entries]);
  const resultado = receita - despesaTotal;
  const margem = receita > 0 ? (resultado / receita) * 100 : 0;

  const porCategoria = useMemo(() => {
    const m = {};
    for (const e of entries) {
      if (e.tipo !== "despesa") continue;
      const k = e.categoria || "outro";
      m[k] = (m[k] || 0) + e.valor;
    }
    return m;
  }, [entries]);

  const totalPorGrupo = useMemo(() => {
    const g = Object.fromEntries(GRUPOS_GESTAO.map((x) => [x, 0]));
    for (const c of CATEGORIAS_GESTAO) g[c.grupo] += porCategoria[c.id] || 0;
    return g;
  }, [porCategoria]);
  const totalGestao = GRUPOS_GESTAO.reduce((s, g) => s + totalPorGrupo[g], 0);
  const custoOperacao = despesaTotal - totalGestao;

  const run = async (fn, msgErro) => {
    setErro("");
    setAviso("");
    try {
      return await fn();
    } catch (e) {
      setErro(e?.message || msgErro || "Não foi possível concluir.");
    }
  };

  const gerarAgora = () =>
    run(async () => {
      const r = await rec.gerarAgora();
      setAviso(
        r?.gerados > 0
          ? `${r.gerados} lançamento(s) gerado(s).`
          : "Tudo em dia — nenhum lançamento novo para gerar.",
      );
    }, "Não foi possível gerar os lançamentos.");

  return (
    <div>
      <Header
        title="Gestão Operacional"
        subtitle="Resultado líquido do mês com todos os custos da empresa — recorrentes lançados sozinhos, tudo editável."
        right={
          fin.loading || rec.loading ? (
            <span className="text-xs" style={{ color: C.inkFaint }}>
              carregando…
            </span>
          ) : null
        }
      />

      {(erro || fin.error || rec.error) && (
        <div
          className="mx-6 md:mx-10 mb-3 flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} />{" "}
            {erro || "Erro ao carregar dados (só admin/financeiro têm acesso)."}
          </span>
          {erro && (
            <button type="button" onClick={() => setErro("")}>
              <X size={13} />
            </button>
          )}
        </div>
      )}
      {aviso && (
        <div
          className="mx-6 md:mx-10 mb-3 flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.greenSoft, color: C.green }}
        >
          <span className="flex items-center gap-2">
            <Check size={14} /> {aviso}
          </span>
          <button type="button" onClick={() => setAviso("")}>
            <X size={13} />
          </button>
        </div>
      )}

      <div className="px-6 md:px-10 flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMesRef(new Date(ano, mes - 1, 1))}
            className="btn-press p-1 rounded"
            style={{ color: C.inkSoft }}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="text-sm font-semibold capitalize min-w-[150px] text-center">
            {MESES_PT[mes]} de {ano}
          </div>
          <button
            type="button"
            onClick={() => setMesRef(new Date(ano, mes + 1, 1))}
            className="btn-press p-1 rounded"
            style={{ color: C.inkSoft }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: C.panel2 }}>
          {[
            { id: "resultado", label: "Resultado", Icon: TrendingUp },
            { id: "recorrentes", label: "Custos recorrentes", Icon: RefreshCw },
            { id: "lancamentos", label: "Lançamentos do mês", Icon: Receipt },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
              style={{
                background: aba === id ? C.amberSoft : "transparent",
                color: aba === id ? C.amber : C.inkSoft,
                fontWeight: aba === id ? 600 : 500,
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 md:px-10 pb-10 space-y-6">
        {aba === "resultado" && (
          <GestaoResultado
            receita={receita}
            despesaTotal={despesaTotal}
            resultado={resultado}
            margem={margem}
            custoOperacao={custoOperacao}
            totalPorGrupo={totalPorGrupo}
            porCategoria={porCategoria}
          />
        )}
        {aba === "recorrentes" && <GestaoRecorrentes rec={rec} run={run} onGerar={gerarAgora} />}
        {aba === "lancamentos" && (
          <GestaoLancamentos entries={entries} fin={fin} ano={ano} mes={mes} run={run} />
        )}
      </div>
    </div>
  );
}

function GestaoResultado({
  receita,
  despesaTotal,
  resultado,
  margem,
  custoOperacao,
  totalPorGrupo,
  porCategoria,
}) {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Receita do mês" value={fmtBRL(receita)} icon={Wallet} accent={C.green} />
        <StatCard
          label="Despesas do mês"
          value={fmtBRL(despesaTotal)}
          icon={TrendingUp}
          accent={C.red}
        />
        <StatCard
          label="Resultado líquido"
          value={fmtBRL(resultado)}
          icon={Landmark}
          accent={resultado >= 0 ? C.blue : C.red}
        />
        <StatCard
          label="Margem líquida"
          value={`${margem.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
          icon={TrendingUp}
          accent={resultado >= 0 ? C.blue : C.red}
        />
      </div>

      <Card>
        <div className="text-sm font-semibold mb-1">Demonstrativo do mês</div>
        <div className="text-xs mb-2" style={{ color: C.inkFaint }}>
          Tudo que entrou menos tudo que saiu — inclui combustível, manutenção e os custos recorrentes da
          empresa.
        </div>
        <LinhaDRE label="Receita bruta" valor={receita} forte />
        <LinhaDRE
          label="Custos de operação (combustível, manutenção, diárias…)"
          valor={custoOperacao}
          negativo
          indent
        />
        {GRUPOS_GESTAO.map((g) => (
          <LinhaDRE key={g} label={g} valor={totalPorGrupo[g]} negativo indent />
        ))}
        <LinhaDRE label="Resultado líquido" valor={resultado} forte />
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-3">Custos empresariais por categoria</div>
        <div className="space-y-4">
          {GRUPOS_GESTAO.map((g) => {
            const cats = CATEGORIAS_GESTAO.filter((c) => c.grupo === g);
            return (
              <div key={g}>
                <div
                  className="flex items-center justify-between text-xs font-semibold mb-1"
                  style={{ color: C.inkSoft }}
                >
                  <span>{g}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtBRL(totalPorGrupo[g])}
                  </span>
                </div>
                <div className="space-y-1">
                  {cats.map((c) => {
                    const v = porCategoria[c.id] || 0;
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between text-xs"
                        style={{ color: v > 0 ? C.ink : C.inkFaint }}
                      >
                        <span>{c.label}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtBRL(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function GestaoRecorrentes({ rec, run, onGerar }) {
  const [form, setForm] = useState({
    category: "salario",
    label: "",
    amount: "",
    frequency: "mensal",
    dueDay: "5",
    dueMonth: "1",
  });
  const [depBem, setDepBem] = useState("");
  const [depMeses, setDepMeses] = useState("60");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});

  const add = () =>
    run(async () => {
      if (!form.label.trim() || !form.amount) return;
      await rec.addTemplate({
        category: form.category,
        label: form.label.trim(),
        amount: Number.parseFloat(form.amount),
        frequency: form.frequency,
        dueDay: Number.parseInt(form.dueDay, 10) || 1,
        dueMonth: form.frequency === "anual" ? Number.parseInt(form.dueMonth, 10) || 1 : null,
      });
      setForm({
        category: "salario",
        label: "",
        amount: "",
        frequency: "mensal",
        dueDay: "5",
        dueMonth: "1",
      });
    }, "Não foi possível adicionar o custo recorrente.");

  const salvarEdicao = () =>
    run(async () => {
      await rec.updateTemplate(editId, {
        label: editVal.label?.trim() || "Custo",
        amount: Number.parseFloat(editVal.amount) || 0,
        frequency: editVal.frequency,
        due_day: Number.parseInt(editVal.due_day, 10) || 1,
        due_month:
          editVal.frequency === "anual" ? Number.parseInt(editVal.due_month, 10) || 1 : null,
      });
      setEditId(null);
    }, "Não foi possível salvar.");

  const toggleAtivo = (t) =>
    run(() => rec.updateTemplate(t.id, { active: !t.active }), "Não foi possível alterar.");
  const excluir = (t) => run(() => rec.removeTemplate(t.id), "Não foi possível excluir.");

  const aplicarDepreciacao = () => {
    const bem = Number.parseFloat(depBem);
    const meses = Number.parseInt(depMeses, 10);
    if (bem > 0 && meses > 0)
      setForm((f) => ({
        ...f,
        category: "depreciacao",
        frequency: "mensal",
        amount: (bem / meses).toFixed(2),
        label: f.label || "Depreciação do veículo",
      }));
  };

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-sm font-semibold">Como funciona a automação</div>
          <button
            type="button"
            onClick={onGerar}
            disabled={rec.gerando}
            className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
            style={{ background: C.blueSoft, color: C.blue, fontWeight: 600 }}
          >
            <RefreshCw size={13} /> {rec.gerando ? "Gerando…" : "Gerar lançamentos agora"}
          </button>
        </div>
        <p className="text-xs" style={{ color: C.inkSoft }}>
          Cada custo abaixo é lançado sozinho na competência (todo mês ou todo ano, no dia
          configurado). O lançamento gerado aparece em <b>Financeiro</b> e na aba{" "}
          <b>Lançamentos do mês</b> — e é 100% editável: dá pra mudar o valor, a data ou apagar sem
          mexer no modelo.
        </p>
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-3">Novo custo recorrente</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Categoria
            </label>
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {GRUPOS_GESTAO.map((g) => (
                <optgroup key={g} label={g}>
                  {CATEGORIAS_GESTAO.filter((c) => c.grupo === g).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Descrição
            </label>
            <TextInput
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Ex.: Salário motorista João"
            />
          </div>
          <div>
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Valor (R$)
            </label>
            <TextInput
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Frequência
            </label>
            <Select
              value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </Select>
          </div>
          <div>
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Dia do mês (1–28)
            </label>
            <TextInput
              type="number"
              min="1"
              max="28"
              value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
            />
          </div>
          {form.frequency === "anual" && (
            <div>
              <label className="text-xs" style={{ color: C.inkFaint }}>
                Mês
              </label>
              <Select
                value={form.dueMonth}
                onChange={(e) => setForm({ ...form, dueMonth: e.target.value })}
              >
                {MESES_PT.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex items-end">
            <button
              type="button"
              onClick={add}
              disabled={rec.salvando || !form.label.trim() || !form.amount}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md w-full justify-center"
              style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
            >
              <Plus size={13} /> Adicionar
            </button>
          </div>
        </div>
        {form.category === "depreciacao" && (
          <div
            className="mt-3 flex flex-wrap items-end gap-2 rounded-lg p-3"
            style={{ background: C.panel2 }}
          >
            <Calculator size={14} style={{ color: C.inkFaint, marginBottom: 8 }} />
            <span className="text-xs pb-2" style={{ color: C.inkSoft }}>
              Calcular:
            </span>
            <div>
              <label className="text-[10px] block" style={{ color: C.inkFaint }}>
                Valor do bem
              </label>
              <TextInput
                type="number"
                value={depBem}
                onChange={(e) => setDepBem(e.target.value)}
                placeholder="200000"
                className="w-32"
              />
            </div>
            <span className="text-xs pb-2" style={{ color: C.inkFaint }}>
              ÷
            </span>
            <div>
              <label className="text-[10px] block" style={{ color: C.inkFaint }}>
                Meses de vida útil
              </label>
              <TextInput
                type="number"
                value={depMeses}
                onChange={(e) => setDepMeses(e.target.value)}
                className="w-24"
              />
            </div>
            <button
              type="button"
              onClick={aplicarDepreciacao}
              className="btn-press text-xs px-3 py-2 rounded-md"
              style={{ background: C.blueSoft, color: C.blue }}
            >
              Usar no valor
            </button>
          </div>
        )}
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-3">Custos recorrentes cadastrados</div>
        {rec.templates.length === 0 ? (
          <div className="text-center py-8 text-xs" style={{ color: C.inkFaint }}>
            Nenhum custo recorrente ainda. Cadastre acima para o sistema começar a lançar sozinho.
          </div>
        ) : (
          <div className="space-y-4">
            {GRUPOS_GESTAO.map((g) => {
              const ts = rec.templates.filter((t) => grupoDaCategoriaGestao(t.category) === g);
              if (ts.length === 0) return null;
              return (
                <div key={g}>
                  <div className="text-xs font-semibold mb-1.5" style={{ color: C.inkSoft }}>
                    {g}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
                          <th className="px-3 py-1.5 font-medium">Categoria</th>
                          <th className="px-3 py-1.5 font-medium">Descrição</th>
                          <th className="px-3 py-1.5 font-medium">Valor</th>
                          <th className="px-3 py-1.5 font-medium">Quando</th>
                          <th className="px-3 py-1.5 font-medium">Status</th>
                          <th className="px-3 py-1.5 font-medium" aria-label="ações" />
                        </tr>
                      </thead>
                      <tbody>
                        {ts.map((t) =>
                          editId === t.id ? (
                            <tr key={t.id} style={{ background: C.panel2 }}>
                              <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                                {rotuloCategoriaGestao(t.category)}
                              </td>
                              <td className="px-3 py-2">
                                <TextInput
                                  value={editVal.label}
                                  onChange={(e) => setEditVal({ ...editVal, label: e.target.value })}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <TextInput
                                  type="number"
                                  value={editVal.amount}
                                  onChange={(e) => setEditVal({ ...editVal, amount: e.target.value })}
                                  className="w-24"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1">
                                  <Select
                                    value={editVal.frequency}
                                    onChange={(e) =>
                                      setEditVal({ ...editVal, frequency: e.target.value })
                                    }
                                    className="w-24"
                                  >
                                    <option value="mensal">Mensal</option>
                                    <option value="anual">Anual</option>
                                  </Select>
                                  <TextInput
                                    type="number"
                                    min="1"
                                    max="28"
                                    value={editVal.due_day}
                                    onChange={(e) =>
                                      setEditVal({ ...editVal, due_day: e.target.value })
                                    }
                                    className="w-14"
                                  />
                                  {editVal.frequency === "anual" && (
                                    <Select
                                      value={editVal.due_month}
                                      onChange={(e) =>
                                        setEditVal({ ...editVal, due_month: e.target.value })
                                      }
                                      className="w-28"
                                    >
                                      {MESES_PT.map((m, i) => (
                                        <option key={m} value={i + 1}>
                                          {m}
                                        </option>
                                      ))}
                                    </Select>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2">
                                <div className="flex gap-2">
                                  <button type="button" onClick={salvarEdicao}>
                                    <Save size={13} style={{ color: C.green }} />
                                  </button>
                                  <button type="button" onClick={() => setEditId(null)}>
                                    <X size={13} style={{ color: C.inkFaint }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr
                              key={t.id}
                              className="row-hover border-t"
                              style={{ borderColor: C.borderSoft, opacity: t.active ? 1 : 0.55 }}
                            >
                              <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                                {rotuloCategoriaGestao(t.category)}
                              </td>
                              <td className="px-3 py-2">{t.label}</td>
                              <td
                                className="px-3 py-2"
                                style={{ fontFamily: "'JetBrains Mono', monospace" }}
                              >
                                {fmtBRL(Number(t.amount))}
                              </td>
                              <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                                {quandoLanca(t)}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => toggleAtivo(t)}
                                  className="btn-press"
                                >
                                  <Pill
                                    color={t.active ? C.green : C.inkFaint}
                                    bg={t.active ? C.greenSoft : C.graySoft}
                                  >
                                    {t.active ? "Ativo" : "Pausado"}
                                  </Pill>
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditId(t.id);
                                      setEditVal({
                                        label: t.label,
                                        amount: String(t.amount),
                                        frequency: t.frequency,
                                        due_day: String(t.due_day),
                                        due_month: String(t.due_month || 1),
                                      });
                                    }}
                                  >
                                    <Pencil size={12} style={{ color: C.inkFaint }} />
                                  </button>
                                  <button type="button" onClick={() => excluir(t)}>
                                    <X size={13} style={{ color: C.inkFaint }} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

function GestaoLancamentos({ entries, fin, ano, mes, run }) {
  const [novo, setNovo] = useState({
    category: "manutencao_corretiva",
    dia: "",
    valor: "",
    descricao: "",
  });
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});

  const doMes = entries.filter(
    (e) => e.tipo === "despesa" && CATEGORIA_GESTAO_IDS.has(e.categoria),
  );
  const totalMes = doMes.reduce((s, e) => s + e.valor, 0);
  const ordenados = [...doMes].sort((a, b) => a.data.localeCompare(b.data));

  const hoje = new Date();
  const diaPadrao =
    hoje.getFullYear() === ano && hoje.getMonth() === mes ? String(hoje.getDate()) : "1";
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const dataDoDia = (d) => {
    const n = Math.min(Math.max(Number.parseInt(d || diaPadrao, 10) || 1, 1), ultimoDia);
    return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
  };

  const add = () =>
    run(async () => {
      if (!novo.valor) return;
      await fin.addEntry({
        entryDate: dataDoDia(novo.dia),
        type: "despesa",
        category: novo.category,
        amount: Number.parseFloat(novo.valor),
        description: novo.descricao || null,
      });
      setNovo({ category: novo.category, dia: "", valor: "", descricao: "" });
    }, "Não foi possível lançar.");

  const salvar = () =>
    run(async () => {
      await fin.updateEntry(editId, {
        category: editVal.categoria,
        amount: Number.parseFloat(editVal.valor) || 0,
        description: editVal.descricao || null,
      });
      setEditId(null);
    }, "Não foi possível salvar.");
  const remover = (id) => run(() => fin.removeEntry(id), "Não foi possível remover.");

  return (
    <>
      <Card>
        <div className="text-sm font-semibold mb-3">Lançar custo do mês</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <Select
            value={novo.category}
            onChange={(e) => setNovo({ ...novo, category: e.target.value })}
          >
            {GRUPOS_GESTAO.map((g) => (
              <optgroup key={g} label={g}>
                {CATEGORIAS_GESTAO.filter((c) => c.grupo === g).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <TextInput
            type="number"
            min="1"
            max="31"
            placeholder={`Dia (${diaPadrao})`}
            value={novo.dia}
            onChange={(e) => setNovo({ ...novo, dia: e.target.value })}
          />
          <TextInput
            type="number"
            placeholder="Valor"
            value={novo.valor}
            onChange={(e) => setNovo({ ...novo, valor: e.target.value })}
          />
          <TextInput
            placeholder="Descrição (opcional)"
            value={novo.descricao}
            onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
          />
          <button
            type="button"
            onClick={add}
            disabled={!novo.valor}
            className="btn-press flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-md"
            style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
          >
            <Plus size={13} /> Lançar
          </button>
        </div>
        <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
          Para custos que se repetem todo mês/ano, use a aba <b>Custos recorrentes</b> — o sistema
          lança sozinho.
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Custos empresariais lançados no mês</div>
          <div
            className="text-xs"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: C.inkSoft }}
          >
            {fmtBRL(totalMes)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
                <th className="px-3 py-1.5 font-medium">Data</th>
                <th className="px-3 py-1.5 font-medium">Categoria</th>
                <th className="px-3 py-1.5 font-medium">Descrição</th>
                <th className="px-3 py-1.5 font-medium">Valor</th>
                <th className="px-3 py-1.5 font-medium">Origem</th>
                <th className="px-3 py-1.5 font-medium" aria-label="ações" />
              </tr>
            </thead>
            <tbody>
              {ordenados.map((e) =>
                editId === e.id ? (
                  <tr key={e.id} style={{ background: C.panel2 }}>
                    <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                      {fmtDate(e.data)}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={editVal.categoria}
                        onChange={(ev) => setEditVal({ ...editVal, categoria: ev.target.value })}
                      >
                        {CATEGORIAS_GESTAO.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        value={editVal.descricao}
                        onChange={(ev) => setEditVal({ ...editVal, descricao: ev.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        type="number"
                        value={editVal.valor}
                        onChange={(ev) => setEditVal({ ...editVal, valor: ev.target.value })}
                        className="w-24"
                      />
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={salvar}>
                          <Save size={13} style={{ color: C.green }} />
                        </button>
                        <button type="button" onClick={() => setEditId(null)}>
                          <X size={13} style={{ color: C.inkFaint }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={e.id}
                    className="row-hover border-t"
                    style={{ borderColor: C.borderSoft }}
                  >
                    <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                      {fmtDate(e.data)}
                    </td>
                    <td className="px-3 py-2 text-xs">{rotuloCategoriaGestao(e.categoria)}</td>
                    <td className="px-3 py-2" style={{ color: C.inkSoft }}>
                      {e.descricao || "—"}
                    </td>
                    <td className="px-3 py-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmtBRL(e.valor)}
                    </td>
                    <td className="px-3 py-2">
                      {e.deTemplate ? (
                        <span className="text-[10px]" style={{ color: C.blue }}>
                          automático
                        </span>
                      ) : (
                        <span className="text-[10px]" style={{ color: C.inkFaint }}>
                          manual
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditId(e.id);
                            setEditVal({
                              categoria: e.categoria,
                              valor: String(e.valor),
                              descricao: e.descricao,
                            });
                          }}
                        >
                          <Pencil size={12} style={{ color: C.inkFaint }} />
                        </button>
                        <button type="button" onClick={() => remover(e.id)}>
                          <X size={13} style={{ color: C.inkFaint }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
              {ordenados.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs" style={{ color: C.inkFaint }}>
                    Nenhum custo empresarial lançado neste mês.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/* ============================= 6. OPERAÇÃO (combustível + manutenção preventiva) ============================= */
// mapeamentos banco -> formato da tela
const mapFuel = (r) => ({
  id: r.id,
  data: r.record_date,
  direcao: r.direction,
  km: Number(r.km) || 0,
  litros: Number(r.liters) || 0,
  combustivel: Number(r.cost) || 0,
});
const mapManut = (m) => ({
  id: m.id,
  tipo: m.type,
  data: m.performed_at,
  kmAtual: Number(m.odometer_km) || 0,
  intervaloKm: Number(m.interval_km) || 5000,
  custo: Number(m.cost) || 0,
  notas: m.notes || "",
});

function OperacaoTab() {
  const { vehicles, defaultVehicle, setDefault, updateVehicle } = useVehicles();
  const { drivers, addDriver, updateDriver, removeDriver } = useDrivers();
  const veiculoId = defaultVehicle?.id ?? null;
  const fuel = useFuelRecords(veiculoId);
  const manut = useMaintenance(veiculoId);

  const [reg, setReg] = useState({
    data: todayStr(),
    direcao: "ida",
    km: "",
    combustivel: "",
    litros: "",
  });
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});
  const [periodo, setPeriodo] = useState("dia");
  const [editandoVeiculo, setEditandoVeiculo] = useState(null);
  const [veiculoForm, setVeiculoForm] = useState({});
  const [editandoMotorista, setEditandoMotorista] = useState(null);
  const [motoristaForm, setMotoristaForm] = useState({});
  const [novaManut, setNovaManut] = useState({
    tipo: "",
    intervaloKm: 5000,
    kmAtual: "",
    custo: "",
    data: todayStr(),
  });
  const [erro, setErro] = useState("");

  const registros = useMemo(() => (fuel.records || []).map(mapFuel), [fuel.records]);
  const manutencoes = useMemo(() => (manut.records || []).map(mapManut), [manut.records]);
  const motoristas = useMemo(
    () => (drivers || []).map((d) => ({ id: d.id, nome: d.name, telefone: d.phone || "" })),
    [drivers],
  );
  const run = async (fn, msg) => {
    setErro("");
    try {
      await fn();
    } catch (e) {
      setErro(e?.message || msg);
    }
  };

  const salvarVeiculo = (id, campos) =>
    run(
      () => updateVehicle(id, campos).then(() => setEditandoVeiculo(null)),
      "Não foi possível salvar o veículo.",
    );
  const addRegistro = () => {
    if (!reg.km || !veiculoId) return;
    run(async () => {
      await fuel.addRecord({
        vehicleId: veiculoId,
        recordDate: reg.data,
        direction: reg.direcao,
        km: Number.parseFloat(reg.km),
        liters: Number.parseFloat(reg.litros || 0),
        cost: Number.parseFloat(reg.combustivel || 0),
      });
      setReg({ ...reg, km: "", combustivel: "", litros: "" });
    }, "Não foi possível registrar.");
  };
  const removerRegistro = (id) =>
    run(() => fuel.removeRecord(id), "Não foi possível remover o abastecimento.");
  const iniciarEdicaoReg = (r) => {
    setEditId(r.id);
    setEditVal({ ...r });
  };
  const salvarEdicaoReg = () =>
    run(async () => {
      await fuel.updateRecord(editId, {
        record_date: editVal.data,
        direction: editVal.direcao,
        km: Number.parseFloat(editVal.km),
        liters: Number.parseFloat(editVal.litros || 0),
        cost: Number.parseFloat(editVal.combustivel || 0),
      });
      setEditId(null);
    }, "Não foi possível salvar.");
  const salvarMotorista = (id, dados) =>
    run(
      () =>
        updateDriver(id, { name: dados.nome, phone: dados.telefone || null }).then(() =>
          setEditandoMotorista(null),
        ),
      "Não foi possível salvar o motorista.",
    );
  const removerMotorista = (id) =>
    run(() => removeDriver(id), "Não foi possível remover o motorista.");
  const addMotorista = () =>
    run(() => addDriver({ name: "Novo motorista", phone: null }), "Não foi possível adicionar.");
  const addManutencao = () => {
    if (!novaManut.tipo || !veiculoId) return;
    run(async () => {
      await manut.addRecord({
        vehicleId: veiculoId,
        type: novaManut.tipo,
        performedAt: novaManut.data,
        odometerKm: Number.parseFloat(novaManut.kmAtual) || 0,
        intervalKm: Number.parseFloat(novaManut.intervaloKm) || 5000,
        cost: Number.parseFloat(novaManut.custo) || 0,
      });
      setNovaManut({ tipo: "", intervaloKm: 5000, kmAtual: "", custo: "", data: todayStr() });
    }, "Não foi possível registrar a manutenção.");
  };
  const removerManutencao = (id) =>
    run(() => manut.removeRecord(id), "Não foi possível remover a manutenção.");

  const hoje = todayStr();
  const dentroDoPeriodo = (ds) => {
    if (!ds) return false;
    if (periodo === "dia") return ds === hoje;
    if (periodo === "mes") return ds.slice(0, 7) === hoje.slice(0, 7);
    return ds.slice(0, 4) === hoje.slice(0, 4);
  };
  const registrosFiltrados = registros.filter((r) => dentroDoPeriodo(r.data));
  const totalKm = registrosFiltrados.reduce((s, r) => s + r.km, 0);
  const totalCombustivel = registrosFiltrados.reduce((s, r) => s + r.combustivel, 0);
  const totalManutencao = manutencoes
    .filter((m) => dentroDoPeriodo(m.data))
    .reduce((s, m) => s + m.custo, 0);
  const totalLitros = registrosFiltrados.reduce((s, r) => s + r.litros, 0);
  const consumoMedio = totalLitros > 0 ? (totalKm / totalLitros).toFixed(1) : null;
  const custoPorKm = totalKm > 0 ? totalCombustivel / totalKm : 0;
  const mediaHistorica = (antesId) => {
    const anteriores = registros.filter((r) => r.id !== antesId && r.km > 0);
    if (anteriores.length === 0) return null;
    return anteriores.reduce((s, r) => s + r.combustivel / r.km, 0) / anteriores.length;
  };
  const kmAcumuladoDesde = (data) =>
    registros.filter((r) => r.data >= data).reduce((s, r) => s + r.km, 0);

  return (
    <div>
      <Header
        title="Operação"
        subtitle="Veículo, motorista, combustível (consumo/alerta) e manutenção preventiva."
        right={
          fuel.loading || manut.loading ? (
            <span className="text-xs" style={{ color: C.inkFaint }}>
              carregando…
            </span>
          ) : null
        }
      />
      <div className="px-6 md:px-10 pb-10 space-y-5">
        {(erro || fuel.error || manut.error) && (
          <div
            className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} />{" "}
              {erro ||
                "Erro ao carregar dados de operação (só admin/financeiro têm acesso a combustível/manutenção)."}
            </span>
            {erro && (
              <button onClick={() => setErro("")}>
                <X size={13} />
              </button>
            )}
          </div>
        )}
        <Card className="anim-fadeUp">
          <div className="text-sm font-semibold mb-3">Veículo em operação</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {vehicles.map((v) => {
              const ativo = v.is_default;
              const editando = editandoVeiculo === v.id;
              return editando ? (
                <div
                  key={v.id}
                  className="border rounded-lg px-3 py-3 anim-pop"
                  style={{ borderColor: C.amber, background: C.panel2 }}
                >
                  <TextInput
                    value={veiculoForm.name ?? ""}
                    onChange={(e) => setVeiculoForm({ ...veiculoForm, name: e.target.value })}
                    className="mb-2"
                    placeholder="Nome"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <TextInput
                      value={veiculoForm.plate ?? ""}
                      onChange={(e) => setVeiculoForm({ ...veiculoForm, plate: e.target.value })}
                      placeholder="Placa"
                    />
                    <TextInput
                      type="number"
                      value={veiculoForm.capacity ?? ""}
                      onChange={(e) => setVeiculoForm({ ...veiculoForm, capacity: e.target.value })}
                      placeholder="Capacidade"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      salvarVeiculo(v.id, {
                        name: veiculoForm.name || v.name,
                        plate: veiculoForm.plate || v.plate,
                        capacity: Number.parseInt(veiculoForm.capacity, 10) || v.capacity,
                      })
                    }
                    className="btn-press mt-2 text-xs px-3 py-1.5 rounded-md"
                    style={{ background: C.amber, color: C.onBrand }}
                  >
                    Salvar
                  </button>
                </div>
              ) : (
                <div
                  key={v.id}
                  className="border rounded-lg px-4 py-3 relative"
                  style={{
                    borderColor: ativo ? C.amber : C.border,
                    background: ativo ? C.amberSoft : C.panel2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setEditandoVeiculo(v.id);
                      setVeiculoForm({ name: v.name, plate: v.plate, capacity: v.capacity });
                    }}
                    className="btn-press absolute top-2 right-2"
                    title="Editar veículo"
                  >
                    <Pencil size={12} style={{ color: C.inkFaint }} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      run(() => setDefault(v.id), "Não foi possível trocar o veículo padrão.")
                    }
                    className="btn-press w-full text-left flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <Bus size={14} style={{ color: ativo ? C.amber : C.inkSoft }} /> {v.name}{" "}
                        {ativo && <Pill color={C.blue}>padrão</Pill>}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>
                        {v.plate} · {v.capacity} lugares
                      </div>
                    </div>
                    {ativo && <CheckCircle2 size={16} style={{ color: C.amber }} />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="text-xs mt-3" style={{ color: C.inkFaint }}>
            Trocar o veículo padrão só afeta viagens criadas a partir de agora — a capacidade das
            viagens já agendadas é um "retrato" e não muda.
          </div>
        </Card>

        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: C.inkSoft }}>
            Ver totais por:
          </span>
          {["dia", "mes", "ano"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className="btn-press text-xs px-3 py-1.5 rounded-full"
              style={{
                background: periodo === p ? C.amber : C.panel2,
                color: periodo === p ? C.onBrand : C.inkSoft,
              }}
            >
              {p === "dia" ? "Hoje" : p === "mes" ? "Este mês" : "Este ano"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard
            label={`Km (${periodo})`}
            value={totalKm.toLocaleString("pt-BR")}
            icon={Route}
          />
          <StatCard
            label="Combustível"
            value={fmtBRL(totalCombustivel)}
            icon={Fuel}
            accent={C.amber}
          />
          <StatCard
            label="Manutenção"
            value={fmtBRL(totalManutencao)}
            icon={Wrench}
            accent={C.red}
          />
          <StatCard
            label="Consumo médio"
            value={consumoMedio ? `${consumoMedio} km/L` : "—"}
            icon={TrendingUp}
            accent={C.blue}
          />
          <StatCard
            label="Custo por km"
            value={fmtBRL(custoPorKm)}
            icon={Wallet}
            accent={C.green}
          />
        </div>

        <Card>
          <div className="text-sm font-semibold mb-3">Motoristas</div>
          {motoristas.map((m) =>
            editandoMotorista === m.id ? (
              <div
                key={m.id}
                className="flex gap-2 items-center border-b py-2 anim-pop"
                style={{ borderColor: C.borderSoft }}
              >
                <TextInput
                  value={motoristaForm.nome ?? ""}
                  onChange={(e) => setMotoristaForm({ ...motoristaForm, nome: e.target.value })}
                  placeholder="Nome"
                />
                <TextInput
                  value={motoristaForm.telefone ?? ""}
                  onChange={(e) => setMotoristaForm({ ...motoristaForm, telefone: e.target.value })}
                  placeholder="Telefone"
                />
                <button
                  type="button"
                  onClick={() =>
                    salvarMotorista(m.id, {
                      nome: motoristaForm.nome || m.nome,
                      telefone: motoristaForm.telefone,
                    })
                  }
                  className="btn-press"
                >
                  <Save size={14} style={{ color: C.green }} />
                </button>
              </div>
            ) : (
              <div
                key={m.id}
                className="flex justify-between items-center text-sm border-b py-2"
                style={{ borderColor: C.borderSoft }}
              >
                <span>{m.nome}</span>
                <div className="flex items-center gap-2">
                  <span style={{ color: C.inkSoft }}>{m.telefone || "sem telefone"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditandoMotorista(m.id);
                      setMotoristaForm({ nome: m.nome, telefone: m.telefone });
                    }}
                  >
                    <Pencil size={12} style={{ color: C.inkFaint }} />
                  </button>
                  <button type="button" onClick={() => removerMotorista(m.id)}>
                    <X size={13} style={{ color: C.red }} />
                  </button>
                </div>
              </div>
            ),
          )}
          <button
            type="button"
            onClick={addMotorista}
            className="btn-press mt-3 text-xs flex items-center gap-1"
            style={{ color: C.amber }}
          >
            <Plus size={12} /> Adicionar motorista
          </button>
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-3">Registrar abastecimento / viagem</div>
          <div className="text-xs mb-3" style={{ color: C.inkFaint }}>
            A despesa de combustível entra sozinha no Financeiro do dia.
          </div>
          <div className="grid sm:grid-cols-5 gap-2">
            <TextInput
              type="date"
              value={reg.data}
              onChange={(e) => setReg({ ...reg, data: e.target.value })}
            />
            <Select
              value={reg.direcao}
              onChange={(e) => setReg({ ...reg, direcao: e.target.value })}
            >
              <option value="ida">Ida</option>
              <option value="volta">Volta</option>
            </Select>
            <TextInput
              placeholder="Km rodados"
              type="number"
              value={reg.km}
              onChange={(e) => setReg({ ...reg, km: e.target.value })}
            />
            <TextInput
              placeholder="Litros"
              type="number"
              value={reg.litros}
              onChange={(e) => setReg({ ...reg, litros: e.target.value })}
            />
            <TextInput
              placeholder="Combustível R$"
              type="number"
              value={reg.combustivel}
              onChange={(e) => setReg({ ...reg, combustivel: e.target.value })}
            />
          </div>
          <button
            onClick={addRegistro}
            disabled={!reg.km || !veiculoId}
            className="btn-press mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              background: !reg.km || !veiculoId ? C.border : C.amber,
              color: !reg.km || !veiculoId ? C.inkFaint : C.onBrand,
            }}
          >
            <Plus size={14} /> Registrar
          </button>
          <div className="mt-4 space-y-1.5">
            {registros.slice(0, 20).map((r) => {
              const media = mediaHistorica(r.id);
              const custoAtual = r.km > 0 ? r.combustivel / r.km : 0;
              const alerta = media && custoAtual > media * 1.2;
              return editId === r.id ? (
                <div
                  key={r.id}
                  className="grid sm:grid-cols-5 gap-2 rounded-lg px-2 py-2 anim-pop"
                  style={{ background: C.panel2 }}
                >
                  <TextInput
                    type="date"
                    value={editVal.data}
                    onChange={(e) => setEditVal({ ...editVal, data: e.target.value })}
                    className="text-xs py-1"
                  />
                  <Select
                    value={editVal.direcao}
                    onChange={(e) => setEditVal({ ...editVal, direcao: e.target.value })}
                    className="text-xs py-1"
                  >
                    <option value="ida">Ida</option>
                    <option value="volta">Volta</option>
                  </Select>
                  <TextInput
                    type="number"
                    value={editVal.km}
                    onChange={(e) => setEditVal({ ...editVal, km: e.target.value })}
                    className="text-xs py-1"
                  />
                  <TextInput
                    type="number"
                    value={editVal.litros}
                    onChange={(e) => setEditVal({ ...editVal, litros: e.target.value })}
                    className="text-xs py-1"
                  />
                  <div className="flex gap-2">
                    <TextInput
                      type="number"
                      value={editVal.combustivel}
                      onChange={(e) => setEditVal({ ...editVal, combustivel: e.target.value })}
                      className="text-xs py-1"
                    />
                    <button onClick={salvarEdicaoReg}>
                      <Save size={14} style={{ color: C.green }} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={r.id}
                  className="row-hover flex items-center justify-between text-xs rounded-lg px-2 py-1.5"
                  style={{ background: C.panel2 }}
                >
                  <span>
                    {fmtDate(r.data)} · {r.direcao === "ida" ? "Ida" : "Volta"} · {r.km}km ·{" "}
                    {fmtBRL(r.combustivel)}
                    {r.litros ? ` (${r.litros}L)` : ""}{" "}
                    {alerta && <span style={{ color: C.red }}>⚠ consumo acima do normal</span>}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => iniciarEdicaoReg(r)}>
                      <Pencil size={12} style={{ color: C.inkFaint }} />
                    </button>
                    <button onClick={() => removerRegistro(r.id)}>
                      <X size={12} style={{ color: C.red }} />
                    </button>
                  </div>
                </div>
              );
            })}
            {registros.length === 0 && (
              <div className="text-xs" style={{ color: C.inkFaint }}>
                Nenhum abastecimento registrado.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Wrench size={15} style={{ color: C.amber }} /> Manutenção preventiva
          </div>
          <div className="text-xs mb-3" style={{ color: C.inkFaint }}>
            A despesa da manutenção entra sozinha no Financeiro do dia.
          </div>
          <div className="grid sm:grid-cols-5 gap-2">
            <TextInput
              placeholder="Tipo (ex.: troca de óleo)"
              value={novaManut.tipo}
              onChange={(e) => setNovaManut({ ...novaManut, tipo: e.target.value })}
            />
            <TextInput
              type="date"
              value={novaManut.data}
              onChange={(e) => setNovaManut({ ...novaManut, data: e.target.value })}
            />
            <TextInput
              placeholder="Intervalo (km)"
              type="number"
              value={novaManut.intervaloKm}
              onChange={(e) => setNovaManut({ ...novaManut, intervaloKm: e.target.value })}
            />
            <TextInput
              placeholder="Km na manutenção"
              type="number"
              value={novaManut.kmAtual}
              onChange={(e) => setNovaManut({ ...novaManut, kmAtual: e.target.value })}
            />
            <TextInput
              placeholder="Custo R$"
              type="number"
              value={novaManut.custo}
              onChange={(e) => setNovaManut({ ...novaManut, custo: e.target.value })}
            />
          </div>
          <button
            onClick={addManutencao}
            disabled={!novaManut.tipo || !veiculoId}
            className="btn-press mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              background: !novaManut.tipo || !veiculoId ? C.border : C.amber,
              color: !novaManut.tipo || !veiculoId ? C.inkFaint : C.onBrand,
            }}
          >
            <Plus size={14} /> Registrar manutenção
          </button>
          <div className="mt-4 space-y-1.5">
            {manutencoes.map((m) => {
              const kmDesde = kmAcumuladoDesde(m.data);
              const pct = Math.min(100, Math.round((kmDesde / m.intervaloKm) * 100));
              const vencida = pct >= 100;
              const proxima = pct >= 80 && !vencida;
              return (
                <div key={m.id} className="rounded-lg px-3 py-2" style={{ background: C.panel2 }}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {m.tipo} · última em {fmtDate(m.data)} ({m.kmAtual}km) · a cada{" "}
                      {m.intervaloKm}km · {fmtBRL(m.custo)}
                    </span>
                    <div className="flex items-center gap-2">
                      {vencida ? (
                        <Pill color={C.red} bg={C.redSoft}>
                          🔴 vencida
                        </Pill>
                      ) : proxima ? (
                        <Pill color={C.amber} bg={C.amberSoft}>
                          🟡 em breve
                        </Pill>
                      ) : (
                        <Pill color={C.green} bg={C.greenSoft}>
                          🟢 em dia
                        </Pill>
                      )}
                      <button onClick={() => removerManutencao(m.id)}>
                        <X size={12} style={{ color: C.red }} />
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-1 rounded-full mt-2" style={{ background: C.border }}>
                    <div
                      className="h-1 rounded-full bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: vencida ? C.red : proxima ? C.amber : C.green,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {manutencoes.length === 0 && (
              <div className="text-xs" style={{ color: C.inkFaint }}>
                Nenhuma manutenção preventiva cadastrada.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ============================= 7. DASHBOARD ============================= */
function HeroChip({ label, valor, moeda, Icon }) {
  const n = useCountUp(valor, 1100);
  const txt = moeda ? fmtBRL(n) : Math.round(n).toLocaleString("pt-BR");
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2"
      style={{ background: "rgba(0,0,0,.38)", border: "1px solid rgba(255,255,255,.08)" }}
    >
      <Icon size={15} style={{ color: "#fff" }} />
      <span className="text-[11px]" style={{ color: "rgba(255,255,255,.7)" }}>
        {label}
      </span>
      <span
        className="text-sm font-bold"
        style={{ color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}
      >
        {txt}
      </span>
    </div>
  );
}

function primeiroNome(profile) {
  const raw = (profile?.name || "").trim();
  if (!raw) return "equipe";
  const base = raw.includes("@") ? raw.split("@")[0].replace(/[._-]+/g, " ") : raw;
  const p = base.split(/\s+/)[0];
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function DashboardHero({ passageiros, vagas, faturamento, pendencias }) {
  const { profile } = useAuth();
  const nome = primeiroNome(profile);
  const h = new Date().getHours();
  const saud = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return (
    <div className="px-4 md:px-10 pt-5 md:pt-6 pb-4">
      <div
        className="relative rounded-2xl border overflow-hidden"
        style={{ borderColor: C.brandDim, minHeight: 236 }}
      >
        <HeroBusScene />
        <div className="relative p-5 md:p-7 max-w-2xl">
          <h1
            className="hero-t hero-t-1"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              fontSize: "1.7rem",
              color: "#fff",
              letterSpacing: "-0.015em",
              textShadow: "0 2px 12px rgba(0,0,0,.5)",
            }}
          >
            {saud}, {nome}!
          </h1>
          <p
            className="hero-t hero-t-2 text-sm mt-1"
            style={{ color: "rgba(255,255,255,.82)" }}
          >
            Aqui está o resumo da operação de hoje.
          </p>
          <div
            className="hero-t hero-t-3 mt-2 inline-flex items-center gap-2 text-xs font-semibold"
            style={{ color: "#fff", fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic" }}
          >
            <span className="aritur-road" style={{ width: 22 }} />
            Juntos, seguimos mais longe.
          </div>
          <div className="hero-t hero-t-4 mt-4 flex flex-wrap gap-2.5 items-center">
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.1)" }}
            >
              <Bus size={15} style={{ color: C.brand }} />
              <span className="text-xs font-semibold" style={{ color: "#fff" }}>
                São Luís → Pirapemas
              </span>
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,.6)" }}>
                viagens todos os dias
              </span>
            </div>
            <HeroChip label="Passageiros" valor={passageiros} Icon={Users} />
            <HeroChip label="Vagas" valor={vagas} Icon={Bus} />
            <HeroChip label="Faturamento" valor={faturamento} moeda Icon={Wallet} />
            <HeroChip label="Pendências" valor={pendencias} Icon={AlertTriangle} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardTab({ reservas, capacidade, trips }) {
  const hoje = todayStr();
  // Financeiro do mês atual + anterior (a janela de 7 dias pode cruzar o mês).
  const now = new Date();
  const finThis = useFinanceMonth(now.getFullYear(), now.getMonth() + 1);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const finPrev = useFinanceMonth(prevMonth.getFullYear(), prevMonth.getMonth() + 1);
  const financeiro = useMemo(
    () => [...(finPrev.entries || []), ...(finThis.entries || [])].map(mapEntry),
    [finThis.entries, finPrev.entries],
  );
  // Ano inteiro — só para o "Lucro real" (hoje/mês já saem de financeiro acima).
  const finAno = useFinanceYear(now.getFullYear());
  const financeiroAno = useMemo(() => (finAno.entries || []).map(mapEntry), [finAno.entries]);
  // combustível/manutenção do veículo padrão — só para os alertas de "IA Operacional"
  const { defaultVehicle } = useVehicles();
  const fuel = useFuelRecords(defaultVehicle?.id ?? null);
  const manut = useMaintenance(defaultVehicle?.id ?? null);
  const operacao = useMemo(
    () => ({
      registros: (fuel.records || []).map(mapFuel),
      manutencoes: (manut.records || []).map(mapManut),
    }),
    [fuel.records, manut.records],
  );
  const insights = useMemo(
    () => gerarInsightsIA(reservas, operacao, capacidade, trips),
    [reservas, operacao, capacidade, trips],
  );
  const demanda = useMemo(() => previsaoDemanda(reservas), [reservas]);
  const confirmadas = reservas.filter(
    (r) => OCUPA_VAGA.includes(r.status) && !["frete", "encomenda"].includes(r.tipo),
  );
  const doDia = confirmadas.filter((r) => r.data === hoje);
  const passageirosHoje = doDia.reduce((s, r) => s + r.quantidade, 0);
  const emEspera = reservas.filter((r) => r.status === "espera").length;
  const receitaHoje = financeiro
    .filter((f) => f.data === hoje && f.tipo === "receita")
    .reduce((s, f) => s + f.valor, 0);
  const receitaMes = useMemo(() => {
    const m = hoje.slice(0, 7);
    return financeiro
      .filter((f) => f.tipo === "receita" && f.data.startsWith(m))
      .reduce((s, f) => s + f.valor, 0);
  }, [financeiro, hoje]);
  // Lucro real = receita − despesa (a mesma conta da aba Financeiro),
  // em 3 janelas: hoje, mês corrente (até hoje) e ano corrente (até hoje).
  const despesaHoje = financeiro.filter((f) => f.data === hoje && f.tipo === "despesa").reduce((s, f) => s + f.valor, 0);
  const lucroHoje = receitaHoje - despesaHoje;
  const despesaMes = useMemo(() => {
    const m = hoje.slice(0, 7);
    return financeiro
      .filter((f) => f.tipo === "despesa" && f.data.startsWith(m))
      .reduce((s, f) => s + f.valor, 0);
  }, [financeiro, hoje]);
  const lucroMes = receitaMes - despesaMes;
  const lucroAno = useMemo(
    () => somaTipo(financeiroAno, "receita") - somaTipo(financeiroAno, "despesa"),
    [financeiroAno],
  );
  const contagemPorCliente = {};
  confirmadas.forEach((r) => {
    const k = r.telefone || r.nome;
    contagemPorCliente[k] = (contagemPorCliente[k] || 0) + 1;
  });
  const recorrentes = Object.values(contagemPorCliente).filter((n) => n >= 2).length;
  const ocupacaoMedia = capacidade ? Math.round((passageirosHoje / (capacidade * 2)) * 100) : 0;
  const ultimos7 = useMemo(() => {
    const dias = [];
    for (let i = 6; i >= 0; i--) {
      const ds = dataOperacao(-i);
      dias.push({
        dia: `${ds.slice(8, 10)}/${ds.slice(5, 7)}`,
        faturamento: financeiro
          .filter((f) => f.data === ds && f.tipo === "receita")
          .reduce((s, f) => s + f.valor, 0),
        passageiros: reservas
          .filter(
            (r) =>
              r.data === ds &&
              OCUPA_VAGA.includes(r.status) &&
              !["frete", "encomenda"].includes(r.tipo),
          )
          .reduce((s, r) => s + r.quantidade, 0),
      });
    }
    return dias;
  }, [financeiro, reservas]);
  const pendentesHoje = reservas.filter(
    (r) => r.data === hoje && (r.status === "pendente" || r.status === "espera"),
  ).length;
  const vagasHoje = Math.max(0, capacidade * 2 - passageirosHoje);
  return (
    <div>
      <DashboardHero
        passageiros={passageirosHoje}
        vagas={vagasHoje}
        faturamento={receitaHoje}
        pendencias={pendentesHoje}
      />
      <div className="px-6 md:px-10 pb-10 space-y-5">
        <Card className="anim-fadeUp" style={{ borderColor: C.purple }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} style={{ color: C.purple }} />
            <div className="text-sm font-semibold" style={{ color: C.purple }}>
              IA Operacional
            </div>
          </div>
          <div className="space-y-1.5">
            {insights.map((it, i) => (
              <div
                key={i}
                className="text-xs rounded-md px-2.5 py-1.5 flex items-start gap-2"
                style={{
                  background:
                    it.nivel === "alerta"
                      ? C.redSoft
                      : it.nivel === "sucesso"
                        ? C.greenSoft
                        : C.blueSoft,
                  color: it.nivel === "alerta" ? C.red : it.nivel === "sucesso" ? C.green : C.blue,
                }}
              >
                <span>{it.emoji}</span>
                <span>{it.msg}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="anim-fadeUp">
          <div className="text-sm font-semibold mb-3">Previsão de demanda por dia da semana</div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {demanda.map((d) => (
              <div
                key={d.idx}
                className="rounded-lg px-2 py-2 text-center"
                style={{ background: C.panel2 }}
              >
                <div className="text-[10px]" style={{ color: C.inkFaint }}>
                  {d.nome.slice(0, 3)}
                </div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                  }}
                >
                  {d.amostras > 0 ? d.media.toFixed(0) : "—"}
                </div>
                {d.amostras >= 2 && d.diffPct !== 0 && (
                  <div className="text-[10px]" style={{ color: d.diffPct > 0 ? C.green : C.red }}>
                    {d.diffPct > 0 ? "+" : ""}
                    {d.diffPct}%
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
            Média de passageiros confirmados por dia da semana, com base no histórico de reservas.
          </div>
        </Card>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 stagger">
          <StatCard label="Passageiros hoje" value={passageirosHoje} icon={Users} />
          <StatCard
            label="Faturamento hoje"
            value={fmtBRL(receitaHoje)}
            icon={Wallet}
            accent={C.green}
          />
          <StatCard
            label="Faturamento do mês"
            value={fmtBRL(receitaMes)}
            icon={TrendingUp}
            accent={C.amber}
          />
          <StatCard
            label="Lucro real até hoje"
            value={fmtBRL(lucroHoje)}
            icon={Route}
            accent={lucroHoje >= 0 ? C.blue : C.red}
          />
          <StatCard
            label="Lucro real do mês"
            value={fmtBRL(lucroMes)}
            icon={Route}
            accent={lucroMes >= 0 ? C.blue : C.red}
          />
          <StatCard
            label="Lucro real do ano"
            value={fmtBRL(lucroAno)}
            icon={Route}
            accent={lucroAno >= 0 ? C.blue : C.red}
          />
          <StatCard
            label="Clientes recorrentes"
            value={recorrentes}
            icon={Repeat}
            accent={C.blue}
          />
          <StatCard label="Lista de espera" value={emEspera} icon={Hourglass} accent={C.purple} />
          <StatCard
            label="Ocupação média hoje"
            value={`${ocupacaoMedia}%`}
            icon={CheckCircle2}
            accent={C.blue}
          />
        </div>
        <div className="anim-fadeUp">
          <Suspense fallback={<ChartsSkeleton />}>
            <SevenDayCharts data={ultimos7} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/* ============================= 8. SISTEMA ============================= */
function SistemaTab({ reservas, capacidade, cfg, modoAtendimento, onSetModo }) {
  const [diag, setDiag] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [novoPontoNome, setNovoPontoNome] = useState("");
  const [erro, setErro] = useState("");
  const catchErr = (p, msg) => p?.catch?.((e) => setErro(e?.message || msg));
  // Diagnóstico só-leitura: o banco já impede overbooking (trigger de
  // capacidade) e quantidade inválida (check). Aqui só listamos.
  const rodarDiagnostico = () => {
    setRodando(true);
    setTimeout(() => {
      const { issues, fixed } = runDiagnostics(reservas, capacidade, cfg.trips);
      setDiag({ issues, fixed, quando: new Date().toLocaleString("pt-BR") });
      setRodando(false);
    }, 400);
  };
  // Backup completo — gerado pelo servidor (database/17-backup-completo.sql),
  // nunca a partir do que já está carregado na tela. Um cron diário também
  // gera sozinho; aqui só disparamos sob demanda e oferecemos os formatos.
  const backup = useBackup();
  const [ultimoBackup, setUltimoBackup] = useState(null);
  const [formatoEmProcesso, setFormatoEmProcesso] = useState(null);
  const gerarBackupAgora = async () => {
    setErro("");
    try {
      setUltimoBackup(await backup.gerarAgora());
    } catch (e) {
      setErro(e?.message || "Não foi possível gerar o backup.");
    }
  };
  const abrirBackupDoHistorico = async (id) => {
    setErro("");
    try {
      setUltimoBackup(await backup.buscarPayload(id));
    } catch (e) {
      setErro(e?.message || "Não foi possível abrir esse backup.");
    }
  };
  const exportarBackup = async (formato) => {
    if (!ultimoBackup) return;
    setErro("");
    setFormatoEmProcesso(formato);
    try {
      if (formato === "json") baixarJSON(ultimoBackup);
      else if (formato === "excel") await baixarExcel(ultimoBackup);
      else if (formato === "csv") await baixarCSVZip(ultimoBackup);
      else if (formato === "pdf") abrirRelatorioPDF(ultimoBackup);
    } catch (e) {
      setErro(e?.message || "Não foi possível exportar o backup.");
    } finally {
      setFormatoEmProcesso(null);
    }
  };
  const trocarModo = (v) => {
    setErro("");
    onSetModo(v).catch((e) => setErro(e?.message || "Não foi possível trocar o modo (só admin)."));
  };
  const atualizarPonto = (p, campo, valor) => {
    setErro("");
    catchErr(
      cfg.atualizarPonto(p._dbId, campo, valor),
      "Não foi possível salvar o ponto (só admin).",
    );
  };
  const addPontoOutro = (direcao) => {
    if (!novoPontoNome.trim()) return;
    setErro("");
    catchErr(cfg.addPonto(direcao, novoPontoNome.trim()), "Não foi possível adicionar o ponto.");
    setNovoPontoNome("");
  };
  const removerPonto = (p) => {
    setErro("");
    catchErr(cfg.removerPonto(p._dbId), "Não foi possível remover o ponto.");
  };
  const setSegunda = (patch) => {
    setErro("");
    catchErr(
      cfg.setSegunda({ active: cfg.segundaAtiva, hours: cfg.segundaHoras, ...patch }),
      "Não foi possível salvar o ajuste (só admin).",
    );
  };

  return (
    <div>
      <Header
        title="Sistema"
        subtitle="Fluxo, valores, modo de atendimento, backup e correção automática."
        right={
          cfg.saving ? (
            <span className="text-xs" style={{ color: C.inkFaint }}>
              salvando…
            </span>
          ) : null
        }
      />
      <div className="px-6 md:px-10 pb-10 space-y-5">
        {erro && (
          <div
            className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} /> {erro}
            </span>
            <button onClick={() => setErro("")}>
              <X size={13} />
            </button>
          </div>
        )}
        <Card className="anim-fadeUp">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Settings2 size={16} style={{ color: C.amber }} /> Fluxo de agendamento e valores
          </div>
          <div className="flex items-center gap-3 mb-4 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={cfg.segundaAtiva}
                onChange={(e) => setSegunda({ active: e.target.checked })}
              />{" "}
              Ajuste automático de segunda-feira
            </label>
            {cfg.segundaAtiva && (
              <span className="flex items-center gap-1.5">
                antecipar{" "}
                <TextInput
                  type="number"
                  min={1}
                  max={4}
                  defaultValue={cfg.segundaHoras}
                  onBlur={(e) => setSegunda({ hours: Number.parseInt(e.target.value, 10) || 1 })}
                  style={{ width: 56 }}
                  className="py-1"
                />{" "}
                hora(s)
              </span>
            )}
          </div>
          {["ida", "volta"].map((dir) => (
            <div key={dir} className="mb-4">
              <div className="text-xs font-semibold mb-2" style={{ color: C.inkSoft }}>
                {cfg.trips[dir].nome}
              </div>
              <div className="space-y-2">
                {cfg.trips[dir].pontos.map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-[1fr_90px_90px_auto] gap-2 items-center rounded-lg px-2 py-2"
                    style={{ background: C.panel2 }}
                  >
                    <TextInput
                      defaultValue={p.nome}
                      onBlur={(e) =>
                        e.target.value !== p.nome && atualizarPonto(p, "nome", e.target.value)
                      }
                      className="py-1 text-xs"
                    />
                    <TextInput
                      type="time"
                      defaultValue={p.horaBase}
                      onBlur={(e) =>
                        e.target.value !== p.horaBase &&
                        atualizarPonto(p, "horaBase", e.target.value)
                      }
                      className="py-1 text-xs"
                    />
                    {p.campo === "bairro" ? (
                      <span className="text-[10px] text-center" style={{ color: C.inkFaint }}>
                        por bairro
                      </span>
                    ) : (
                      <TextInput
                        type="number"
                        defaultValue={p.valor}
                        onBlur={(e) =>
                          Number(e.target.value) !== p.valor &&
                          atualizarPonto(p, "valor", e.target.value)
                        }
                        className="py-1 text-xs"
                      />
                    )}
                    {p.core ? (
                      <span className="text-[10px] text-center" style={{ color: C.inkFaint }}>
                        fixo
                      </span>
                    ) : (
                      <button onClick={() => removerPonto(p)}>
                        <Trash2 size={13} style={{ color: C.red }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <TextInput
                  placeholder={`Novo ponto de ${cfg.trips[dir].nome.toLowerCase()}…`}
                  value={novoPontoNome}
                  onChange={(e) => setNovoPontoNome(e.target.value)}
                  className="text-xs py-1.5"
                />
                <button
                  onClick={() => addPontoOutro(dir)}
                  className="btn-press text-xs px-3 py-1.5 rounded-lg shrink-0"
                  style={{ background: C.amber, color: C.onBrand }}
                >
                  Adicionar
                </button>
              </div>
            </div>
          ))}
          <div className="text-xs mt-1" style={{ color: C.inkFaint }}>
            Editar um ponto: altere e clique fora do campo. "Buscar em Casa" usa a tabela de bairros
            (R$80/R$90); os demais usam o valor fixo aqui. Vale para todos os sócios.
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-3">Quem está atendendo agora</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                v: "ia",
                icon: Bot,
                label: "IA automática",
                desc: "O bot conduz o roteiro completo e confirma sozinho.",
              },
              {
                v: "manual",
                icon: UserCog,
                label: "Manual (você/equipe)",
                desc: "A IA para de confirmar sozinha; a equipe assume as conversas.",
              },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => trocarModo(o.v)}
                className="btn-press border rounded-lg px-4 py-3 text-left"
                style={{
                  borderColor: modoAtendimento === o.v ? C.amber : C.border,
                  background: modoAtendimento === o.v ? C.amberSoft : C.panel2,
                }}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <o.icon
                    size={15}
                    style={{ color: modoAtendimento === o.v ? C.amber : C.inkSoft }}
                  />
                  {o.label}
                </div>
                <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
                  {o.desc}
                </div>
              </button>
            ))}
          </div>
          <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
            Vale para todos os sócios em tempo real.
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck size={16} style={{ color: C.green }} /> Diagnóstico e correção automática
            </div>
            <button
              onClick={rodarDiagnostico}
              disabled={rodando}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: C.amber, color: C.onBrand }}
            >
              <RefreshCw size={12} className={rodando ? "animate-spin" : ""} />{" "}
              {rodando ? "Verificando…" : "Rodar diagnóstico agora"}
            </button>
          </div>
          <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
            Checagem só-leitura. O banco já impede overbooking (trava de capacidade) e quantidade
            inválida — isto aqui é uma segunda conferência manual.
          </p>
          {diag && (
            <div className="anim-slideDown space-y-2">
              <div className="text-xs" style={{ color: C.inkFaint }}>
                Última verificação: {diag.quando}
              </div>
              {diag.fixed.length === 0 && diag.issues.length === 0 && (
                <div className="text-xs flex items-center gap-1.5" style={{ color: C.green }}>
                  <Check size={13} /> Nenhum problema encontrado.
                </div>
              )}
              {diag.issues.map((f, i) => (
                <div
                  key={i}
                  className="text-xs rounded-md px-2 py-1.5 flex items-center gap-1.5"
                  style={{ background: C.redSoft, color: C.red }}
                >
                  <AlertTriangle size={12} /> {f}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Download size={15} style={{ color: C.blue }} /> Backup completo
          </div>
          <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
            Gerado pelo servidor com <b>todas</b> as tabelas — clientes, reservas, viagens,
            veículos, motoristas, combustível, manutenções, financeiro, configurações, usuários
            e logs — nunca só o que está carregado na tela. Um backup automático roda sozinho
            todo dia às 3h (São Luís) e fica guardado por 30 dias.
          </p>
          <button
            type="button"
            onClick={gerarBackupAgora}
            disabled={backup.gerando}
            className="btn-press flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg"
            style={{
              background: backup.gerando ? C.border : C.panel2,
              color: C.ink,
              border: `1px solid ${C.border}`,
            }}
          >
            <Download size={14} /> {backup.gerando ? "Gerando…" : "Gerar backup completo agora"}
          </button>

          {ultimoBackup && (
            <div className="mt-3 anim-slideDown">
              <div className="text-xs mb-1.5" style={{ color: C.inkFaint }}>
                Pronto — gerado em {fmtDataHora(ultimoBackup.gerado_em)}. Baixar como:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "json", label: "JSON" },
                  { id: "excel", label: "Excel (.xlsx)" },
                  { id: "csv", label: "CSV (.zip)" },
                  { id: "pdf", label: "PDF (relatório)" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => exportarBackup(f.id)}
                    disabled={formatoEmProcesso === f.id}
                    className="btn-press text-xs px-2.5 py-1.5 rounded-md"
                    style={{
                      background: C.amberSoft,
                      color: C.amber,
                      opacity: formatoEmProcesso === f.id ? 0.6 : 1,
                    }}
                  >
                    {formatoEmProcesso === f.id ? "…" : f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {backup.historico.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold mb-1.5" style={{ color: C.inkSoft }}>
                Histórico de backups
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {backup.historico.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-2 text-xs rounded-md px-2.5 py-1.5"
                    style={{ background: C.panel2 }}
                  >
                    <span style={{ color: C.inkSoft }}>
                      {fmtDataHora(h.created_at)} ·{" "}
                      {h.origem === "automatico" ? "automático" : "manual"} ·{" "}
                      {(h.tamanho_bytes / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => abrirBackupDoHistorico(h.id)}
                      className="btn-press shrink-0"
                      style={{ color: C.blue }}
                    >
                      Abrir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card style={{ borderColor: C.blueSoft }}>
          <div className="text-sm font-semibold mb-2">Acesso compartilhado entre sócios</div>
          <p className="text-xs" style={{ color: C.inkSoft }}>
            Todos que entram com sua conta enxergam os mesmos dados, atualizados em tempo real
            (Supabase Realtime). É o mesmo banco onde o bot do WhatsApp vai escrever e ler as
            reservas.
          </p>
        </Card>
      </div>
    </div>
  );
}
