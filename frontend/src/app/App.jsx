import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bus,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
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
  Package,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  StopCircle,
  Sunrise,
  Truck,
  UserCog,
  Users,
  Wallet,
  Wifi,
  X,
  X as XIcon,
} from "lucide-react";
import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useEnsureTrips } from "../hooks/useEnsureTrips.js";
import { useGlobalSearch } from "../hooks/useGlobalSearch.js";
import { useExpenseCategories } from "../hooks/useExpenseCategories.js";
import { useDropoffAreas } from "../hooks/useDropoffAreas.js";
import { useNeighborhoodPricing } from "../hooks/useNeighborhoodPricing.js";
import { useReservationsWindow } from "../hooks/useReservations.js";
import { useRouteConfig } from "../hooks/useRouteConfig.js";
import { useSettings } from "../hooks/useSettings.js";
import { useNotifications } from "../hooks/useNotifications.js";
import { usePendencias } from "../hooks/usePendencias.js";
import { useTrips } from "../hooks/useTrips.js";
import { useVehicles } from "../hooks/useVehicles.js";
import { useCustomerLookup } from "../hooks/useCustomerLookup.js";
import { foraDaAreaPadrao } from "../domain/cidades.js";
import { parseAnotacaoRapida } from "../domain/anotacaoRapida.js";
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
import { EVENTS, emit } from "../observability/index.js";
import { Presence } from "../ui/motion/index.js";
import { TabSkeleton } from "../ui/skeletons/TabSkeleton.jsx";
import { VideoBackdrop } from "../ui/VideoBackdrop.jsx";

const BlocoDeNotasTab = React.lazy(() => import("./tabs/BlocoDeNotasTab.jsx"));
const PendenciasTab = React.lazy(() => import("./tabs/PendenciasTab.jsx"));
const PassageirosTab = React.lazy(() => import("./tabs/PassageirosTab.jsx"));
const ListaTab = React.lazy(() => import("./tabs/ListaTab.jsx"));
const OperacaoTab = React.lazy(() => import("./tabs/OperacaoTab.jsx"));
const DashboardTab = React.lazy(() => import("./tabs/DashboardTab.jsx"));
const FinanceiroTab = React.lazy(() => import("./tabs/FinanceiroTab.jsx"));
const GestaoTab = React.lazy(() => import("./tabs/GestaoTab.jsx"));
const SistemaTab = React.lazy(() => import("./tabs/SistemaTab.jsx"));

import {
  BUSCA_PROXIMO,
  BairrosContext,
  BotaoAgendar,
  BusSilhueta,
  BuscaChip,
  C,
  CapacidadeBar,
  Card,
  CategoriasContext,
  DropoffContext,
  Field,
  Header,
  HeroFX,
  IDA_ORDEM_SECOES,
  MiniStat,
  NotificacoesContext,
  OCUPA_VAGA,
  PIX_KEY,
  PIX_NAME,
  Pill,
  STATUS_META,
  Select,
  StatusPill,
  TextArea,
  TextInput,
  VOLTA_ORDEM,
  anotacaoBase,
  dataOperacao,
  diaSemana,
  digitos,
  enderecoEmbarque,
  fmtBRL,
  fmtDate,
  fmtHora,
  isMonday,
  labelLocal,
  linhaReserva,
  shiftHour,
  textoDesembarque,
  todayStr,
  useBairros,
  useDeepLinkData,
  useDropoff,
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
