import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Bus,
  Calculator,
  Calendar,
  Car,
  CarTaxiFront,
  Bell,
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
  Inbox,
  Landmark,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  NotebookPen,
  PhoneCall,
  Package,
  Pencil,
  Pin,
  PinOff,
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
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
  useRef,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useBackup } from "../hooks/useBackup.js";
import { usePassageiros, usePassageiroDetalhe } from "../hooks/usePassageiros.js";
import { useDiagnostics } from "../hooks/useDiagnostics.js";
import { useEnsureTrips } from "../hooks/useEnsureTrips.js";
import { useContasReceber, useFinanceMonth, useFinanceYear } from "../hooks/useFinance.js";
import { useGlobalSearch } from "../hooks/useGlobalSearch.js";
import { useExpenseCategories } from "../hooks/useExpenseCategories.js";
import { useDropoffAreas } from "../hooks/useDropoffAreas.js";
import { useNeighborhoodPricing } from "../hooks/useNeighborhoodPricing.js";
import { useRecurringExpenses } from "../hooks/useRecurringExpenses.js";
import { useFuelRecords, useMaintenance } from "../hooks/useOperation.js";
import { useReservationsWindow } from "../hooks/useReservations.js";
import { useRouteConfig } from "../hooks/useRouteConfig.js";
import { useSettings } from "../hooks/useSettings.js";
import { useNotes } from "../hooks/useNotes.js";
import { useErrorLog } from "../hooks/useErrorLog.js";
import { useNotifications } from "../hooks/useNotifications.js";
import { usePendencias } from "../hooks/usePendencias.js";
import { useTrips } from "../hooks/useTrips.js";
import { useUsersList } from "../hooks/useUsers.js";
import { useDrivers, useVehicles } from "../hooks/useVehicles.js";
import { useCustomerLookup } from "../hooks/useCustomerLookup.js";
import { foraDaAreaPadrao } from "../domain/cidades.js";
import { parseAnotacaoRapida } from "../domain/anotacaoRapida.js";
import { montarRelatorioFinanceiro } from "../domain/relatorioFinanceiro.js";
import {
  primeiroErro,
  validarData,
  validarNome,
  validarObrigatorio,
  validarQuantidade,
  validarTelefone,
  validarValor,
} from "../domain/validacao.js";
import { mensagemAmigavel } from "../lib/erros.js";
import { abrirRelatorioPDF, baixarCSVZip, baixarExcel, baixarJSON } from "../lib/backupExport.js";
import {
  abrirRelatorioFinanceiroPDF,
  baixarRelatorioFinanceiroXLSX,
} from "../lib/relatorioFinanceiroExport.js";
import { getMotionPref, resolveMotion, setMotionPref, watchSystemMotion } from "../lib/motion.js";
import { EVENTS, emit } from "../observability/index.js";
import { FadeIn, Presence, Skeleton } from "../ui/motion/index.js";
import { ChartsSkeleton, TabSkeleton } from "../ui/skeletons/TabSkeleton.jsx";
import { VideoBackdrop } from "../ui/VideoBackdrop.jsx";

// Recharts é pesado e só o Dashboard usa — carregado sob demanda para sair
// do bundle inicial (ver vite.config.js manualChunks). Issue #2.
const SevenDayCharts = React.lazy(() => import("../ui/charts/SevenDayCharts.jsx"));
const BlocoDeNotasTab = React.lazy(() => import("./tabs/BlocoDeNotasTab.jsx"));
const PendenciasTab = React.lazy(() => import("./tabs/PendenciasTab.jsx"));
const PassageirosTab = React.lazy(() => import("./tabs/PassageirosTab.jsx"));
const ListaTab = React.lazy(() => import("./tabs/ListaTab.jsx"));

import {
  BAIRROS_80,
  BAIRROS_80_NORM,
  BAIRROS_90,
  BAIRROS_90_NORM,
  BAIRROS_FALLBACK,
  BUSCA_MODOS,
  BUSCA_PROXIMO,
  BairrosContext,
  BotaoAgendar,
  BuscaChip,
  BusSilhueta,
  C,
  CATEGORIAS_DESPESA,
  CATEGORIAS_FALLBACK,
  CATEGORIAS_GESTAO,
  CATEGORIAS_RECEITA,
  CapacidadeBar,
  Card,
  CategoriasContext,
  DESEMBARQUE_IDA,
  DESEMBARQUE_VOLTA,
  DETALHE_DESEMBARQUE,
  DIAS_SEMANA,
  DROPOFF_FALLBACK,
  DirecaoDivisor,
  DropoffContext,
  FUSO_OPERACAO,
  Field,
  Header,
  HeroFX,
  ICONE_CATEGORIA,
  IDA_ORDEM_SECOES,
  IDA_PRIORIDADE,
  MESES_PT,
  MiniStat,
  NOTIF_META,
  NotificacoesContext,
  OCUPA_VAGA,
  PIX_KEY,
  PIX_NAME,
  PREFERS_REDUCED_MOTION,
  Pill,
  ROTULOS_AJUSTE,
  STATUS_META,
  Select,
  SinoNotificacoes,
  StatCard,
  StatusPill,
  SubTabs,
  TextArea,
  TextInput,
  VOLTA_ORDEM,
  anotacaoBase,
  baldesDesembarque,
  clampDia,
  dataOperacao,
  detalheDesembarque,
  detalheDesembarqueObrigatorio,
  diaSemana,
  digitos,
  enderecoEmbarque,
  enderecosFrequentes,
  fmtBRL,
  fmtDataHora,
  fmtDate,
  fmtDiaFuso,
  fmtHora,
  gerarInsightsIA,
  iconeCategoria,
  inferirBaldeDesembarque,
  inputCls,
  inputStyle,
  isMonday,
  labelLocal,
  linhaReserva,
  mapEntry,
  mapFuel,
  mapManut,
  normalizar,
  pontoDe,
  precoBairro,
  previsaoDemanda,
  rotuloBalde,
  rotuloCategoriaDespesa,
  runDiagnostics,
  shiftHour,
  somaTipo,
  tempoRelativo,
  textoDesembarque,
  todayStr,
  useBairros,
  useCategorias,
  useCountUp,
  useDeepLinkData,
  useDeepLinkSubview,
  useDropoff,
  useNotificacoesCtx,
  vagasDisponiveis,
} from "./tabShared.jsx";

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
      /* caixa de embarque: SEM transição de cor/borda — o preenchimento
         tem de aparecer no mesmo frame do toque. Só um micro-press. */
      .check-fast { transition: transform .07s ease; }
      .check-fast:active { transform: scale(.9); }
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
      @keyframes heroTextIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      @keyframes barGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      .hero-t { animation: heroTextIn .45s cubic-bezier(.16,1,.3,1) both; }
      .hero-t-1 { animation-delay: .02s; } .hero-t-2 { animation-delay: .07s; }
      .hero-t-3 { animation-delay: .12s; } .hero-t-4 { animation-delay: .17s; }
      .card-lift { transition: transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, border-color .2s ease; }
      .card-lift:hover { transform: translateY(-3px); border-color: ${C.brandDim}; box-shadow: 0 14px 34px -18px rgba(0,0,0,.7); }
      .bar-grow { transform-origin: bottom; animation: barGrow .45s cubic-bezier(.16,1,.3,1) both; }

      /* ---- FX cinematográfico dos heros (toda tela que usa .aritur-hero) ---- */
      @keyframes heroRoad   { to { background-position: -46px 82%; } }
      @keyframes heroBreath { 0%,100% { opacity:.35; transform:scale(1) translateY(0); } 50% { opacity:.7; transform:scale(1.06) translateY(-4px); } }
      @keyframes heroSpark  { 0% { transform: translate(0,0) scale(1); opacity:0; } 15% { opacity:.7; } 100% { transform: translate(-120px,-24px) scale(.4); opacity:0; } }
      @keyframes busDrift   { 0%,100% { transform: translateY(0) rotate(-.5deg); } 50% { transform: translateY(-6px) rotate(.4deg); } }
      .aritur-hero::before {
        content:""; position:absolute; left:-6%; right:-6%; bottom:-8px; height:38%;
        background: repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 16px, rgba(255,255,255,0) 16px 52px);
        background-size: 52px 100%; background-position: 0 82%; background-repeat: repeat-x;
        transform: perspective(360px) rotateX(58deg); transform-origin: bottom;
        animation: heroRoad 1.1s linear infinite; opacity:.55; pointer-events:none;
        mask-image: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent);
      }
      .aritur-hero::after {
        content:""; position:absolute; top:-70%; right:-12%; width:56%; height:240%;
        background: radial-gradient(circle at 66% 34%, ${C.brandGlow} 0%, transparent 62%);
        filter: blur(26px); animation: heroBreath 8s ease-in-out infinite; pointer-events:none;
      }
      .hero-fx { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0; }
      .hero-fx-bus { position:absolute; bottom:-16%; right:-3%; width:min(210px, 42%);
        animation: busDrift 6s ease-in-out infinite; will-change: transform;
        filter: drop-shadow(0 -6px 20px rgba(0,0,0,.4)); opacity:.5; }
      .hero-fx-bus svg { display:block; width:100%; }
      .hero-fx-spark { position:absolute; right:16%; width:3px; height:3px; border-radius:50%;
        background:#ff7a70; box-shadow:0 0 9px 1px ${C.brandGlow}; opacity:0;
        animation: heroSpark 4s linear infinite; }
      .hero-fx-spark.s1 { bottom:44%; animation-delay:0s; }
      .hero-fx-spark.s2 { bottom:58%; right:26%; animation-delay:1.5s; }
      .hero-fx-spark.s3 { bottom:34%; right:10%; animation-delay:3s; }
      .bus-drift { animation: busDrift 6.5s ease-in-out infinite; will-change: transform; }

      .safe-bottom { padding-bottom: max(0.5rem, env(safe-area-inset-bottom)); }
      @media (max-width: 640px) {
        button, select, input, textarea, a[role="button"] { min-height: 42px; }
        /* botões/ícones minúsculos dentro de linhas densas não precisam do mínimo */
        table button, .no-min-h, .no-min-h button { min-height: 0; }
      }
      /* Movimento: a preferência efetiva vive em html[data-motion] (lib/motion.js).
         "off" desliga tudo. Enquanto o JS não resolve, o @media abaixo é a
         rede de segurança para quem tem "reduzir movimento" no sistema. */
      html[data-motion="off"] *, html[data-motion="off"] *::before, html[data-motion="off"] *::after {
        animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
      html[data-motion="off"] :is(.aritur-road,.bus-drift,.hero-fx-bus,.hero-fx-spark,.pulse-dot),
      html[data-motion="off"] .aritur-hero::before, html[data-motion="off"] .aritur-hero::after { animation: none !important; }
      html[data-motion="off"] .hero-fx-spark { opacity: 0 !important; }
      /* .anim-fadeIn envolve o conteúdo de TODA aba (Reservar, Agenda, Lista,
         Financeiro, Gestão...) e .anim-fadeUp/.anim-pop/.anim-slideDown/
         .stagger entram cards e listas — reduzir a duração pra ~0 (regra
         acima) não é suficiente em alguns motores móveis: a camada composta
         em will-change pode ficar presa no frame inicial (opacity:0) sem
         repintar, "sumindo" com o conteúdo real. animation:none remove
         de vez o risco — o elemento nasce no estado final, sem keyframe. */
      html[data-motion="off"] :is(.anim-fadeUp,.anim-fadeIn,.anim-pop,.anim-slideDown,.stagger > *) {
        animation: none !important; will-change: auto !important; }
      @media (prefers-reduced-motion: reduce) {
        html:not([data-motion]) *, html:not([data-motion]) *::before, html:not([data-motion]) *::after {
          animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
        html:not([data-motion]) :is(.aritur-road,.bus-drift,.hero-fx-bus,.hero-fx-spark),
        html:not([data-motion]) .aritur-hero::before, html:not([data-motion]) .aritur-hero::after { animation: none !important; }
        html:not([data-motion]) :is(.anim-fadeUp,.anim-fadeIn,.anim-pop,.anim-slideDown,.stagger > *) {
          animation: none !important; will-change: auto !important; }
      }
    `}</style>
  );
}

/* ===================== IDENTIDADE ARITUR =============================
 * Logo real da AriTur Transportes (arte enviada pelo dono, 2026-09-18):
 * monograma "AT" com a fita da rodovia, recortado com fundo transparente
 * em frontend/public/brand/ — ver PROCESSO em git log (logo-process.html,
 * removido depois de gerar os recortes). `mark-transparent.png` = só o
 * monograma (cabeçalhos, ícones); `full-transparent.png` = monograma +
 * "AriTur Transportes" + tagline (tela de login, onde há espaço).
 */
const SERIF = "'Fraunces', 'Times New Roman', Georgia, serif";
const MONO_T = "#DDDEE2";
// proporção real de mark-transparent.png (1076×508) — mantém o aspecto ao
// escalar só pela altura.
const MARK_RATIO = 1076 / 508;

function AriturMark({ size = 42 }) {
  return (
    <img
      src="/brand/mark-transparent.png"
      alt="AriTur"
      style={{ height: size, width: size * MARK_RATIO, flexShrink: 0, display: "block" }}
    />
  );
}

function AriturLogo({ compact = false, tagline = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <AriturMark size={compact ? 30 : 44} />
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
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: "0.66rem",
              color: C.inkFaint,
            }}
          >
            Conectando destinos, cuidando de cada viagem
          </div>
        )}
      </div>
    </div>
  );
}

/* Camada de FX dos heros: um ônibus preto/vermelho atravessando devagar a
   faixa + faíscas. A estrada e o brilho que respiram vêm do CSS de
   `.aritur-hero` (::before / ::after). Tudo desligado em reduced-motion. */
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
  { tab: "dashboard", label: "Dashboard", termos: "visão geral indicadores gráficos" },
  { tab: "agenda", label: "Agenda de viagens", termos: "viagens dia pendentes confirmar" },
  {
    tab: "lista",
    label: "Lista do dia",
    termos: "embarque desembarque motorista rota passageiros do dia",
  },
  { tab: "financeiro", label: "Financeiro", termos: "caixa receita despesa lucro lançamento" },
  {
    tab: "financeiro",
    sub: "contas_receber",
    label: "Contas a receber",
    termos: "cobrança pendente devendo whatsapp pagamento",
  },
  {
    tab: "gestao",
    sub: "resultado",
    label: "Gestão Operacional",
    termos: "resultado líquido dre margem empresarial",
  },
  {
    tab: "gestao",
    sub: "recorrentes",
    label: "Custos recorrentes",
    termos: "salário pró-labore imposto seguro ipva depreciação automação",
  },
  {
    tab: "passageiros",
    label: "Passageiros / CRM",
    termos: "clientes histórico contatos telefone",
  },
  { tab: "operacao", label: "Operação — combustível", termos: "abastecimento km consumo veículo" },
  {
    tab: "operacao",
    label: "Manutenção preventiva",
    termos: "troca óleo revisão preventiva veículo",
  },
  {
    tab: "sistema",
    label: "Sistema / Configurações",
    termos: "backup usuários pontos valores horários pix",
  },
  { tab: "sistema", label: "Backup completo", termos: "exportar json csv excel pdf cópia dados" },
  { tab: "reservar", label: "Reservar passagem", termos: "nova reserva atendimento whatsapp bot" },
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
      style={{
        background: accent,
        borderColor: C.border,
        color: C.ink,
        boxShadow: "0 2px 10px rgba(0,0,0,.35)",
      }}
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
      <div className="fixed z-30 flex flex-col items-end gap-2.5 right-3.5 md:right-6 bottom-[calc(4.9rem+env(safe-area-inset-bottom))] md:bottom-6">
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
              Digite ao menos 2 caracteres. Ex.: nome do passageiro, telefone, “05/09”,
              “financeiro”.
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
                onClick={() =>
                  onNavigate({ tab: "agenda", deepLink: { kind: "data", data: dataAlvo } })
                }
              />
              <ItemResultado
                icon={ClipboardList}
                titulo={`Lista do dia — ${fmtDate(dataAlvo)}`}
                sub="Embarque e desembarque"
                onClick={() =>
                  onNavigate({ tab: "lista", deepLink: { kind: "data", data: dataAlvo } })
                }
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
function useLazyTab(tab) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const t = setTimeout(() => setReady(true), 220);
    return () => clearTimeout(t);
  }, [tab]);
  return ready;
}

const JANELA_PASSADO = 45;
const JANELA_FUTURO = 90;

// Quais papéis enxergam cada aba. O RLS do banco já barra os DADOS (um
// motorista que abrisse Financeiro só via erro de permissão); isto é só
// navegação — esconde o que a pessoa não usa. `admin` vê tudo.
const TAB_ROLES = {
  reservar: ["admin", "atendente"],
  agenda: ["admin", "atendente", "motorista", "financeiro"],
  lista: ["admin", "atendente", "motorista", "financeiro"],
  bloco: ["admin", "atendente"],
  passageiros: ["admin", "atendente", "financeiro"],
  pendencias: ["admin", "atendente"],
  financeiro: ["admin"],
  gestao: ["admin"],
  operacao: ["admin"],
  dashboard: ["admin"],
  sistema: ["admin"],
};

// Ordem da barra lateral (pedido do dono): primeiro o dia a dia
// (Dashboard, Agenda, Lista, Financeiro, Gestão), depois os cadastros, e o
// fluxo de agendamento ("Reservar" / atendimento automático) por último.
const NAV_ITENS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, grupo: "Principal" },
  { id: "agenda", label: "Agenda", icon: Calendar, grupo: "Operação" },
  { id: "lista", label: "Lista do Dia", icon: ClipboardList, grupo: "Operação" },
  { id: "bloco", label: "Bloco de notas", icon: NotebookPen, grupo: "Operação" },
  { id: "financeiro", label: "Financeiro", icon: Wallet, grupo: "Financeiro" },
  { id: "gestao", label: "Gestão", icon: Landmark, grupo: "Financeiro" },
  { id: "passageiros", label: "Passageiros", icon: Users, grupo: "Clientes" },
  { id: "operacao", label: "Operação", icon: Bus, grupo: "Frota" },
  { id: "sistema", label: "Sistema", icon: ShieldCheck, grupo: "Administração" },
  { id: "pendencias", label: "Pendências", icon: Inbox, grupo: "Atendimento" },
  { id: "reservar", label: "Reservar", icon: MessageCircle, grupo: "Atendimento" },
];
const NAV_GRUPOS = [
  "Principal",
  "Operação",
  "Financeiro",
  "Clientes",
  "Frota",
  "Administração",
  "Atendimento",
];

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

function MobileNav({ nav, tab, onSelect, pendentesCount, pendenciasCount = 0 }) {
  const badgeDe = (id) =>
    id === "agenda" ? pendentesCount : id === "pendencias" ? pendenciasCount : 0;
  const [maisAberto, setMaisAberto] = useState(false);
  const LIMITE = 6;
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
            <div className="w-9 h-1 rounded-full mx-auto mb-3" style={{ background: C.border }} />
            <div className="grid grid-cols-4 gap-2">
              {extras.map((n) => (
                <MobileNavItem
                  key={n.id}
                  n={n}
                  grande
                  active={tab === n.id}
                  badge={badgeDe(n.id)}
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
            badge={badgeDe(n.id)}
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
    () => ({ from: dataOperacao(-JANELA_PASSADO), to: dataOperacao(JANELA_FUTURO) }),
    [],
  );
  const R = useReservationsWindow(janela.from, janela.to);
  const reservas = R.reservations;

  // --- tudo no Postgres agora ------------------------------------------
  const cfgSettings = useSettings();
  const { defaultVehicle } = useVehicles();
  const cfg = useRouteConfig();
  const categorias = useExpenseCategories();
  const bairros = useNeighborhoodPricing();
  const dropoff = useDropoffAreas();
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
  const notif = useNotifications({ enabled: !!role });
  const pend = usePendencias({ enabled: podeAgendar });
  const pendenciasCount = pend.total;

  return (
    <NotificacoesContext.Provider value={notif}>
      <CategoriasContext.Provider value={categorias}>
        <BairrosContext.Provider value={bairros}>
          <DropoffContext.Provider value={dropoff}>
            <div
              className="min-h-screen w-full flex relative"
              style={{ background: C.bg, fontFamily: "'Inter', sans-serif", color: C.ink }}
            >
              <GlobalStyles />
              <VideoBackdrop variant="app" />
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
                  capacidade={capacidadeAtiva}
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
                    background: C.panel2,
                    color: C.ink,
                    border: `1px solid ${C.border}`,
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
                className="hidden md:flex flex-col w-64 shrink-0 border-r relative overflow-hidden z-10"
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
                  <div
                    className="text-[11px] mt-2 flex items-center gap-1.5"
                    style={{ color: C.inkFaint }}
                  >
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
                              {((n.id === "agenda" && pendentesCount > 0) ||
                                (n.id === "pendencias" && pendenciasCount > 0)) && (
                                <span
                                  className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                  style={{
                                    background: active ? "rgba(255,255,255,.22)" : C.panel2,
                                    color: active ? C.onBrand : C.ink,
                                  }}
                                >
                                  {n.id === "agenda" ? pendentesCount : pendenciasCount}
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
                      style={{
                        background: C.brand,
                        color: "#fff",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      {(usuario || "?").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span
                        className="block text-xs font-semibold truncate"
                        style={{ color: C.ink }}
                      >
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
                    Mais que transporte, <span style={{ color: C.brand }}>conectamos pessoas.</span>
                  </div>
                </div>
                <BusSilhueta
                  className="absolute pointer-events-none bus-drift"
                  style={{ width: 240, bottom: -12, left: -30, opacity: 0.9 }}
                  opacity={0.055}
                />
              </div>

              <MobileNav
                nav={NAV}
                tab={tab}
                onSelect={mudarAba}
                pendentesCount={pendentesCount}
                pendenciasCount={pendenciasCount}
              />

              <div className="flex-1 min-w-0 pb-20 md:pb-0 overflow-x-hidden relative z-10">
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
                  <Suspense fallback={<TabSkeleton tab={tab} />}>
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
                          cidadesIntermediarias={cfgSettings.intermediateCities}
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
                      {tab === "bloco" && <BlocoDeNotasTab />}
                      {tab === "pendencias" && <PendenciasTab pend={pend} />}
                      {tab === "passageiros" && (
                        <PassageirosTab trips={trips} deepLink={deepLink} />
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
                  </Suspense>
                )}
              </div>
            </div>
          </DropoffContext.Provider>
        </BairrosContext.Provider>
      </CategoriasContext.Provider>
    </NotificacoesContext.Provider>
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
  cidadesIntermediarias,
}) {
  // Chave Pix: vem de settings.pix (aba Sistema); cai no valor fixo se a
  // config ainda não foi preenchida.
  const pixKey = pix?.key || PIX_KEY;
  const pixName = pix?.name || PIX_NAME;
  const bairros = useBairros();
  const dropoff = useDropoff();
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
  const precoDoBairro = ponto?.campo === "bairro" ? bairros.preco(form.bairro) : undefined;
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
  const optCidades = cidadesIntermediarias?.length
    ? { intermediarias: cidadesIntermediarias }
    : undefined;
  const pendente =
    ponto?.id === "outro" || foraDaAreaPadrao(Object.values(camposTexto), optCidades);
  const camposFaltando = () => {
    if (!form.nome || !form.telefone || !form.desembarqueArea || !form.quantidade || excedeVagas)
      return true;
    if (dropoff.obrigatorio(form.direcao, form.desembarqueArea) && !form.desembarqueDetalhe.trim())
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
    const problema = primeiroErro([
      validarNome(form.nome),
      validarTelefone(form.telefone),
      validarData(form.data, { min: todayStr() }),
      validarQuantidade(Number.parseInt(form.quantidade, 10), { min: 1, max: capacidade }),
      validarValor(valorUnit, { min: 0 }),
    ]);
    if (problema) {
      setErroEnvio(problema);
      return;
    }
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
        dropoffLocation: textoDesembarque(
          form.direcao,
          form.desembarqueArea,
          form.desembarqueDetalhe,
        ),
        dropoffArea: form.desembarqueArea || null,
        dropoffDetail: form.desembarqueDetalhe.trim() || null,
        pendingReason: pendente
          ? "Embarque/desembarque fora de São Luís, Cantanhede ou Pirapemas — aguardando confirmação."
          : null,
        status: pendente ? "pendente" : "confirmada",
      });
      emit(EVENTS.RESERVA_CRIADA, {
        via: "roteiro",
        status: res?.status || (pendente ? "pendente" : "confirmada"),
        duplicada: res?.message === "duplicate_ignored",
      });
      setDone(resumoLocal(res?.status || (pendente ? "pendente" : "confirmada")));
      setStep(9);
    } catch (e) {
      if (e?.code === "CAPACITY_OR_BUSINESS_RULE") {
        setForm({ ...form, _direcaoOriginal: form.direcao });
        setStep("espera-form");
      } else setErroEnvio(mensagemAmigavel(e, "Não foi possível enviar a reserva. Tente de novo."));
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
      setErroEnvio(mensagemAmigavel(e, "Não foi possível entrar na lista de espera."));
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
      setErroEnvio(mensagemAmigavel(e, "Não foi possível registrar o frete."));
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
      setErroEnvio(mensagemAmigavel(e, "Não foi possível registrar a encomenda."));
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
      <div className="px-4 md:px-10 pt-5 md:pt-6 pb-4">
        <div
          className="aritur-hero relative overflow-hidden rounded-2xl border p-5 md:p-6"
          style={{ borderColor: C.brandDim }}
        >
          <HeroFX />
          <div className="relative max-w-xl">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(0,0,0,.35)" }}
              >
                <MessageCircle size={16} style={{ color: "#fff" }} />
              </span>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}
              >
                {modoAtendimento === "ia" ? "IA atendendo" : "Atendimento manual"}
              </span>
            </div>
            <h1
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                fontSize: "1.5rem",
                color: "#fff",
                letterSpacing: "-0.01em",
              }}
            >
              Atendimento automático
            </h1>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,.8)" }}>
              Roteiro conduzido pela IA — horários, pontos e valores vêm da configuração em Sistema.
            </p>
            <div className="aritur-road mt-3" style={{ width: 64 }} />
          </div>
        </div>
      </div>
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
                      list="bairros-reservar"
                      placeholder="Ex.: Cohama"
                      value={form.bairro}
                      onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                    />
                  </Field>
                  <datalist id="bairros-reservar">
                    {bairros.nomes.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
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
                    {dropoff.porDirecao(form.direcao).map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              {form.desembarqueArea && (
                <div className="mt-2">
                  <Field
                    label={`${dropoff.detalhe(form.direcao, form.desembarqueArea).label}${
                      dropoff.obrigatorio(form.direcao, form.desembarqueArea) ? " *" : ""
                    }`}
                  >
                    <TextInput
                      value={form.desembarqueDetalhe}
                      placeholder={dropoff.detalhe(form.direcao, form.desembarqueArea).ph}
                      onChange={(e) => setForm({ ...form, desembarqueDetalhe: e.target.value })}
                    />
                  </Field>
                  {dropoff.obrigatorio(form.direcao, form.desembarqueArea) &&
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
  // Lista de espera: TODA (não só o dia selecionado) — é assim que a
  // equipe vê quem está aguardando vaga em qualquer data e chama quando
  // alguém cancela.
  const esperaTodos = useMemo(
    () =>
      reservas
        .filter((r) => r.status === "espera")
        .sort((a, b) => (a.data || "").localeCompare(b.data || "")),
    [reservas],
  );
  const ocupa = doDia.filter((r) => OCUPA_VAGA.includes(r.status));
  const paxIda = ocupa.filter((r) => r.direcao === "ida").reduce((s, r) => s + r.quantidade, 0);
  const paxVolta = ocupa.filter((r) => r.direcao === "volta").reduce((s, r) => s + r.quantidade, 0);
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
      setAcaoErro(mensagemAmigavel(e, msgFalha));
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
  // Edição inteira numa transação só (rpc_edit_reservation, database/33):
  // se a capacidade recusar o "mover" ou a nova quantidade, NADA é salvo.
  const salvarEdicao = async ({
    id,
    move,
    details,
    quantidade,
    contato,
    pagamento,
    comprovante,
    cancel,
  }) => {
    setAcaoErro("");
    try {
      if (cancel) {
        await R.cancelReservation(id);
        emit(EVENTS.RESERVA_CANCELADA, { via: "editar" });
        setEditando(null);
        return;
      }
      await R.editReservationFull(id, {
        move: move
          ? {
              trip_date: move.tripDate,
              direction: move.direction,
              route_point_code: move.routePointCode ?? null,
            }
          : null,
        details: details && Object.keys(details).length > 0 ? details : null,
        quantity: quantidade ? quantidade.qty : null,
        contact: contato ? { customer_id: contato.customerId, ...contato.fields } : null,
        paid: pagamento
          ? { paid: pagamento.paid, amount: pagamento.amount, method: pagamento.method }
          : null,
        proof: comprovante
          ? {
              received: comprovante.received,
              amount: comprovante.amount,
              method: comprovante.method,
            }
          : null,
      });
      emit(EVENTS.RESERVA_EDITADA, {
        campos: [
          move && "ponto",
          quantidade && "quantidade",
          details && Object.keys(details).length > 0 && "detalhes",
          contato && "contato",
          pagamento && "pagamento",
          comprovante && "comprovante",
        ].filter(Boolean),
      });
      setEditando(null);
    } catch (e) {
      setAcaoErro(mensagemAmigavel(e, "Não foi possível salvar a edição."));
    }
  };
  // Quem busca em casa: cicla Táxi → Nós → Motorista → Táxi (issue #96).
  const ciclarBusca = (id, atual) =>
    acao(
      R.setPickupTransport(id, BUSCA_PROXIMO[atual ?? "taxi"] ?? "proprio"),
      "Não foi possível mudar quem busca.",
    );
  const dataFrete = (r) => r.data || r.extra?.data || null;

  // Anotação rápida direto no ponto/horário da Agenda: "1P Cohatrac
  // 98999998888" cria a reserva sem abrir modal nenhum. O ponto já é
  // conhecido (é o da linha clicada) — só quantidade/local/telefone vêm
  // do texto. Mesma RPC de sempre (rpc_create_reservation via
  // R.createReservation); capacidade e duplicidade continuam decididas
  // pelo banco.
  const bairrosAnotacao = useBairros();
  const buscarClientePorTelefone = useCustomerLookup();
  const criarViaAnotacao = async (direcao, ponto, texto) => {
    const achado = parseAnotacaoRapida(texto);
    if (!achado.ok) return { ok: false, erro: achado.erro };

    const ehBairro = ponto.campo === "bairro";
    const precoAuto = ehBairro ? (bairrosAnotacao.preco(achado.local) ?? 80) : (ponto.valor ?? 60);

    try {
      const nomeExistente = await buscarClientePorTelefone(achado.telefone);
      const nome = nomeExistente || `Passageiro${achado.local ? ` (${achado.local})` : ""}`;
      const res = await R.createReservation({
        tripDate: data,
        direction: direcao,
        customerName: nome,
        customerPhone: achado.telefone,
        routePointCode: ponto.id,
        quantity: achado.quantidade,
        unitPrice: precoAuto,
        paymentMethod: "dinheiro",
        pickupNeighborhood: ehBairro ? achado.local || null : null,
        pickupDetail: !ehBairro ? achado.local || null : null,
        status: "confirmada",
        extraData: { origem: "anotacao_agenda" },
      });
      emit(EVENTS.RESERVA_CRIADA, {
        via: "anotacao_agenda",
        status: res?.status || "confirmada",
        duplicada: res?.message === "duplicate_ignored",
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: mensagemAmigavel(e, "Não foi possível criar a reserva.") };
    }
  };

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
        <div
          className="aritur-hero relative overflow-hidden rounded-2xl border p-4 md:p-5"
          style={{ borderColor: C.brandDim }}
        >
          <HeroFX />
          <div className="relative flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div
                className="capitalize"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.35rem",
                  color: "#fff",
                }}
              >
                {data === todayStr() ? "Hoje" : diaSemana(data)}
              </div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,.75)" }}>
                {fmtDate(data)} · <span className="capitalize">{diaSemana(data)}</span>
              </div>
            </div>
            <div className="min-w-[200px] flex-1 max-w-xs space-y-2">
              <CapacidadeBar prefixo="IDA" ocupados={paxIda} total={capacidade} altura={8} />
              <CapacidadeBar prefixo="VOLTA" ocupados={paxVolta} total={capacidade} altura={8} />
            </div>
            <div className="flex gap-4">
              <div>
                <div
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,.6)" }}
                >
                  Pendentes
                </div>
                <div
                  className="font-bold"
                  style={{
                    color: "#fff",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "1.1rem",
                  }}
                >
                  {pendentesDoDia.length}
                </div>
              </div>
              {esperaTodos.length > 0 && (
                <div>
                  <div
                    className="text-[10px] uppercase tracking-wide"
                    style={{ color: "rgba(255,255,255,.6)" }}
                  >
                    Na espera
                  </div>
                  <div
                    className="font-bold"
                    style={{
                      color: "#fff",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "1.1rem",
                    }}
                  >
                    {esperaTodos.length}
                  </div>
                </div>
              )}
            </div>
          </div>
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

        {esperaTodos.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Hourglass size={16} style={{ color: C.inkSoft }} />
              <div className="text-sm font-semibold" style={{ color: C.ink }}>
                Lista de espera <span style={{ color: C.inkFaint }}>({esperaTodos.length})</span>
              </div>
            </div>
            <div className="space-y-2">
              {esperaTodos.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
                  style={{ background: C.panel2 }}
                >
                  <div className="text-xs" style={{ color: C.inkSoft }}>
                    <span className="font-semibold" style={{ color: C.ink }}>
                      {r.data ? fmtDate(r.data) : "sem data"} ·{" "}
                      {r.direcao === "ida" ? "IDA" : "VOLTA"}
                    </span>
                    {" · "}
                    {r.quantidade}P {r.pontoId ? labelLocal(r, trips) : "(qualquer ponto)"}
                    {" · "}
                    {r.nome} · {r.telefone}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => moverDaEspera(r)}
                      className="btn-press text-xs px-2 py-1 rounded-md font-semibold"
                      style={{ background: C.panel, color: C.ink, border: `1px solid ${C.border}` }}
                    >
                      Chamar (dar vaga)
                    </button>
                    <button
                      onClick={() => setEditando(r)}
                      className="btn-press text-xs px-2 py-1 rounded-md"
                      style={{ background: C.panel, color: C.inkSoft }}
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => atualizarStatus(r.id, "cancelada")}
                      className="btn-press text-xs px-2 py-1 rounded-md"
                      style={{ background: C.redSoft, color: C.red }}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {(pendentesDoDia.length > 0 ||
          fretesPendentes.length > 0 ||
          encomendasPendentes.length > 0) && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} style={{ color: C.inkSoft }} />
              <div className="text-sm font-semibold" style={{ color: C.ink }}>
                Pendentes (fora da rota padrão)
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
            onBusca={ciclarBusca}
            onAnotar={criarViaAnotacao}
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
// Ações da linha do passageiro na Agenda. Enxuto e com rótulo (o motorista
// no celular não vê tooltip): WhatsApp · Editar · Cancelar. Pagamento,
// comprovante e localização saíram — pagamento/comprovante agora ficam
// dentro de "Editar reserva".
function QuickActions({ r, onStatus, onEditar }) {
  const tel = digitos(r.telefone);
  const btn = (Icon, label, onClick) => (
    <button
      type="button"
      onClick={onClick}
      className="btn-press flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium"
      style={{ background: C.panel2, color: C.inkSoft }}
    >
      <Icon size={13} /> <span>{label}</span>
    </button>
  );
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tel && btn(MessageCircle, "WhatsApp", () => window.open(`https://wa.me/55${tel}`, "_blank"))}
      {btn(Pencil, "Editar", () => onEditar(r))}
      {r.status !== "cancelada" && btn(X, "Cancelar", () => onStatus(r.id, "cancelada"))}
    </div>
  );
}
function LinhaOperacional({ r, trips, onStatus, onEditar, onBusca }) {
  const marcado = r.status === "embarcado" || r.status === "nao_compareceu";
  const endereco = enderecoEmbarque(r, trips) || "endereço não informado";
  return (
    <div className="row-hover rounded-md px-2 py-2" style={{ background: C.panel }}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={r.status === "embarcado" ? "Desmarcar embarque" : "Marcar embarque"}
          onClick={() => onStatus(r.id, r.status === "embarcado" ? "confirmada" : "embarcado")}
          className="check-fast shrink-0 mt-0.5 w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center"
          style={{
            borderColor: r.status === "embarcado" ? C.ink : C.inkFaint,
            background: r.status === "embarcado" ? C.ink : "transparent",
          }}
        >
          {r.status === "embarcado" && <Check size={11} color={C.panel} strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          {/* o que importa: nº de passagens + endereço */}
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-[13px] font-bold shrink-0"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: marcado ? C.inkFaint : C.ink,
              }}
            >
              {r.quantidade}P
            </span>
            <span
              className="text-[13px] font-semibold leading-snug"
              style={{
                color: marcado ? C.inkFaint : C.ink,
                textDecoration: r.status === "nao_compareceu" ? "line-through" : "none",
                overflowWrap: "anywhere",
              }}
            >
              {endereco}
            </span>
          </div>
          {/* nome em segundo plano */}
          <div
            className="text-[11px] mt-0.5"
            style={{ color: C.inkFaint, overflowWrap: "anywhere" }}
          >
            {r.nome || "—"}
            {r.desembarque ? ` · desembarque: ${r.desembarque}` : ""}
            {r.pagamento === "pix" ? " · Pix" : ""}
          </div>
          <div
            className="text-[10px] mt-1 flex items-center gap-1.5 flex-wrap"
            style={{ color: C.inkFaint }}
          >
            <StatusPill status={r.status} />
            {onBusca && r.pontoId === "busca" && <BuscaChip r={r} onCycle={onBusca} dense />}
          </div>
        </div>
      </div>
      <div className="mt-2 pl-6">
        <QuickActions r={r} onStatus={onStatus} onEditar={onEditar} />
      </div>
    </div>
  );
}
// Linha de anotação rápida por ponto/horário na Agenda (pedido do
// usuário): digita "1P Cohatrac 98999998888" e a reserva é criada sem
// abrir modal — domain/anotacaoRapida.js reconhece o formato. `onSalvar`
// devolve `{ ok, erro? }` (vem de AgendaTab.criarViaAnotacao).
function AnotacaoRapidaLinha({ onSalvar, nomePonto }) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const salvar = async () => {
    if (!texto.trim() || salvando) return;
    setSalvando(true);
    setErro("");
    const r = await onSalvar(texto);
    setSalvando(false);
    if (r?.ok) setTexto("");
    else setErro(r?.erro || "Não foi possível criar a reserva.");
  };

  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1.5">
        <NotebookPen size={13} className="shrink-0" style={{ color: C.inkFaint }} />
        <TextInput
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            if (erro) setErro("");
          }}
          onKeyDown={(e) => e.key === "Enter" && salvar()}
          placeholder="Anotar reserva — ex.: 1P Cohatrac 98999998888"
          aria-label={`Anotar reserva — ${nomePonto}`}
          className="text-xs py-1.5"
          disabled={salvando}
        />
        <button
          type="button"
          onClick={salvar}
          disabled={!texto.trim() || salvando}
          aria-label="Anotar reserva"
          className="btn-press shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
          style={{
            background: !texto.trim() || salvando ? C.border : C.amberSoft,
            color: !texto.trim() || salvando ? C.inkFaint : C.amber,
          }}
        >
          <RefreshCw size={13} className={salvando ? "animate-spin" : "hidden"} />
          <Plus size={13} className={salvando ? "hidden" : ""} />
        </button>
      </div>
      {erro && (
        <div className="text-[11px] mt-1 pl-[19px]" style={{ color: C.red }}>
          {erro}
        </div>
      )}
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
  onBusca,
  onAnotar,
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
      alert(mensagemAmigavel(e, "Não foi possível iniciar a viagem.")),
    );
  };
  const finalizarViagem = () => {
    if (!viagemAtiva?.trip_id) return;
    const kmTxt = prompt("Km atual do veículo na chegada?");
    if (kmTxt === null) return;
    T.finishTrip(viagemAtiva.trip_id, { km: Number.parseFloat(kmTxt) || 0 }).catch((e) =>
      alert(mensagemAmigavel(e, "Não foi possível finalizar a viagem.")),
    );
  };
  const avisarJanela = (nomeCidade) =>
    alert(
      `Mensagem simulada enviada aos passageiros de ${nomeCidade}: "Estamos a caminho para te buscar! 🚐"`,
    );

  return (
    <Card className="relative overflow-hidden">
      <span
        className="absolute left-0 top-0 bottom-0"
        style={{ width: 3, background: direcao === "ida" ? C.brand : C.blue, opacity: 0.85 }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: direcao === "ida" ? C.amberSoft : C.blueSoft,
              border: `1px solid ${direcao === "ida" ? C.brandDim : C.blue}44`,
            }}
          >
            <Icon size={18} style={{ color: direcao === "ida" ? C.brand : C.blue }} />
          </div>
          <div>
            <div
              className="text-sm font-bold flex items-center gap-1.5"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <Bus size={14} style={{ color: C.brand }} /> {viagem.nome}
              <span style={{ color: C.inkSoft, fontWeight: 500 }}>· {horaPrincipal}</span>
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
      <div className="rounded-xl px-3 py-3 mb-4" style={{ background: C.panel2 }}>
        <CapacidadeBar ocupados={confirmados} total={capacidade} altura={9} />
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
          <MiniStat label="Capacidade" value={capacidade} />
          <MiniStat label="Confirmados" value={confirmados} cor={C.green} />
          <MiniStat label="Pendentes" value={pendentesQtd} cor={C.warn} />
          <MiniStat label="Vagas" value={vagas} cor={vagas === 0 ? C.red : C.ink} />
          <MiniStat label="Embarcados" value={embarcados} cor={C.blue} />
        </div>
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
                <div className="text-xs pl-1 mb-1.5" style={{ color: C.inkFaint }}>
                  Sem reservas.
                </div>
              ) : (
                <div className="space-y-1.5 mb-1.5">
                  {itens.map((r) => (
                    <LinhaOperacional
                      key={r.id}
                      r={r}
                      trips={trips}
                      onStatus={onStatus}
                      onEditar={onEditar}
                      onBusca={onBusca}
                    />
                  ))}
                </div>
              )}
              {onAnotar && (
                <AnotacaoRapidaLinha
                  nomePonto={p.nome}
                  onSalvar={(texto) => onAnotar(direcao, p, texto)}
                />
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
  const [f, setF] = useState({ ...reserva, anotacao: anotacaoBase(reserva) });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const viagem = trips[f.direcao] || trips.ida;
  const ponto = viagem.pontos.find((p) => p.id === f.pontoId);
  const campoDetalhe = ponto?.campo; // 'bairro' | 'localExato' | 'localOutro' | undefined

  const salvar = async () => {
    const problema = primeiroErro([
      validarNome(f.nome),
      validarTelefone(f.telefone),
      validarData(f.data, {
        min: reserva.data && reserva.data < todayStr() ? reserva.data : todayStr(),
      }),
      validarQuantidade(Number.parseInt(f.quantidade, 10), { min: 1 }),
      campoDetalhe === "bairro" ? validarObrigatorio(f.bairro, "Bairro") : null,
    ]);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
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
    if (campoDetalhe === "bairro") set("pickup_neighborhood", f.bairro, reserva.bairro);
    // Anotação reescrita à mão (issue: editar endereço escrevendo manualmente)
    // substitui rua/referência/detalhe-por-ponto — evita duplicar a mesma
    // informação em campos estruturados E na anotação livre.
    if ((f.anotacao || "") !== anotacaoBase(reserva)) {
      details.pickup_detail = f.anotacao.trim() || null;
      details.street = null;
      details.reference_point = null;
    }

    const novaQtd = Number.parseInt(f.quantidade, 10) || 1;
    const quantidade = novaQtd !== reserva.quantidade ? { qty: novaQtd } : null;
    const contatoFields = {};
    if ((f.nome || "") !== (reserva.nome || "")) contatoFields.name = f.nome || null;
    if ((f.telefone || "") !== (reserva.telefone || "")) contatoFields.phone = f.telefone || null;
    const contato =
      reserva.customer_id && Object.keys(contatoFields).length > 0
        ? { customerId: reserva.customer_id, fields: contatoFields }
        : null;

    const metodo = f.pagamento || reserva.pagamento;
    const pagamento =
      !!f.pago !== !!reserva.pago
        ? { reservationId: reserva.id, paid: !!f.pago, amount: reserva.valorTotal, method: metodo }
        : null;
    const comprovante =
      !!f.comprovanteRecebido !== !!reserva.comprovanteRecebido
        ? {
            reservationId: reserva.id,
            received: !!f.comprovanteRecebido,
            amount: reserva.valorTotal,
            method: metodo,
          }
        : null;

    await onSave({ id: reserva.id, move, details, quantidade, contato, pagamento, comprovante });
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
          <Field label="Categoria de embarque">
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
              min={reserva.data && reserva.data < todayStr() ? reserva.data : todayStr()}
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
        <div className="mt-2">
          <Field label="Anotação (endereço, ponto de referência, observações)">
            <TextArea
              rows={2}
              value={f.anotacao || ""}
              onChange={(e) => setF({ ...f, anotacao: e.target.value })}
              placeholder="Escreva como preferir — ex.: rua tal, perto da padaria, portão azul"
            />
          </Field>
        </div>
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
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs" style={{ color: C.inkSoft }}>
            <input
              type="checkbox"
              checked={!!f.pago}
              onChange={(e) => setF({ ...f, pago: e.target.checked })}
            />
            Pagamento recebido {reserva.valorTotal ? `(${fmtBRL(reserva.valorTotal)})` : ""}
          </label>
          <label className="flex items-center gap-2 text-xs" style={{ color: C.inkSoft }}>
            <input
              type="checkbox"
              checked={!!f.comprovanteRecebido}
              onChange={(e) => setF({ ...f, comprovanteRecebido: e.target.checked })}
            />
            Comprovante recebido
          </label>
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

function NovaReservaModal({
  dataInicial,
  direcaoInicial = "ida",
  trips,
  onClose,
  onCriar,
  capacidade = 31,
}) {
  const primeiroPonto = (dir) => trips[dir]?.pontos?.[0]?.id || "";
  const [f, setF] = useState({
    nome: "",
    telefone: "",
    data: dataInicial || todayStr(),
    direcao: direcaoInicial,
    pontoId: primeiroPonto(direcaoInicial),
    bairro: "",
    anotacao: "",
    quantidade: "1",
    pagamento: "dinheiro",
    valorManual: "",
    desembarque: "",
    comoPendente: false,
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ofereceEspera, setOfereceEspera] = useState(false);
  const bairros = useBairros();

  const viagem = trips[f.direcao] || trips.ida;
  const ponto = viagem.pontos.find((p) => p.id === f.pontoId);
  const campoDetalhe = ponto?.campo; // 'bairro' | 'localExato' | 'localOutro' | undefined
  const precoBairroAtual = campoDetalhe === "bairro" ? bairros.preco(f.bairro) : undefined;
  const bairroNaoReconhecido =
    campoDetalhe === "bairro" && f.bairro.trim() && precoBairroAtual === null;
  const precoAuto = campoDetalhe === "bairro" ? (precoBairroAtual ?? 80) : (ponto?.valor ?? 60);
  const valorUnit = f.valorManual !== "" ? Number.parseFloat(f.valorManual) || 0 : precoAuto;
  const qtd = Number.parseInt(f.quantidade, 10) || 1;
  const podeEnviar =
    f.nome.trim() &&
    f.telefone.trim() &&
    f.pontoId &&
    (campoDetalhe !== "bairro" || f.bairro.trim());

  const trocarDirecao = (dir) =>
    setF((s) => ({ ...s, direcao: dir, pontoId: primeiroPonto(dir), bairro: "", anotacao: "" }));

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
    pickupDetail: f.anotacao.trim() || null,
    street: null,
    referencePoint: null,
    dropoffLocation: f.desembarque.trim() || null,
    status,
    pendingReason: status === "pendente" ? "Agendamento manual — aguardando confirmação." : null,
    extraData: { origem: "agendamento_manual" },
  });

  const criar = async (status) => {
    setErro("");
    const problema = primeiroErro([
      validarNome(f.nome),
      validarTelefone(f.telefone),
      validarData(f.data, { min: todayStr() }),
      validarQuantidade(qtd, { min: 1, max: capacidade }),
      validarValor(valorUnit, { min: 0 }),
      campoDetalhe === "bairro" ? validarObrigatorio(f.bairro, "Bairro") : null,
    ]);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    try {
      const res = await onCriar(montarPayload(status));
      emit(EVENTS.RESERVA_CRIADA, {
        via: "agendamento_manual",
        status: res?.status || status,
        duplicada: res?.message === "duplicate_ignored",
      });
      onClose({ ok: true, nome: f.nome.trim(), status: res?.status || status, data: f.data });
    } catch (e) {
      if (e?.code === "CAPACITY_OR_BUSINESS_RULE" && status !== "espera") {
        setOfereceEspera(true);
        setErro(mensagemAmigavel(e, "Viagem lotada."));
      } else {
        setErro(mensagemAmigavel(e, "Não foi possível agendar. Tente de novo."));
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
          <div
            className="font-semibold text-sm"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
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
              min={todayStr()}
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
          <Field label="Categoria de embarque">
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
              {bairros.nomes.map((b) => (
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

        <div className="mb-2">
          <Field label="Anotação (endereço, ponto de referência, observações — opcional)">
            <TextArea
              rows={2}
              value={f.anotacao}
              onChange={(e) => setF({ ...f, anotacao: e.target.value })}
              placeholder="Escreva como preferir — ex.: rua tal, perto da padaria, portão azul"
            />
          </Field>
        </div>

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
            <Select value={f.pagamento} onChange={(e) => setF({ ...f, pagamento: e.target.value })}>
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

function FinanceiroTab({ pix, deepLink }) {
  const [subview, setSubview] = useState("lancamentos");
  useDeepLinkSubview(deepLink, setSubview);
  const [mesRef, setMesRef] = useState(new Date());
  const [diaSel, setDiaSel] = useState(todayStr());
  const [novo, setNovo] = useState({
    tipo: "receita",
    categoria: "passagem",
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
  const cats = useCategorias();
  const financeiro = useMemo(() => (fin.entries || []).map(mapEntry), [fin.entries]);
  const receitaMes = somaTipo(financeiro, "receita");
  const despesaMes = somaTipo(financeiro, "despesa");
  const resultadoMes = receitaMes - despesaMes;

  const run = async (fn) => {
    setErro("");
    setSalvando(true);
    try {
      await fn();
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };
  const add = () => {
    const v = validarValor(novo.valor, { min: 0.01 });
    if (!v.ok) {
      setErro(v.erro);
      return;
    }
    const d = validarData(diaSel);
    if (!d.ok) {
      setErro(d.erro);
      return;
    }
    run(async () => {
      await fin.addEntry({
        entryDate: diaSel,
        type: novo.tipo,
        category: novo.categoria || (novo.tipo === "despesa" ? "outro" : "passagem"),
        amount: v.valor,
        description: novo.descricao || null,
      });
      setNovo({ tipo: "receita", categoria: "passagem", valor: "", descricao: "" });
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
      <div className="px-6 md:px-10 mb-4">
        <SubTabs
          value={subview}
          onChange={setSubview}
          options={[
            { id: "lancamentos", label: "Lançamentos", Icon: Wallet },
            { id: "contas_receber", label: "Contas a receber", Icon: MessageCircle },
            { id: "relatorio", label: "Relatório", Icon: Receipt },
          ]}
        />
      </div>
      {subview === "contas_receber" && <ContasReceberView pix={pix} />}
      {subview === "relatorio" && <RelatorioFinanceiroView />}
      {subview === "lancamentos" && (
        <div className="px-6 md:px-10 pb-10 space-y-5">
          <div
            className="aritur-hero relative overflow-hidden rounded-2xl border p-4 md:p-5 flex flex-wrap items-center justify-between gap-4"
            style={{ borderColor: C.brandDim }}
          >
            <HeroFX />
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMesRef(new Date(ano, mes - 1, 1))}
                className="btn-press p-1.5 rounded-lg"
                style={{ background: "rgba(0,0,0,.3)", color: "#fff" }}
              >
                <ChevronLeft size={16} />
              </button>
              <div
                className="capitalize text-center min-w-[130px]"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.15rem",
                  color: "#fff",
                }}
              >
                {MESES_PT[mes]} <span style={{ fontWeight: 400, opacity: 0.7 }}>{ano}</span>
              </div>
              <button
                type="button"
                onClick={() => setMesRef(new Date(ano, mes + 1, 1))}
                className="btn-press p-1.5 rounded-lg"
                style={{ background: "rgba(0,0,0,.3)", color: "#fff" }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="relative flex flex-wrap gap-5">
              <div>
                <div
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,.6)" }}
                >
                  Receitas
                </div>
                <div
                  style={{
                    color: "#fff",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                  }}
                >
                  {fmtBRL(receitaMes)}
                </div>
              </div>
              <div>
                <div
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,.6)" }}
                >
                  Despesas
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,.72)",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                  }}
                >
                  {fmtBRL(despesaMes)}
                </div>
              </div>
              <div>
                <div
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,.6)" }}
                >
                  Resultado do mês
                </div>
                <div
                  style={{
                    color: "#fff",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 800,
                    fontSize: "1.1rem",
                  }}
                >
                  {fmtBRL(resultadoMes)}
                </div>
              </div>
            </div>
          </div>
          <div className="grid lg:grid-cols-[340px_1fr] gap-6">
            <Card className="anim-fadeUp">
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
                          ds === todayStr() && !sel
                            ? `1px solid ${C.amber}`
                            : "1px solid transparent",
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
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
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
                  accent={C.warn}
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
                  {cats.despesa.map((c) => {
                    const Icon = iconeCategoria(c.icon);
                    const ativo = novo.tipo === "despesa" && novo.categoria === c.slug;
                    return (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => {
                          setNovo((n) => ({ ...n, tipo: "despesa", categoria: c.slug }));
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
                    onChange={(e) => {
                      const tipo = e.target.value;
                      setNovo((n) => ({
                        ...n,
                        tipo,
                        categoria:
                          tipo === "receita" ? "passagem" : (cats.despesa[0]?.slug ?? "outro"),
                      }));
                    }}
                  >
                    <option value="receita">Receita</option>
                    <option value="despesa">Despesa</option>
                  </Select>
                  {novo.tipo === "despesa" ? (
                    <Select
                      value={novo.categoria}
                      onChange={(e) => setNovo({ ...novo, categoria: e.target.value })}
                    >
                      {cats.despesa.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.label}
                        </option>
                      ))}
                      {!cats.existe(novo.categoria) && novo.categoria ? (
                        <option value={novo.categoria}>{novo.categoria}</option>
                      ) : null}
                    </Select>
                  ) : (
                    <Select
                      value={novo.categoria}
                      onChange={(e) => setNovo({ ...novo, categoria: e.target.value })}
                    >
                      {CATEGORIAS_RECEITA.map((c) => (
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
                                onChange={(e) =>
                                  setEditVal({ ...editVal, categoria: e.target.value })
                                }
                                className="text-xs py-1"
                              >
                                {cats.despesa.map((c) => (
                                  <option key={c.slug} value={c.slug}>
                                    {c.label}
                                  </option>
                                ))}
                                {editVal.categoria && !cats.existe(editVal.categoria) ? (
                                  <option value={editVal.categoria}>
                                    {cats.rotulo(editVal.categoria)}
                                  </option>
                                ) : null}
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
                              onChange={(e) =>
                                setEditVal({ ...editVal, descricao: e.target.value })
                              }
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
                            {f.tipo === "despesa" ? cats.rotulo(f.categoria) : "—"}
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
        </div>
      )}
    </div>
  );
}

/* --- Relatório financeiro por período (issue #12): faturamento e lucro
   por dia / mês / ano, a partir dos mesmos financial_entries do calendário.
   Exporta em PDF (janela de impressão) ou XLSX (exceljs). A agregação é
   pura — domain/relatorioFinanceiro.js; aqui é só tela + download. --- */
const GRANULARIDADES_RELATORIO = [
  { id: "mes", label: "Por mês" },
  { id: "dia", label: "Por dia" },
  { id: "ano", label: "Por ano" },
];

function rotuloPeriodoRelatorio(periodo, gran) {
  const p = String(periodo).split("-");
  if (gran === "ano") return p[0];
  if (gran === "mes") return `${MESES_PT[Number(p[1]) - 1] ?? p[1]}/${p[0]}`;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function RelatorioFinanceiroView() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [gran, setGran] = useState("mes");
  const [erro, setErro] = useState("");
  const [baixando, setBaixando] = useState(false);
  const finAno = useFinanceYear(ano);

  const relatorio = useMemo(
    () =>
      montarRelatorioFinanceiro(finAno.entries || [], {
        granularidade: gran,
        escopo: String(ano),
      }),
    [finAno.entries, gran, ano],
  );

  const exportar = async (formato) => {
    setErro("");
    try {
      emit(EVENTS.RELATORIO_FINANCEIRO_EXPORTADO, {
        formato,
        granularidade: gran,
        ano,
        linhas: relatorio.linhas.length,
      });
      if (formato === "pdf") {
        abrirRelatorioFinanceiroPDF(relatorio);
      } else {
        setBaixando(true);
        await baixarRelatorioFinanceiroXLSX(relatorio);
      }
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível gerar o relatório."));
    } finally {
      setBaixando(false);
    }
  };

  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);
  const semDados = !finAno.loading && relatorio.linhas.length === 0;

  return (
    <div className="px-6 md:px-10 pb-10 space-y-5">
      <Presence when={!!(erro || finAno.error)}>
        <div
          className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> {erro || "Erro ao carregar os lançamentos do ano."}
          </span>
          {erro && (
            <button type="button" onClick={() => setErro("")}>
              <X size={13} />
            </button>
          )}
        </div>
      </Presence>

      <Card className="anim-fadeUp">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs" style={{ color: C.inkSoft }}>
            Ano
            <Select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="mt-1 block"
            >
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs" style={{ color: C.inkSoft }}>
            Agrupar
            <Select value={gran} onChange={(e) => setGran(e.target.value)} className="mt-1 block">
              {GRANULARIDADES_RELATORIO.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => exportar("pdf")}
              disabled={finAno.loading || semDados}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
              style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
            >
              <Download size={13} /> Baixar PDF
            </button>
            <button
              type="button"
              onClick={() => exportar("xlsx")}
              disabled={finAno.loading || semDados || baixando}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg disabled:opacity-40"
              style={{ background: C.amberSoft, color: C.amber, fontWeight: 600 }}
            >
              <Download size={13} /> {baixando ? "Gerando…" : "Baixar Excel"}
            </button>
          </div>
        </div>
      </Card>

      {finAno.loading ? (
        <Card>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders estáticos
              <Skeleton key={i} height={34} rounded={8} />
            ))}
          </div>
        </Card>
      ) : semDados ? (
        <Card>
          <p className="text-sm" style={{ color: C.inkSoft }}>
            Nenhum lançamento em {ano}.
          </p>
        </Card>
      ) : (
        <FadeIn>
          <Card>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatCard
                label="Faturamento"
                value={fmtBRL(relatorio.totais.faturamento)}
                icon={Wallet}
                accent={C.green}
              />
              <StatCard
                label="Despesa"
                value={fmtBRL(relatorio.totais.despesa)}
                icon={TrendingUp}
                accent={C.red}
              />
              <StatCard
                label="Lucro"
                value={fmtBRL(relatorio.totais.lucro)}
                icon={Landmark}
                accent={relatorio.totais.lucro >= 0 ? C.green : C.red}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
                    <th className="px-3 py-2 font-medium">Período</th>
                    <th className="px-3 py-2 font-medium text-right">Faturamento</th>
                    <th className="px-3 py-2 font-medium text-right">Despesa</th>
                    <th className="px-3 py-2 font-medium text-right">Lucro</th>
                  </tr>
                </thead>
                <tbody style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {relatorio.linhas.map((l) => (
                    <tr
                      key={l.periodo}
                      className="row-hover border-t"
                      style={{ borderColor: C.borderSoft }}
                    >
                      <td className="px-3 py-2" style={{ fontFamily: "inherit", color: C.inkSoft }}>
                        {rotuloPeriodoRelatorio(l.periodo, gran)}
                      </td>
                      <td className="px-3 py-2 text-right">{fmtBRL(l.faturamento)}</td>
                      <td className="px-3 py-2 text-right">{fmtBRL(l.despesa)}</td>
                      <td
                        className="px-3 py-2 text-right"
                        style={{ color: l.lucro >= 0 ? C.green : C.red }}
                      >
                        {fmtBRL(l.lucro)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}

/* --- Contas a receber: passageiros com reserva confirmada e pagamento
   ainda pendente — ver database/18-receita-automatica-contas-a-receber.sql.
   A receita nasce sozinha (trigger); esta tela é só cobrança do que falta
   receber, com botão de cobrança direta pelo WhatsApp. --- */
function ContasReceberView({ pix }) {
  const { contas, loading, error, registrarAjuste, registrando, verComprovante } =
    useContasReceber();
  const pixKey = pix?.key || PIX_KEY;
  const [ajusteAberto, setAjusteAberto] = useState(null); // reservation_id em edição
  const [ajusteVal, setAjusteVal] = useState({ categoria: "estorno", valor: "", descricao: "" });
  const [erroAjuste, setErroAjuste] = useState("");

  const abrirComprovante = async (path) => {
    setErroAjuste("");
    try {
      const url = await verComprovante(path);
      if (url) window.open(url, "_blank", "noopener");
    } catch (e) {
      setErroAjuste(mensagemAmigavel(e, "Não foi possível abrir o comprovante."));
    }
  };

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
      setErroAjuste(mensagemAmigavel(e, "Não foi possível registrar o ajuste."));
    }
  };

  return (
    <div className="px-6 md:px-10 pb-10">
      {error && (
        <div
          className="mb-3 flex items-center gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <AlertTriangle size={14} />{" "}
          {mensagemAmigavel(error, "Erro ao carregar contas a receber.")}
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
                        {c.comprovante_recebido && (
                          <button
                            onClick={() => abrirComprovante(c.comprovante_path)}
                            disabled={!c.comprovante_path}
                            className="btn-press flex items-center gap-1 text-xs px-2 py-1 rounded-md disabled:opacity-40"
                            style={{ background: C.blueSoft, color: C.blue, fontWeight: 600 }}
                          >
                            <Receipt size={12} /> Ver comprovante
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {ajusteAberto === c.reservation_id && (
                    <tr
                      className="border-t"
                      style={{ borderColor: C.borderSoft, background: C.panel2 }}
                    >
                      <td colSpan={5} className="px-4 py-3">
                        {erroAjuste && (
                          <div className="mb-2 text-xs" style={{ color: C.red }}>
                            {erroAjuste}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={ajusteVal.categoria}
                            onChange={(e) =>
                              setAjusteVal({ ...ajusteVal, categoria: e.target.value })
                            }
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
                            onChange={(e) =>
                              setAjusteVal({ ...ajusteVal, descricao: e.target.value })
                            }
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
                  <td
                    colSpan={5}
                    className="text-center py-8 text-xs"
                    style={{ color: C.inkFaint }}
                  >
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
  const cats = useCategorias();

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
    const g = Object.fromEntries(cats.gruposGestao.map((x) => [x, 0]));
    for (const c of cats.gestao) g[c.grupo] = (g[c.grupo] || 0) + (porCategoria[c.slug] || 0);
    return g;
  }, [porCategoria, cats.gestao, cats.gruposGestao]);
  const totalGestao = cats.gruposGestao.reduce((s, g) => s + (totalPorGrupo[g] || 0), 0);
  const custoOperacao = despesaTotal - totalGestao;

  const run = async (fn, msgErro) => {
    setErro("");
    setAviso("");
    try {
      return await fn();
    } catch (e) {
      setErro(mensagemAmigavel(e, msgErro || "Não foi possível concluir."));
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
        <SubTabs
          value={aba}
          onChange={setAba}
          options={[
            { id: "resultado", label: "Resultado", Icon: TrendingUp },
            { id: "recorrentes", label: "Custos recorrentes", Icon: RefreshCw },
            { id: "lancamentos", label: "Lançamentos do mês", Icon: Receipt },
          ]}
        />
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
            cats={cats}
          />
        )}
        {aba === "recorrentes" && (
          <GestaoRecorrentes rec={rec} cats={cats} run={run} onGerar={gerarAgora} />
        )}
        {aba === "lancamentos" && (
          <GestaoLancamentos
            entries={entries}
            fin={fin}
            ano={ano}
            mes={mes}
            run={run}
            cats={cats}
          />
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
  cats,
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
          Tudo que entrou menos tudo que saiu — inclui combustível, manutenção e os custos
          recorrentes da empresa.
        </div>
        <LinhaDRE label="Receita bruta" valor={receita} forte />
        <LinhaDRE
          label="Custos de operação (combustível, manutenção, diárias…)"
          valor={custoOperacao}
          negativo
          indent
        />
        {cats.gruposGestao.map((g) => (
          <LinhaDRE key={g} label={g} valor={totalPorGrupo[g] || 0} negativo indent />
        ))}
        <LinhaDRE label="Resultado líquido" valor={resultado} forte />
      </Card>

      <Card>
        <div className="text-sm font-semibold mb-3">Custos empresariais por categoria</div>
        <div className="space-y-4">
          {cats.gruposGestao.map((g) => {
            const catsDoGrupo = cats.gestao.filter((c) => c.grupo === g);
            return (
              <div key={g}>
                <div
                  className="flex items-center justify-between text-xs font-semibold mb-1"
                  style={{ color: C.inkSoft }}
                >
                  <span>{g}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtBRL(totalPorGrupo[g] || 0)}
                  </span>
                </div>
                <div className="space-y-1">
                  {catsDoGrupo.map((c) => {
                    const v = porCategoria[c.slug] || 0;
                    return (
                      <div
                        key={c.slug}
                        className="flex items-center justify-between text-xs"
                        style={{ color: v > 0 ? C.ink : C.inkFaint }}
                      >
                        <span>{c.label}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {fmtBRL(v)}
                        </span>
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

function GestaoRecorrentes({ rec, cats, run, onGerar }) {
  const catInicial = cats.gestao[0]?.slug ?? "outro_recorrente";
  const [form, setForm] = useState({
    category: catInicial,
    label: "",
    amount: "",
    frequency: "mensal",
    dueDay: "5",
    dueMonth: "1",
    notes: "",
  });
  const [depBem, setDepBem] = useState("");
  const [depMeses, setDepMeses] = useState("60");
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});
  const [novaCat, setNovaCat] = useState(null); // { label, grupo } quando o form "nova categoria" está aberto

  const resetForm = () =>
    setForm({
      category: cats.gestao[0]?.slug ?? "outro_recorrente",
      label: "",
      amount: "",
      frequency: "mensal",
      dueDay: "5",
      dueMonth: "1",
      notes: "",
    });

  const add = () =>
    run(async () => {
      if (!form.label.trim() || !form.amount) return;
      await rec.addTemplate({
        category: form.category,
        label: form.label.trim(),
        amount: Number.parseFloat(form.amount),
        frequency: form.frequency,
        dueDay: clampDia(form.dueDay),
        dueMonth: form.frequency === "anual" ? Number.parseInt(form.dueMonth, 10) || 1 : null,
        notes: form.notes.trim() || null,
      });
      resetForm();
    }, "Não foi possível adicionar o custo recorrente.");

  const salvarEdicao = () =>
    run(async () => {
      await rec.updateTemplate(editId, {
        category: editVal.category || "outro_recorrente",
        label: editVal.label?.trim() || "Custo",
        amount: Number.parseFloat(editVal.amount) || 0,
        frequency: editVal.frequency,
        due_day: clampDia(editVal.due_day),
        due_month:
          editVal.frequency === "anual" ? Number.parseInt(editVal.due_month, 10) || 1 : null,
        notes: (editVal.notes ?? "").trim() || null,
      });
      setEditId(null);
    }, "Não foi possível salvar.");

  const toggleAtivo = (t) =>
    run(() => rec.updateTemplate(t.id, { active: !t.active }), "Não foi possível alterar.");
  const excluir = (t) => run(() => rec.removeTemplate(t.id), "Não foi possível excluir.");

  // seletor de categoria reutilizado no form de novo custo e na edição
  const onCategoriaChange = (setter, value) => {
    if (value === "__nova__") {
      setNovaCat({ label: "", grupo: cats.gruposGestao[0] || "Estrutura", aplicar: setter });
      return;
    }
    setter(value);
  };
  const criarCategoriaInline = () =>
    run(async () => {
      const r = await cats.criar({
        label: novaCat.label,
        grupo: novaCat.grupo || "Estrutura",
        kind: "gestao",
      });
      novaCat.aplicar?.(r.slug);
      setNovaCat(null);
    }, "Não foi possível criar a categoria.");

  const categoriaSelect = (value, onChange) => (
    <Select value={value} onChange={(e) => onCategoriaChange(onChange, e.target.value)}>
      {cats.gruposGestao.map((g) => (
        <optgroup key={g} label={g}>
          {cats.gestao
            .filter((c) => c.grupo === g)
            .map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
        </optgroup>
      ))}
      {!cats.existe(value) && value ? <option value={value}>{value}</option> : null}
      <option value="__nova__">➕ Nova categoria…</option>
    </Select>
  );

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
            {categoriaSelect(form.category, (v) => setForm({ ...form, category: v }))}
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
              Dia do mês (1–31)
            </label>
            <TextInput
              type="number"
              min="1"
              max="31"
              value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
            />
            <div className="text-[10px] mt-0.5" style={{ color: C.inkFaint }}>
              Em meses mais curtos, cai no último dia.
            </div>
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
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-xs" style={{ color: C.inkFaint }}>
              Observação (opcional)
            </label>
            <TextInput
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Ex.: contrato até dez/2027, reajuste anual…"
            />
          </div>
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
        {novaCat && (
          <div
            className="mt-3 flex flex-wrap items-end gap-2 rounded-lg p-3"
            style={{ background: C.panel2 }}
          >
            <div>
              <label className="text-[10px] block" style={{ color: C.inkFaint }}>
                Nome da nova categoria
              </label>
              <TextInput
                value={novaCat.label}
                onChange={(e) => setNovaCat({ ...novaCat, label: e.target.value })}
                placeholder="Ex.: Aluguel do galpão"
                className="w-48"
              />
            </div>
            <div>
              <label className="text-[10px] block" style={{ color: C.inkFaint }}>
                Grupo
              </label>
              <Select
                value={novaCat.grupo}
                onChange={(e) => setNovaCat({ ...novaCat, grupo: e.target.value })}
                className="w-40"
              >
                {[
                  ...new Set([
                    ...cats.gruposGestao,
                    "Pessoal",
                    "Impostos & Taxas",
                    "Veículo",
                    "Estrutura",
                  ]),
                ].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </div>
            <button
              type="button"
              disabled={!novaCat.label.trim() || cats.salvando}
              onClick={criarCategoriaInline}
              className="btn-press text-xs px-3 py-2 rounded-md disabled:opacity-40"
              style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
            >
              Criar e usar
            </button>
            <button
              type="button"
              onClick={() => setNovaCat(null)}
              className="btn-press text-xs px-3 py-2 rounded-md"
              style={{ background: C.panel, color: C.inkSoft }}
            >
              Cancelar
            </button>
          </div>
        )}
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
            {[...new Set(rec.templates.map((t) => cats.grupo(t.category)))].map((g) => {
              const ts = rec.templates.filter((t) => cats.grupo(t.category) === g);
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
                              <td className="px-3 py-2">
                                {categoriaSelect(editVal.category, (v) =>
                                  setEditVal({ ...editVal, category: v }),
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <TextInput
                                  value={editVal.label}
                                  onChange={(e) =>
                                    setEditVal({ ...editVal, label: e.target.value })
                                  }
                                />
                                <TextInput
                                  value={editVal.notes ?? ""}
                                  onChange={(e) =>
                                    setEditVal({ ...editVal, notes: e.target.value })
                                  }
                                  placeholder="observação"
                                  className="mt-1 text-xs"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <TextInput
                                  type="number"
                                  value={editVal.amount}
                                  onChange={(e) =>
                                    setEditVal({ ...editVal, amount: e.target.value })
                                  }
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
                                    max="31"
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
                                {cats.rotulo(t.category)}
                              </td>
                              <td className="px-3 py-2">
                                {t.label}
                                {t.notes && (
                                  <div className="text-[11px]" style={{ color: C.inkFaint }}>
                                    {t.notes}
                                  </div>
                                )}
                              </td>
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
                                        category: t.category,
                                        label: t.label,
                                        notes: t.notes ?? "",
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

      <GestaoCategorias cats={cats} run={run} />
    </>
  );
}

// Cadastro livre das categorias de custo empresarial (issue: liberdade
// pra criar). Renomear, reagrupar, pausar e remover (se ninguém usa).
function GestaoCategorias({ cats, run }) {
  const [nova, setNova] = useState({ label: "", grupo: "Estrutura" });
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});

  const criar = () =>
    run(async () => {
      if (!nova.label.trim()) return;
      await cats.criar({
        label: nova.label.trim(),
        grupo: nova.grupo.trim() || "Estrutura",
        kind: "gestao",
      });
      setNova({ label: "", grupo: nova.grupo });
    }, "Não foi possível criar a categoria.");

  const salvar = () =>
    run(async () => {
      await cats.editar(editId, {
        label: (editVal.label ?? "").trim() || "Categoria",
        grupo: (editVal.grupo ?? "").trim() || "Estrutura",
      });
      setEditId(null);
    }, "Não foi possível salvar a categoria.");

  const grupos = [
    ...new Set([...cats.gruposGestao, "Pessoal", "Impostos & Taxas", "Veículo", "Estrutura"]),
  ];

  return (
    <Card>
      <div className="text-sm font-semibold mb-1">Categorias de custo</div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Crie, renomeie ou reagrupe as categorias usadas nos custos recorrentes e no DRE. Uma
        categoria só pode ser removida quando nenhum custo ativo está usando ela.
      </p>
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div>
          <label className="text-[10px] block" style={{ color: C.inkFaint }}>
            Nova categoria
          </label>
          <TextInput
            value={nova.label}
            onChange={(e) => setNova({ ...nova, label: e.target.value })}
            placeholder="Ex.: Aluguel do galpão"
            className="w-52"
          />
        </div>
        <div>
          <label className="text-[10px] block" style={{ color: C.inkFaint }}>
            Grupo
          </label>
          <Select
            value={nova.grupo}
            onChange={(e) => setNova({ ...nova, grupo: e.target.value })}
            className="w-44"
          >
            {grupos.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={criar}
          disabled={!nova.label.trim() || cats.salvando}
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md disabled:opacity-40"
          style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
        >
          <Plus size={13} /> Criar
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
              <th className="px-3 py-1.5 font-medium">Categoria</th>
              <th className="px-3 py-1.5 font-medium">Grupo</th>
              <th className="px-3 py-1.5 font-medium" aria-label="ações" />
            </tr>
          </thead>
          <tbody>
            {cats.gestao.map((c) =>
              editId === c.id ? (
                <tr key={c.slug} style={{ background: C.panel2 }}>
                  <td className="px-3 py-2">
                    <TextInput
                      value={editVal.label}
                      onChange={(e) => setEditVal({ ...editVal, label: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={editVal.grupo}
                      onChange={(e) => setEditVal({ ...editVal, grupo: e.target.value })}
                    >
                      {grupos.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </Select>
                  </td>
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
                  key={c.slug}
                  className="row-hover border-t"
                  style={{ borderColor: C.borderSoft }}
                >
                  <td className="px-3 py-2">{c.label}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: C.inkSoft }}>
                    {c.grupo}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(c.id);
                          setEditVal({ label: c.label, grupo: c.grupo });
                        }}
                      >
                        <Pencil size={12} style={{ color: C.inkFaint }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => run(() => cats.remover(c.id), "Não foi possível remover.")}
                      >
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
    </Card>
  );
}

function GestaoLancamentos({ entries, fin, ano, mes, run, cats }) {
  const [novo, setNovo] = useState({
    category: "manutencao_corretiva",
    dia: "",
    valor: "",
    descricao: "",
  });
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});

  const doMes = entries.filter((e) => e.tipo === "despesa" && cats.slugsGestao.has(e.categoria));
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
      const v = validarValor(novo.valor, { min: 0.01 });
      if (!v.ok) throw new Error(v.erro);
      await fin.addEntry({
        entryDate: dataDoDia(novo.dia),
        type: "despesa",
        category: novo.category,
        amount: v.valor,
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
            {cats.gruposGestao.map((g) => (
              <optgroup key={g} label={g}>
                {cats.gestao
                  .filter((c) => c.grupo === g)
                  .map((c) => (
                    <option key={c.slug} value={c.slug}>
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
                        {cats.gestao.map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.label}
                          </option>
                        ))}
                        {!cats.slugsGestao.has(editVal.categoria) && editVal.categoria ? (
                          <option value={editVal.categoria}>{editVal.categoria}</option>
                        ) : null}
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
                    <td className="px-3 py-2 text-xs">{cats.rotulo(e.categoria)}</td>
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
                  <td
                    colSpan={6}
                    className="text-center py-8 text-xs"
                    style={{ color: C.inkFaint }}
                  >
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
      setErro(mensagemAmigavel(e, msg));
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
        {defaultVehicle && (
          <div
            className="aritur-hero relative overflow-hidden rounded-2xl border p-4 md:p-5 flex flex-wrap items-center justify-between gap-4"
            style={{ borderColor: C.brandDim }}
          >
            <HeroFX />
            <div className="relative flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(0,0,0,.35)" }}
              >
                <Bus size={20} style={{ color: "#fff" }} />
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: "1.15rem",
                    color: "#fff",
                  }}
                >
                  {defaultVehicle.name}
                </div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,.75)" }}>
                  {defaultVehicle.plate} · {defaultVehicle.capacity} lugares · veículo padrão
                </div>
              </div>
            </div>
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

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs" style={{ color: C.inkSoft }}>
            Ver totais por:
          </span>
          <SubTabs
            value={periodo}
            onChange={setPeriodo}
            options={[
              { id: "dia", label: "Hoje" },
              { id: "mes", label: "Este mês" },
              { id: "ano", label: "Este ano" },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard
            label={`Km (${periodo})`}
            value={totalKm.toLocaleString("pt-BR")}
            icon={Route}
          />
          <StatCard
            label="Combustível"
            value={fmtBRL(totalCombustivel)}
            icon={Fuel}
            accent={C.warn}
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

// Chip de lotação do dia — SEMPRE separado por direção (cada viagem tem
// `capacidade` lugares, nunca some as duas).
function HeroChipCap({ paxIda, paxVolta, capacidade }) {
  const lotIda = capacidade && paxIda >= capacidade;
  const lotVolta = capacidade && paxVolta >= capacidade;
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl px-3 py-2"
      style={{ background: "rgba(0,0,0,.38)", border: "1px solid rgba(255,255,255,.08)" }}
    >
      <Bus size={15} style={{ color: "#fff" }} />
      <span className="text-[11px]" style={{ color: "rgba(255,255,255,.7)" }}>
        Lotação
      </span>
      <span
        className="text-sm font-bold"
        style={{ color: lotIda ? C.red : "#fff", fontFamily: "'JetBrains Mono', monospace" }}
      >
        {paxIda}/{capacidade}
      </span>
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,.55)" }}>
        ida
      </span>
      <span style={{ color: "rgba(255,255,255,.25)" }}>·</span>
      <span
        className="text-sm font-bold"
        style={{ color: lotVolta ? C.red : "#fff", fontFamily: "'JetBrains Mono', monospace" }}
      >
        {paxVolta}/{capacidade}
      </span>
      <span className="text-[10px]" style={{ color: "rgba(255,255,255,.55)" }}>
        volta
      </span>
    </div>
  );
}

function DashboardHero({ paxIda, paxVolta, capacidade, faturamento, pendencias }) {
  const { profile } = useAuth();
  const nome = primeiroNome(profile);
  const h = new Date().getHours();
  const saud = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return (
    <div className="px-4 md:px-10 pt-5 md:pt-6 pb-4">
      <div
        className="relative rounded-2xl border overflow-hidden min-h-[260px] md:min-h-[300px]"
        style={{ borderColor: C.brandDim }}
      >
        <VideoBackdrop variant="hero" />
        <div className="relative p-5 md:p-7 max-w-xl lg:max-w-2xl">
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
          <p className="hero-t hero-t-2 text-sm mt-1" style={{ color: "rgba(255,255,255,.82)" }}>
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
            <HeroChipCap paxIda={paxIda} paxVolta={paxVolta} capacidade={capacidade} />
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
  // Lotação SEMPRE por direção — cada viagem tem `capacidade` lugares.
  const paxIdaHoje = doDia.filter((r) => r.direcao === "ida").reduce((s, r) => s + r.quantidade, 0);
  const paxVoltaHoje = doDia
    .filter((r) => r.direcao === "volta")
    .reduce((s, r) => s + r.quantidade, 0);
  const vagasIdaHoje = Math.max(0, capacidade - paxIdaHoje);
  const vagasVoltaHoje = Math.max(0, capacidade - paxVoltaHoje);
  const ocupIda = capacidade ? Math.round((paxIdaHoje / capacidade) * 100) : 0;
  const ocupVolta = capacidade ? Math.round((paxVoltaHoje / capacidade) * 100) : 0;
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
  const despesaHoje = financeiro
    .filter((f) => f.data === hoje && f.tipo === "despesa")
    .reduce((s, f) => s + f.valor, 0);
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
  const ocupacaoMedia = Math.round((ocupIda + ocupVolta) / 2);
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
  return (
    <div>
      <div className="flex justify-end px-4 md:px-10 pt-3 -mb-1">
        <SinoNotificacoes />
      </div>
      <DashboardHero
        paxIda={paxIdaHoje}
        paxVolta={paxVoltaHoje}
        capacidade={capacidade}
        faturamento={receitaHoje}
        pendencias={pendentesHoje}
      />
      <div className="px-6 md:px-10 pb-10 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 stagger">
          <StatCard
            label="Passageiros hoje"
            value={passageirosHoje}
            hint={`ida ${paxIdaHoje} · volta ${paxVoltaHoje}`}
            icon={Users}
          />
          <StatCard
            label="Vagas hoje"
            value={`${vagasIdaHoje} / ${vagasVoltaHoje}`}
            hint="livres na ida · na volta"
            icon={Bus}
            accent={C.green}
          />
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
            label="Lucro hoje"
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
            label="Ocupação hoje"
            value={`${ocupacaoMedia}%`}
            hint={`ida ${ocupIda}% · volta ${ocupVolta}%`}
            icon={CheckCircle2}
            accent={C.blue}
          />
        </div>
        <div className="anim-fadeUp">
          <Suspense fallback={<ChartsSkeleton />}>
            <SevenDayCharts data={ultimos7} />
          </Suspense>
        </div>
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
      </div>
    </div>
  );
}

/* ============================= 8. SISTEMA ============================= */
const DIAG_KIND_LABEL = {
  overbooking: "Overbooking (passageiros acima da capacidade)",
  ponto_invalido: "Ponto de embarque removido ou não informado",
  sem_telefone: "Reserva ativa sem telefone de contato",
  quantidade_dessincronizada: "Quantidade fora de sincronia com os passageiros",
  sem_viagem: "Passagem confirmada sem viagem associada",
  pagamento_ausente: "Passagem confirmada há +1 dia sem registro de pagamento",
};

// Cidades da rota (issue #6): atendidas (São Luís/Cantanhede/Pirapemas) e
// intermediárias (onde não paramos → reserva pendente). settings.served_cities
// / settings.intermediate_cities. (definição estava faltando no PR #83)
function ListaChips({ titulo, ajuda, itens, onSalvar, salvando }) {
  const [novo, setNovo] = useState("");
  const norm = (s) => normalizar(s);
  const add = () => {
    const v = norm(novo);
    if (v && !itens.includes(v)) onSalvar([...itens, v]);
    setNovo("");
  };
  const remove = (c) => onSalvar(itens.filter((x) => x !== c));
  return (
    <div>
      <div className="text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>
        {titulo}
      </div>
      <div className="text-[11px] mb-2" style={{ color: C.inkFaint }}>
        {ajuda}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {itens.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full capitalize"
            style={{ background: C.panel2, color: C.inkSoft }}
          >
            {c}
            <button
              type="button"
              onClick={() => remove(c)}
              disabled={salvando}
              aria-label={`remover ${c}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {itens.length === 0 && (
          <span className="text-xs" style={{ color: C.inkFaint }}>
            (vazio)
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <TextInput
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Adicionar cidade…"
          className="w-48"
        />
        <button
          type="button"
          onClick={add}
          disabled={!norm(novo) || salvando}
          className="btn-press text-xs px-3 py-2 rounded-md disabled:opacity-40"
          style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

function SistemaCidades() {
  const s = useSettings();
  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Route size={16} style={{ color: C.amber }} /> Cidades da rota
      </div>
      <p className="text-xs mb-4" style={{ color: C.inkSoft }}>
        No fluxo de reserva, embarque/desembarque que menciona uma cidade <b>intermediária</b> faz a
        reserva nascer <b>pendente</b> (não ocupa vaga, a equipe confirma). As <b>atendidas</b> são
        a rota normal. O bot do WhatsApp usa as mesmas listas.
      </p>
      {s.error && (
        <div
          className="mb-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          {mensagemAmigavel(s.error, "Erro ao carregar as configurações.")}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-6">
        <ListaChips
          titulo="Cidades atendidas"
          ajuda="A rota para nessas cidades."
          itens={s.servedCities}
          onSalvar={s.setServedCities}
          salvando={s.saving}
        />
        <ListaChips
          titulo="Cidades intermediárias"
          ajuda="No caminho, mas não paramos — vira reserva pendente."
          itens={s.intermediateCities}
          onSalvar={s.setIntermediateCities}
          salvando={s.saving}
        />
      </div>
    </Card>
  );
}

// Preço de "Buscar em Casa" por bairro — tabela neighborhood_pricing,
// editável (database/23-precos-bairro-editaveis.sql).
// Baldes de desembarque (database/24-baldes-desembarque.sql) — rótulo,
// campo de detalhe e ordem, editáveis. O `code` novo não é adivinhado
// sozinho pela inferência por palavra-chave; a classificação manual do
// motorista prevalece.
function SistemaBaldes() {
  const dropoff = useDropoff();
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState({
    direction: "ida",
    label: "",
    detailLabel: "",
    detailRequired: false,
  });
  const [editId, setEditId] = useState(null);
  const [ev, setEv] = useState({});

  const run = async (fn, msg) => {
    setErro("");
    try {
      await fn();
      return true;
    } catch (e) {
      setErro(mensagemAmigavel(e, msg || "Não foi possível concluir."));
      return false;
    }
  };
  const criar = () =>
    run(async () => {
      if (!novo.label.trim()) return;
      await dropoff.criar({
        direction: novo.direction,
        label: novo.label.trim(),
        detailLabel: novo.detailLabel.trim() || "Ponto de referência",
        detailRequired: novo.detailRequired,
        sortOrder: 100 + dropoff.porDirecao(novo.direction).length * 10,
      });
      setNovo({ ...novo, label: "", detailLabel: "" });
    }, "Não foi possível criar o local.");
  const salvar = () =>
    run(async () => {
      await dropoff.editar(editId, {
        label: (ev.label ?? "").trim() || "Local",
        detail_label: (ev.detail_label ?? "").trim() || "Ponto de referência",
        detail_placeholder: ev.detail_placeholder ?? "",
        detail_required: !!ev.detail_required,
        sort_order: Number.parseInt(ev.sort_order, 10) || 100,
      });
      setEditId(null);
    }, "Não foi possível salvar.");

  const linha = (b) =>
    editId === b.id ? (
      <tr key={b.id} style={{ background: C.panel2 }}>
        <td className="px-2 py-1.5">
          <TextInput
            value={ev.label}
            onChange={(e) => setEv({ ...ev, label: e.target.value })}
            className="text-xs"
          />
        </td>
        <td className="px-2 py-1.5">
          <TextInput
            value={ev.detail_label}
            onChange={(e) => setEv({ ...ev, detail_label: e.target.value })}
            className="text-xs"
            placeholder="Rótulo do campo de detalhe"
          />
          <TextInput
            value={ev.detail_placeholder}
            onChange={(e) => setEv({ ...ev, detail_placeholder: e.target.value })}
            className="text-xs mt-1"
            placeholder="Placeholder (ex.: Km, o que tem perto)"
          />
        </td>
        <td className="px-2 py-1.5 text-center">
          <input
            type="checkbox"
            checked={!!ev.detail_required}
            onChange={(e) => setEv({ ...ev, detail_required: e.target.checked })}
          />
        </td>
        <td className="px-2 py-1.5 w-14">
          <TextInput
            type="number"
            value={ev.sort_order}
            onChange={(e) => setEv({ ...ev, sort_order: e.target.value })}
            className="text-xs w-14"
          />
        </td>
        <td className="px-2 py-1.5">
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
      <tr key={b.id} className="row-hover border-t" style={{ borderColor: C.borderSoft }}>
        <td className="px-2 py-1.5">{b.label}</td>
        <td className="px-2 py-1.5 text-xs" style={{ color: C.inkSoft }}>
          {b.detail_label}
        </td>
        <td className="px-2 py-1.5 text-center text-xs">{b.detail_required ? "sim" : "—"}</td>
        <td className="px-2 py-1.5 text-xs" style={{ color: C.inkFaint }}>
          {b.sort_order}
        </td>
        <td className="px-2 py-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditId(b.id);
                setEv({
                  label: b.label,
                  detail_label: b.detail_label,
                  detail_placeholder: b.detail_placeholder,
                  detail_required: b.detail_required,
                  sort_order: String(b.sort_order),
                });
              }}
            >
              <Pencil size={12} style={{ color: C.inkFaint }} />
            </button>
            <button
              type="button"
              onClick={() => run(() => dropoff.remover(b.id), "Não foi possível remover.")}
            >
              <X size={13} style={{ color: C.inkFaint }} />
            </button>
          </div>
        </td>
      </tr>
    );

  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <MapPin size={16} style={{ color: C.amber }} /> Locais de desembarque
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        O passo "Onde você vai ficar" da reserva e os grupos da rota do motorista. Renomeie, defina
        se o detalhe é obrigatório e a ordem em que o ônibus alcança cada local.
      </p>
      {erro && (
        <div
          className="mb-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          {erro}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <Select
          value={novo.direction}
          onChange={(e) => setNovo({ ...novo, direction: e.target.value })}
          className="w-24"
        >
          <option value="ida">Ida</option>
          <option value="volta">Volta</option>
        </Select>
        <TextInput
          value={novo.label}
          onChange={(e) => setNovo({ ...novo, label: e.target.value })}
          placeholder="Nome do local"
          className="w-44"
        />
        <TextInput
          value={novo.detailLabel}
          onChange={(e) => setNovo({ ...novo, detailLabel: e.target.value })}
          placeholder="Rótulo do detalhe"
          className="w-44"
        />
        <label className="text-xs flex items-center gap-1" style={{ color: C.inkSoft }}>
          <input
            type="checkbox"
            checked={novo.detailRequired}
            onChange={(e) => setNovo({ ...novo, detailRequired: e.target.checked })}
          />
          detalhe obrigatório
        </label>
        <button
          type="button"
          onClick={criar}
          disabled={!novo.label.trim() || dropoff.salvando}
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md disabled:opacity-40"
          style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
        >
          <Plus size={13} /> Criar
        </button>
      </div>
      {["ida", "volta"].map((dir) => (
        <div key={dir} className="mb-3">
          <div className="text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>
            {dir === "ida" ? "Ida (São Luís → Pirapemas)" : "Volta (Pirapemas → São Luís)"}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
                  <th className="px-2 py-1 font-medium">Local</th>
                  <th className="px-2 py-1 font-medium">Campo de detalhe</th>
                  <th className="px-2 py-1 font-medium">Obrig.</th>
                  <th className="px-2 py-1 font-medium">Ordem</th>
                  <th className="px-2 py-1 font-medium" aria-label="ações" />
                </tr>
              </thead>
              <tbody>{dropoff.porDirecao(dir).map(linha)}</tbody>
            </table>
          </div>
        </div>
      ))}
    </Card>
  );
}

function SistemaBairros() {
  const bairros = useBairros();
  const [novo, setNovo] = useState({ nome: "", preco: "80" });
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [precoEdit, setPrecoEdit] = useState({}); // id -> valor sendo digitado

  const salvar = async (nome, preco) => {
    setErro("");
    try {
      await bairros.salvar(nome, Number.parseFloat(preco));
      return true;
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar."));
      return false;
    }
  };
  const adicionar = async () => {
    if (!novo.nome.trim() || !novo.preco) return;
    if (await salvar(novo.nome.trim(), novo.preco)) setNovo({ nome: "", preco: novo.preco });
  };
  const remover = async (b) => {
    setErro("");
    try {
      await bairros.remover(b.id);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível remover."));
    }
  };

  const filtro = normalizar(busca);
  const lista = bairros.bairros
    .filter((b) => !filtro || normalizar(b.neighborhood).includes(filtro))
    .sort(
      (a, b) =>
        Number(a.price) - Number(b.price) || a.neighborhood.localeCompare(b.neighborhood, "pt-BR"),
    );

  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <MapPin size={16} style={{ color: C.amber }} /> Preços por bairro (Buscar em Casa)
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Quando o cliente escolhe "Buscar em Casa", o valor da passagem vem daqui pelo nome do
        bairro. Bairro não cadastrado → a reserva vai para confirmação manual.{" "}
        {bairros.bairros.length} bairros.
      </p>

      {erro && (
        <div
          className="mb-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          {erro}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label className="text-[10px] block" style={{ color: C.inkFaint }}>
            Bairro
          </label>
          <TextInput
            value={novo.nome}
            onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
            placeholder="Ex.: Cohama"
            className="w-48"
          />
        </div>
        <div>
          <label className="text-[10px] block" style={{ color: C.inkFaint }}>
            Valor (R$)
          </label>
          <TextInput
            type="number"
            value={novo.preco}
            onChange={(e) => setNovo({ ...novo, preco: e.target.value })}
            className="w-24"
          />
        </div>
        <button
          type="button"
          onClick={adicionar}
          disabled={!novo.nome.trim() || !novo.preco || bairros.salvando}
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md disabled:opacity-40"
          style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
        >
          <Plus size={13} /> Adicionar / atualizar
        </button>
      </div>

      <TextInput
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar bairro…"
        className="mb-2"
      />
      <div className="overflow-x-auto" style={{ maxHeight: 360, overflowY: "auto" }}>
        <table className="w-full text-sm">
          <tbody>
            {lista.map((b) => (
              <tr key={b.id} className="row-hover border-t" style={{ borderColor: C.borderSoft }}>
                <td className="px-2 py-1.5">{b.neighborhood}</td>
                <td className="px-2 py-1.5 w-28">
                  <TextInput
                    type="number"
                    defaultValue={String(b.price)}
                    value={precoEdit[b.id] ?? undefined}
                    onChange={(e) => setPrecoEdit({ ...precoEdit, [b.id]: e.target.value })}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v && Number(v) !== Number(b.price)) salvar(b.neighborhood, v);
                      setPrecoEdit((p) =>
                        Object.fromEntries(Object.entries(p).filter(([k]) => k !== b.id)),
                      );
                    }}
                    className="w-20 text-xs py-1"
                  />
                </td>
                <td className="px-2 py-1.5 w-8">
                  <button
                    type="button"
                    onClick={() => remover(b)}
                    aria-label={`remover ${b.neighborhood}`}
                  >
                    <X size={13} style={{ color: C.inkFaint }} />
                  </button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td className="px-2 py-4 text-xs" style={{ color: C.inkFaint }}>
                  {bairros.loading ? "carregando…" : "Nenhum bairro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Equipe / logins (database/25-usuarios-equipe.sql + Edge Function
// `create-user`). Só admin enxerga de verdade (RLS). Criar um LOGIN novo
// precisa do Auth (service_role) → vai pela Edge Function; editar papel /
// nome / telefone / ativo é direto na tabela ou via RPC com guarda.
const PAPEIS_EQUIPE = [
  { v: "admin", label: "Admin (sócio)" },
  { v: "atendente", label: "Atendente" },
  { v: "motorista", label: "Motorista" },
  { v: "financeiro", label: "Financeiro" },
];
const papelLabel = (v) => PAPEIS_EQUIPE.find((p) => p.v === v)?.label || v;

function senhaTemporaria() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i += 1) s += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return s;
}

function SistemaEquipe() {
  const { profile } = useAuth();
  const equipe = useUsersList();
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [editId, setEditId] = useState(null);
  const [ev, setEv] = useState({});
  const [novo, setNovo] = useState({ email: "", name: "", role: "atendente", password: "" });

  const run = async (fn, msgFalha) => {
    setErro("");
    setOk("");
    try {
      await fn();
      return true;
    } catch (e) {
      setErro(mensagemAmigavel(e, msgFalha || "Não foi possível concluir."));
      return false;
    }
  };

  const criar = () =>
    run(async () => {
      const email = novo.email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido.");
      if (!novo.name.trim()) throw new Error("Informe o nome.");
      if (novo.password.length < 8) throw new Error("A senha temporária precisa de 8+ caracteres.");
      await equipe.createUser({
        email,
        name: novo.name.trim(),
        role: novo.role,
        password: novo.password,
      });
      setOk(
        `Login criado para ${email}. Senha temporária: ${novo.password} — passe para a pessoa; ela troca depois.`,
      );
      setNovo({ email: "", name: "", role: "atendente", password: "" });
    }, "Não foi possível criar o login.");

  const salvar = () =>
    run(async () => {
      await equipe.updateUser(editId, {
        name: (ev.name ?? "").trim() || "—",
        phone: (ev.phone ?? "").trim() || null,
        role: ev.role,
      });
      setEditId(null);
    }, "Não foi possível salvar.");

  const linha = (u) => {
    const euMesmo = u.id === profile?.id;
    if (editId === u.id) {
      return (
        <tr key={u.id} style={{ background: C.panel2 }}>
          <td className="px-2 py-1.5">
            <TextInput
              value={ev.name}
              onChange={(e) => setEv({ ...ev, name: e.target.value })}
              className="text-xs"
            />
          </td>
          <td className="px-2 py-1.5">
            <TextInput
              value={ev.phone}
              onChange={(e) => setEv({ ...ev, phone: e.target.value })}
              placeholder="(98) 9…"
              className="text-xs"
            />
          </td>
          <td className="px-2 py-1.5">
            <Select
              value={ev.role}
              onChange={(e) => setEv({ ...ev, role: e.target.value })}
              className="text-xs"
              disabled={euMesmo}
            >
              {PAPEIS_EQUIPE.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </Select>
          </td>
          <td className="px-2 py-1.5 text-center text-xs" style={{ color: C.inkFaint }}>
            {u.active ? "ativo" : "inativo"}
          </td>
          <td className="px-2 py-1.5">
            <div className="flex gap-2">
              <button type="button" onClick={salvar} aria-label="salvar">
                <Save size={13} style={{ color: C.green }} />
              </button>
              <button type="button" onClick={() => setEditId(null)} aria-label="cancelar">
                <X size={13} style={{ color: C.inkFaint }} />
              </button>
            </div>
          </td>
        </tr>
      );
    }
    return (
      <tr key={u.id} className="row-hover border-t" style={{ borderColor: C.borderSoft }}>
        <td className="px-2 py-1.5">
          {u.name}
          {euMesmo && (
            <span className="ml-1 text-[10px]" style={{ color: C.inkFaint }}>
              (você)
            </span>
          )}
        </td>
        <td className="px-2 py-1.5 text-xs" style={{ color: C.inkSoft }}>
          {u.phone || "—"}
        </td>
        <td className="px-2 py-1.5 text-xs">{papelLabel(u.role)}</td>
        <td className="px-2 py-1.5 text-center">
          <button
            type="button"
            onClick={() =>
              run(() => equipe.setActive(u.id, !u.active), "Não foi possível alterar.")
            }
            disabled={euMesmo || equipe.salvando}
            className="text-xs px-2 py-0.5 rounded-full disabled:opacity-40"
            style={{
              background: u.active ? C.greenSoft : C.panel2,
              color: u.active ? C.green : C.inkFaint,
            }}
          >
            {u.active ? "ativo" : "inativo"}
          </button>
        </td>
        <td className="px-2 py-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={`editar ${u.name}`}
              onClick={() => {
                setEditId(u.id);
                setEv({ name: u.name, phone: u.phone || "", role: u.role });
              }}
            >
              <Pencil size={12} style={{ color: C.inkFaint }} />
            </button>
            <button
              type="button"
              aria-label={`remover ${u.name}`}
              disabled={euMesmo || equipe.salvando}
              onClick={() => {
                if (window.confirm(`Remover ${u.name} da equipe? O login deixa de funcionar.`)) {
                  run(() => equipe.removeUser(u.id), "Não foi possível remover.");
                }
              }}
              className="disabled:opacity-40"
            >
              <UserX size={13} style={{ color: C.red }} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Users size={16} style={{ color: C.amber }} /> Equipe e logins
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Quem entra no sistema e com qual papel. Desativar bloqueia o acesso sem apagar o histórico.
        O banco não deixa você remover/desativar a si mesmo nem o último admin ativo.
      </p>
      {erro && (
        <div
          className="mb-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          {erro}
        </div>
      )}
      {ok && (
        <div
          className="mb-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.greenSoft, color: C.green }}
        >
          {ok}
        </div>
      )}

      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
              <th className="px-2 py-1 font-medium">Nome</th>
              <th className="px-2 py-1 font-medium">Telefone</th>
              <th className="px-2 py-1 font-medium">Papel</th>
              <th className="px-2 py-1 font-medium text-center">Acesso</th>
              <th className="px-2 py-1 font-medium" aria-label="ações" />
            </tr>
          </thead>
          <tbody>{equipe.users.map(linha)}</tbody>
        </table>
        {equipe.users.length === 0 && !equipe.loading && (
          <div className="text-xs px-2 py-3" style={{ color: C.inkFaint }}>
            Nenhum usuário — ou você não é admin.
          </div>
        )}
      </div>

      <div className="pt-3 border-t" style={{ borderColor: C.borderSoft }}>
        <div
          className="text-xs font-semibold mb-2 flex items-center gap-1.5"
          style={{ color: C.inkSoft }}
        >
          <UserCog size={13} /> Criar um login novo
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <TextInput
            type="email"
            value={novo.email}
            onChange={(e) => setNovo({ ...novo, email: e.target.value })}
            placeholder="e-mail"
            className="w-52"
          />
          <TextInput
            value={novo.name}
            onChange={(e) => setNovo({ ...novo, name: e.target.value })}
            placeholder="nome"
            className="w-40"
          />
          <Select
            value={novo.role}
            onChange={(e) => setNovo({ ...novo, role: e.target.value })}
            className="w-36"
          >
            {PAPEIS_EQUIPE.map((p) => (
              <option key={p.v} value={p.v}>
                {p.label}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-1">
            <TextInput
              value={novo.password}
              onChange={(e) => setNovo({ ...novo, password: e.target.value })}
              placeholder="senha temporária"
              className="w-40"
            />
            <button
              type="button"
              onClick={() => setNovo({ ...novo, password: senhaTemporaria() })}
              className="btn-press text-xs px-2 py-2 rounded-md shrink-0"
              style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
            >
              gerar
            </button>
          </div>
          <button
            type="button"
            onClick={criar}
            disabled={equipe.salvando}
            className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md disabled:opacity-40"
            style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
          >
            <Plus size={13} /> Criar login
          </button>
        </div>
        <p className="text-[11px] mt-2" style={{ color: C.inkFaint }}>
          A pessoa entra com esse e-mail e a senha temporária (já confirmado, sem e-mail de
          ativação) e troca a senha depois no primeiro acesso.
        </p>
      </div>
    </Card>
  );
}

// Preferência de movimento (por dispositivo). "Automático" respeita o
// ajuste de "reduzir animações" do sistema; "Ligado" força os heros a
// animar mesmo assim. Ver src/lib/motion.js.
// Erros recentes do app (database/36) — o admin vê o que os usuários
// viram, com detalhe técnico. Alimentado por logTecnico() em lib/erros.js.
function SistemaErros() {
  const { erros, loading, error, recarregar } = useErrorLog();
  return (
    <Card className="anim-fadeUp">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle size={16} style={{ color: C.amber }} /> Erros recentes do app
        </div>
        <button
          type="button"
          onClick={recarregar}
          className="btn-press text-[11px] px-2 py-1 rounded-md"
          style={{ background: C.panel2, color: C.inkSoft }}
        >
          <RefreshCw size={12} className="inline mr-1" />
          Atualizar
        </button>
      </div>
      {error && (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          {mensagemAmigavel(error, "Não foi possível carregar o log.")}
        </div>
      )}
      {!error && loading && erros.length === 0 && (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          carregando…
        </div>
      )}
      {!error && !loading && erros.length === 0 && (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          Nenhum erro registrado nos últimos 30 dias. 🎉
        </div>
      )}
      {erros.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left" style={{ color: C.inkFaint }}>
                <th className="py-1 pr-3 font-medium">Quando</th>
                <th className="py-1 pr-3 font-medium">Código</th>
                <th className="py-1 font-medium">Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {erros.map((e) => (
                <tr key={e.id} className="border-t" style={{ borderColor: C.borderSoft }}>
                  <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: C.inkSoft }}>
                    {fmtDataHora(e.at)}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: C.inkFaint }}>
                    {e.code || "—"}
                  </td>
                  <td
                    className="py-1.5"
                    style={{ color: C.ink, overflowWrap: "anywhere" }}
                    title={e.context ? JSON.stringify(e.context) : ""}
                  >
                    {e.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function MovimentoControl() {
  const [pref, setPref] = useState(getMotionPref());
  useEffect(() => watchSystemMotion(), []);
  const efetivo = resolveMotion(pref);
  const mudar = (v) => {
    setPref(v);
    setMotionPref(v);
  };
  const OPCOES = [
    { v: "auto", label: "Automático", desc: "segue o sistema" },
    { v: "on", label: "Ligado", desc: "sempre anima" },
    { v: "off", label: "Desligado", desc: "sem movimento" },
  ];
  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Sparkles size={16} style={{ color: C.amber }} /> Movimento e animações
      </div>
      <p className="text-xs mb-1" style={{ color: C.inkSoft }}>
        Heros, estrada e ônibus animados. No <b>Automático</b> o app respeita o ajuste de{" "}
        <i>reduzir animações</i> do seu computador — se estiver ligado lá, as decorações ficam
        paradas. Escolha <b>Ligado</b> para animar mesmo assim.
      </p>
      {pref === "auto" && efetivo === "off" && (
        <p className="text-xs mb-2" style={{ color: C.warn }}>
          Seu sistema está pedindo menos movimento agora — por isso está tudo parado. Coloque em{" "}
          <b>Ligado</b> para reativar só neste dispositivo.
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        {OPCOES.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => mudar(o.v)}
            className="btn-press text-xs px-3 py-2 rounded-lg font-medium"
            style={{
              background: pref === o.v ? C.brand : C.panel2,
              color: pref === o.v ? C.onBrand : C.ink,
              border: `1px solid ${pref === o.v ? C.brand : C.border}`,
            }}
          >
            {o.label} <span style={{ opacity: 0.65 }}>· {o.desc}</span>
          </button>
        ))}
      </div>
      <div className="text-[11px] mt-2" style={{ color: C.inkFaint }}>
        Vale só neste dispositivo · agora: <b>{efetivo === "on" ? "animando" : "parado"}</b>
      </div>
    </Card>
  );
}

function SistemaTab({ reservas, capacidade, cfg, modoAtendimento, onSetModo }) {
  const [diag, setDiag] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [novoPontoNome, setNovoPontoNome] = useState("");
  const [erro, setErro] = useState("");
  const catchErr = (p, msg) => p?.catch?.((e) => setErro(mensagemAmigavel(e, msg)));
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
  // Diagnóstico no servidor (issue #9) — mesmas checagens do
  // domain/diagnostics.js, mas no banco: roda de 6/6h por pg_cron e também
  // sob demanda aqui. Só reporta/alerta (a sincronia de quantity já é
  // garantida pela trigger trg_sync_quantity).
  const serverDiag = useDiagnostics();
  const [diagServidor, setDiagServidor] = useState(null);
  const rodarDiagnosticoServidor = async () => {
    setErro("");
    try {
      const resumo = await serverDiag.rodar();
      setDiagServidor({ ...resumo, quando: new Date().toLocaleString("pt-BR") });
      emit(EVENTS.DIAGNOSTICO_EXECUTADO, {
        origem: "sistema_tab",
        novos_alertas: resumo.novos_alertas,
        por_tipo: resumo.por_tipo,
      });
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível rodar o diagnóstico no servidor."));
    }
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
      setErro(mensagemAmigavel(e, "Não foi possível gerar o backup."));
    }
  };
  const abrirBackupDoHistorico = async (id) => {
    setErro("");
    try {
      setUltimoBackup(await backup.buscarPayload(id));
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível abrir esse backup."));
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
      setErro(mensagemAmigavel(e, "Não foi possível exportar o backup."));
    } finally {
      setFormatoEmProcesso(null);
    }
  };
  const trocarModo = (v) => {
    setErro("");
    onSetModo(v).catch((e) =>
      setErro(mensagemAmigavel(e, "Não foi possível trocar o modo (só admin).")),
    );
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
      <div className="px-4 md:px-10 pt-5 md:pt-6 pb-4">
        <div
          className="aritur-hero relative overflow-hidden rounded-2xl border p-4 md:p-5 flex items-center justify-between gap-3"
          style={{ borderColor: C.brandDim }}
        >
          <HeroFX />
          <div className="relative flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(0,0,0,.35)" }}
            >
              <ShieldCheck size={19} style={{ color: "#fff" }} />
            </span>
            <div>
              <h1
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.3rem",
                  color: "#fff",
                }}
              >
                Sistema
              </h1>
              <p className="text-xs" style={{ color: "rgba(255,255,255,.78)" }}>
                Fluxo, valores, atendimento, backup e correções automáticas.
              </p>
            </div>
          </div>
          {cfg.saving && (
            <span className="relative text-xs" style={{ color: "rgba(255,255,255,.8)" }}>
              salvando…
            </span>
          )}
        </div>
      </div>
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
        <MovimentoControl />

        <SistemaErros />

        <SistemaEquipe />

        <SistemaCidades />

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
            abaixo; os demais usam o valor fixo aqui. Vale para todos os sócios.
          </div>
        </Card>

        <SistemaBairros />

        <SistemaBaldes />

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

          <div className="mt-4 pt-3 border-t" style={{ borderColor: C.borderSoft }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold" style={{ color: C.inkSoft }}>
                Job no servidor
              </div>
              <button
                type="button"
                onClick={rodarDiagnosticoServidor}
                disabled={serverDiag.rodando}
                className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
              >
                <RefreshCw size={12} className={serverDiag.rodando ? "animate-spin" : ""} />{" "}
                {serverDiag.rodando ? "Rodando…" : "Rodar no servidor agora"}
              </button>
            </div>
            <p className="text-xs mb-2" style={{ color: C.inkFaint }}>
              Roda sozinho de 6 em 6h. Overbooking, ponto removido, telefone ausente, reserva sem
              viagem e pagamento em aberto viram alerta interno (sem duplicar nas 24h).
            </p>
            {diagServidor && (
              <div className="anim-slideDown text-xs mb-2" style={{ color: C.inkSoft }}>
                Última execução: {diagServidor.quando} — {diagServidor.novos_alertas} novo(s)
                alerta(s).
              </div>
            )}
            <div className="space-y-1.5">
              {serverDiag.achados.length === 0 && !serverDiag.loading && (
                <div className="text-xs flex items-center gap-1.5" style={{ color: C.green }}>
                  <Check size={13} /> Servidor não encontrou pendências.
                </div>
              )}
              {serverDiag.achados.map((a, i) => (
                <div
                  key={`${a.kind}-${a.reservation_id ?? a.trip_id ?? i}`}
                  className="text-xs rounded-md px-2 py-1.5 flex items-center gap-1.5"
                  style={{ background: C.warnSoft, color: C.warn }}
                >
                  <AlertTriangle size={12} /> {DIAG_KIND_LABEL[a.kind] || a.kind}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Download size={15} style={{ color: C.blue }} /> Backup completo
          </div>
          <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
            Gerado pelo servidor com <b>todas</b> as tabelas — clientes, reservas, viagens,
            veículos, motoristas, combustível, manutenções, financeiro, configurações, usuários e
            logs — nunca só o que está carregado na tela. Um backup automático roda sozinho todo dia
            às 3h (São Luís) e fica guardado por 30 dias.
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
