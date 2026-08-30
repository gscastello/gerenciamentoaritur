import { Skeleton, SkeletonStat, SkeletonText } from "../motion/index.js";

// Skeletons no formato real de cada aba. Regra do AGENTS.md §5: nada de
// bloco genérico — o esqueleto tem que prever o layout que vai chegar,
// senão o conteúdo "pula" quando carrega.

const wrap = { padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 };
const grid = (cols) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 });
const card = { border: "1px solid var(--border,#262d38)", borderRadius: 12, padding: 20 };

function HeaderSkel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Skeleton height={26} width={220} />
      <Skeleton height={12} width={340} />
    </div>
  );
}

function StatRow({ n = 4 }) {
  return (
    <div style={grid(n)}>
      {Array.from({ length: n }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders estáticos
        <SkeletonStat key={i} />
      ))}
    </div>
  );
}

function ListSkel({ rows = 5, h = 56 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders estáticos
        <Skeleton key={i} height={h} rounded={12} />
      ))}
    </div>
  );
}

const ReservarSkel = () => (
  <div style={wrap}>
    <HeaderSkel />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
        <Skeleton height={4} rounded={999} />
        <Skeleton height={16} width="55%" />
        <ListSkel rows={3} h={64} />
      </div>
      <div style={card}>
        <SkeletonText lines={5} />
      </div>
    </div>
  </div>
);

const AgendaSkel = () => (
  <div style={wrap}>
    <HeaderSkel />
    {[0, 1].map((i) => (
      <div key={i} style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Skeleton height={18} width={200} />
          <Skeleton height={28} width={110} rounded={10} />
        </div>
        <div style={grid(5)}>
          {Array.from({ length: 5 }).map((_, j) => (
            <Skeleton key={j} height={44} rounded={10} />
          ))}
        </div>
        <ListSkel rows={4} h={40} />
      </div>
    ))}
  </div>
);

const ListaSkel = () => (
  <div style={wrap}>
    <HeaderSkel />
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton height={12} width={180} />
        <ListSkel rows={3} h={36} />
      </div>
    ))}
  </div>
);

const PassageirosSkel = () => (
  <div style={wrap}>
    <HeaderSkel />
    <Skeleton height={38} width={320} rounded={10} />
    <ListSkel rows={6} h={72} />
  </div>
);

const FinanceiroSkel = () => (
  <div style={wrap}>
    <HeaderSkel />
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
      <div style={{ ...card }}>
        <Skeleton height={220} rounded={10} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <StatRow n={4} />
        <Skeleton height={120} rounded={12} />
        <Skeleton height={200} rounded={12} />
      </div>
    </div>
  </div>
);

const OperacaoSkel = () => (
  <div style={wrap}>
    <HeaderSkel />
    <Skeleton height={140} rounded={12} />
    <StatRow n={5} />
    <Skeleton height={160} rounded={12} />
    <Skeleton height={220} rounded={12} />
  </div>
);

const DashboardSkel = () => (
  <div style={wrap}>
    <HeaderSkel />
    <Skeleton height={110} rounded={12} />
    <Skeleton height={96} rounded={12} />
    <StatRow n={4} />
    <div style={grid(2)}>
      <Skeleton height={260} rounded={12} />
      <Skeleton height={260} rounded={12} />
    </div>
  </div>
);

const SistemaSkel = () => (
  <div style={wrap}>
    <HeaderSkel />
    <Skeleton height={260} rounded={12} />
    <Skeleton height={120} rounded={12} />
    <Skeleton height={140} rounded={12} />
  </div>
);

const MAP = {
  reservar: ReservarSkel,
  agenda: AgendaSkel,
  lista: ListaSkel,
  passageiros: PassageirosSkel,
  financeiro: FinanceiroSkel,
  operacao: OperacaoSkel,
  dashboard: DashboardSkel,
  sistema: SistemaSkel,
};

/** Skeleton da aba atual. Fallback: o do dashboard (o mais completo). */
export function TabSkeleton({ tab }) {
  const Comp = MAP[tab] || DashboardSkel;
  return (
    <div aria-busy="true" aria-live="polite">
      <Comp />
    </div>
  );
}

/** Skeleton específico dos gráficos (usado no Suspense do Dashboard). */
export function ChartsSkeleton() {
  return (
    <div style={grid(2)}>
      <Skeleton height={260} rounded={12} />
      <Skeleton height={260} rounded={12} />
    </div>
  );
}
