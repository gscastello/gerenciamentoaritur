import {
  AlertTriangle,
  Bus,
  CheckCircle2,
  Hourglass,
  Repeat,
  Route,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import React, { Suspense, useMemo } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useFinanceMonth, useFinanceYear } from "../../hooks/useFinance.js";
import { useFuelRecords, useMaintenance } from "../../hooks/useOperation.js";
import { useVehicles } from "../../hooks/useVehicles.js";
import { ChartsSkeleton } from "../../ui/skeletons/TabSkeleton.jsx";
import { VideoBackdrop } from "../../ui/VideoBackdrop.jsx";
import {
  C,
  Card,
  OCUPA_VAGA,
  SinoNotificacoes,
  StatCard,
  dataOperacao,
  fmtBRL,
  gerarInsightsIA,
  mapEntry,
  mapFuel,
  mapManut,
  previsaoDemanda,
  somaTipo,
  todayStr,
  useCountUp,
} from "../tabShared.jsx";

// Recharts é pesado e só o Dashboard usa — carregado sob demanda para sair
// do bundle inicial (ver vite.config.js manualChunks). Issue #2.
const SevenDayCharts = React.lazy(() => import("../../ui/charts/SevenDayCharts.jsx"));

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

export default function DashboardTab({ reservas, capacidade, trips }) {
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
