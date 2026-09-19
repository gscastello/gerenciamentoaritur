import {
  AlertTriangle,
  ArrowRight,
  Bus,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Inbox,
  Landmark,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Wallet,
  Wifi,
  X,
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

import { useVehicles } from "../hooks/useVehicles.js";

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
const ReservarTab = React.lazy(() => import("./tabs/ReservarTab.jsx"));
const AgendaTab = React.lazy(() => import("./tabs/AgendaTab.jsx"));
const NovaReservaModal = React.lazy(() =>
  import("./tabs/AgendaTab.jsx").then((m) => ({ default: m.NovaReservaModal })),
);

import {
  BairrosContext,
  BusSilhueta,
  C,
  CategoriasContext,
  DropoffContext,
  NotificacoesContext,
  STATUS_META,
  dataOperacao,
  fmtDate,
  todayStr,
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
        /* Só em campo de formulário — cresce pra um alvo de toque melhor
           sem distorcer nada (um select/input já é largo por natureza).
           Botão NÃO entra aqui: teria que valer pra um ícone de 16px do
           mesmo jeito que pro botão "Confirmar reserva", e um min-height
           sozinho (sem min-width) só deixa o ícone esticado — virava um
           retângulo de 26×42 em vez de um quadrado compacto. */
        select, input, textarea { min-height: 42px; }
        /* Corrige o zoom automático do Safari/iOS: ele aumenta o zoom da
           página sozinho ao focar em qualquer campo com fonte < 16px —
           os componentes usam text-sm (14px) por padrão. */
        select, input, textarea { font-size: 16px !important; }
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
  const { profile, signOut } = useAuth();
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
                <Suspense fallback={null}>
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
                </Suspense>
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
                    <span className="min-w-0 leading-tight flex-1">
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
                    <button
                      type="button"
                      onClick={signOut}
                      className="btn-press rounded-lg p-1.5 shrink-0"
                      style={{ color: C.inkFaint }}
                      title="Sair da conta"
                      aria-label="Sair da conta"
                    >
                      <LogOut size={15} />
                    </button>
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

              <div className="flex-1 min-w-0 pb-40 md:pb-0 overflow-x-hidden relative z-10">
                <div
                  className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 border-b"
                  style={{
                    background: C.panel,
                    borderColor: C.border,
                    paddingTop: "max(0.6rem, env(safe-area-inset-top))",
                  }}
                >
                  <AriturLogo compact />
                  <div className="flex items-center gap-2.5">
                    <div className="aritur-road" style={{ width: 42 }} />
                    <button
                      type="button"
                      onClick={signOut}
                      className="btn-press rounded-lg p-1.5"
                      style={{ color: C.inkFaint }}
                      title="Sair da conta"
                      aria-label="Sair da conta"
                    >
                      <LogOut size={16} />
                    </button>
                  </div>
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
