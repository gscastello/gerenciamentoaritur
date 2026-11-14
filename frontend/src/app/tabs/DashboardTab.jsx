import { AlertTriangle, Bell, ChevronRight, Hourglass, Inbox, Sparkles } from "lucide-react";
import React, { Suspense, useMemo } from "react";
import { ehExtra } from "../../domain/vagas.js";
import { useFinanceMonth, useFinanceYear } from "../../hooks/useFinance.js";
import { useFuelRecords, useMaintenance } from "../../hooks/useOperation.js";
import { useVehicles } from "../../hooks/useVehicles.js";
import { Skeleton } from "../../ui/motion/index.js";
import { ChartsSkeleton } from "../../ui/skeletons/TabSkeleton.jsx";
import {
  C,
  Card,
  FUNDO_CARTAO,
  INICIO,
  OCUPA_VAGA,
  SinoNotificacoes,
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
  useNotificacoesCtx,
} from "../tabShared.jsx";

// Recharts é pesado e só o Dashboard usa — carregado sob demanda para sair
// do bundle inicial (ver vite.config.js manualChunks). Issue #2.
const SevenDayCharts = React.lazy(() => import("../../ui/charts/SevenDayCharts.jsx"));

/* ============================= 7. INÍCIO (Dashboard) =============================
 * Visual aprovado pelo dono (issue #391): a imagem da AriTur inteira no primeiro cartão;
 * faturamento do ano, do mês e de hoje com o lucro real (receitas − despesas, a mesma conta
 * do Financeiro) em três cartões na mesma linha; os passageiros da Ida e da Volta separados
 * (nunca somados); e "Precisa de você". Gráficos, IA operacional e previsão vêm depois.
 */

// Valor curto para caber três cartões numa linha de celular: "R$ 702 mil", "R$ 38,9 mil".
export function valorCurto(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sinal = v < 0 ? "−" : "";
  if (abs >= 1_000_000)
    return `${sinal}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 10_000)
    return `${sinal}R$ ${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: abs >= 100_000 ? 0 : 1 })} mil`;
  return `${sinal}R$ ${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

const MES_LONGO = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const nomeDoMes = (ds) => MES_LONGO.format(new Date(`${ds.slice(0, 7)}-15T12:00:00Z`));

function CartaoFinanceiro({ periodo, receita, lucro, carregando, onClick }) {
  const r = useCountUp(receita, 700);
  const l = useCountUp(lucro, 700);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${periodo}: faturamento ${fmtBRL(receita)}, lucro real ${fmtBRL(lucro)}`}
      className="toque-at cartao-at text-left rounded-2xl border px-2.5 pt-2.5 pb-3 min-w-0"
      style={{ background: FUNDO_CARTAO, borderColor: INICIO.borda, containerType: "inline-size" }}
    >
      <span
        className="block uppercase truncate"
        style={{
          color: C.inkSoft,
          fontSize: "min(11.5px, 13cqi)",
          fontWeight: 600,
          letterSpacing: ".08em",
        }}
      >
        {periodo}
      </span>
      {carregando ? (
        <span className="block mt-1.5 space-y-1.5" aria-hidden="true">
          <Skeleton height={16} width="80%" />
          <Skeleton height={11} width="55%" />
          <Skeleton height={13} width="70%" />
        </span>
      ) : (
        <>
          <span
            className="block whitespace-nowrap mt-0.5"
            style={{
              color: C.ink,
              fontWeight: 600,
              fontSize: "min(15px, 17.5cqi)",
              letterSpacing: "-.02em",
            }}
          >
            {valorCurto(r)}
          </span>
          <span className="block mt-1" style={{ color: C.inkSoft, fontSize: 12, lineHeight: 1.25 }}>
            lucro real
          </span>
          <span
            className="flex items-center gap-1.5 whitespace-nowrap"
            style={{ color: C.ink, fontWeight: 600, fontSize: "min(13px, 15.5cqi)" }}
          >
            <span
              aria-hidden="true"
              className="inline-block w-1.5 h-1.5 rounded-sm shrink-0"
              style={{ background: lucro < 0 ? C.inkSoft : C.brand }}
            />
            {valorCurto(l)}
          </span>
        </>
      )}
    </button>
  );
}

function CartaoViagem({ rotulo, passageiros, capacidade, onClick }) {
  const n = useCountUp(passageiros, 600);
  const lotado = capacidade > 0 && passageiros >= capacidade;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`inicio-${rotulo.toLowerCase()}`}
      aria-label={`${rotulo}: ${passageiros} passageiros de ${capacidade}. Abrir na Agenda`}
      className="toque-at cartao-at text-left rounded-2xl border p-3.5 min-w-0"
      style={{ background: FUNDO_CARTAO, borderColor: INICIO.borda }}
    >
      <span
        className="block"
        style={{ color: C.inkSoft, fontSize: 12, fontWeight: 600, letterSpacing: ".1em" }}
      >
        {rotulo.toUpperCase()}
      </span>
      <span
        className="block mt-1"
        style={{
          color: C.ink,
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: "-.035em",
          lineHeight: 1.05,
        }}
      >
        {Math.round(n)}
      </span>
      <span className="block mt-1 text-[13px]" style={{ color: C.inkSoft }}>
        {lotado ? "lotado" : `passageiros de ${capacidade}`}
      </span>
    </button>
  );
}

function ItemPrecisa({ Icon, titulo, detalhe, acao, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="toque-at w-full grid items-center gap-3 py-2.5 text-left border-t first:border-t-0 min-h-[58px]"
      style={{ gridTemplateColumns: "36px minmax(0,1fr) auto", borderColor: INICIO.borda }}
    >
      <span
        className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: C.panel2, color: C.inkSoft }}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold truncate" style={{ color: C.ink }}>
          {titulo}
        </span>
        {detalhe && (
          <span className="block text-xs truncate" style={{ color: C.inkFaint }}>
            {detalhe}
          </span>
        )}
      </span>
      <span
        className="flex items-center gap-0.5 text-[13px] font-semibold"
        style={{ color: "#FF5260" }}
      >
        {acao}
        <ChevronRight size={15} />
      </span>
    </button>
  );
}

export default function DashboardTab({
  reservas,
  capacidade,
  capacidadeDe = null,
  trips,
  pendencias = 0,
  onIr,
}) {
  const hoje = todayStr();
  // lugares de cada viagem de hoje (van reserva num dia — issue #408)
  const capIdaHoje = capacidadeDe?.(hoje, "ida") ?? capacidade;
  const capVoltaHoje = capacidadeDe?.(hoje, "volta") ?? capacidade;
  const notif = useNotificacoesCtx();
  // Financeiro do mês atual + anterior (a janela de 7 dias pode cruzar o mês).
  const now = new Date();
  const finThis = useFinanceMonth(now.getFullYear(), now.getMonth() + 1);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const finPrev = useFinanceMonth(prevMonth.getFullYear(), prevMonth.getMonth() + 1);
  const financeiro = useMemo(
    () => [...(finPrev.entries || []), ...(finThis.entries || [])].map(mapEntry),
    [finThis.entries, finPrev.entries],
  );
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
  const doDia = reservas.filter(
    (r) =>
      r.data === hoje && OCUPA_VAGA.includes(r.status) && !["frete", "encomenda"].includes(r.tipo),
  );
  // Lotação SEMPRE por direção — cada viagem tem `capacidade` lugares.
  // Extras (fora das vagas, issue #210) ficam de fora da lotação.
  const paxIdaHoje = doDia
    .filter((r) => r.direcao === "ida" && !ehExtra(r))
    .reduce((s, r) => s + r.quantidade, 0);
  const paxVoltaHoje = doDia
    .filter((r) => r.direcao === "volta" && !ehExtra(r))
    .reduce((s, r) => s + r.quantidade, 0);
  const emEspera = reservas.filter((r) => r.status === "espera").length;
  const pendentesHoje = reservas.filter((r) => r.data === hoje && r.status === "pendente").length;
  // Faturamento e lucro real (receita − despesa, a mesma conta do Financeiro): hoje, mês e ano.
  const soma = (lista, tipo, filtro) =>
    lista.filter((f) => f.tipo === tipo && filtro(f)).reduce((s, f) => s + f.valor, 0);
  const mes = hoje.slice(0, 7);
  const receitaHoje = soma(financeiro, "receita", (f) => f.data === hoje);
  const lucroHoje = receitaHoje - soma(financeiro, "despesa", (f) => f.data === hoje);
  const receitaMes = soma(financeiro, "receita", (f) => f.data.startsWith(mes));
  const lucroMes = receitaMes - soma(financeiro, "despesa", (f) => f.data.startsWith(mes));
  const receitaAno = somaTipo(financeiroAno, "receita");
  const lucroAno = receitaAno - somaTipo(financeiroAno, "despesa");
  const carregandoMes = finThis.loading && !finThis.entries?.length;
  const carregandoAno = finAno.loading && !finAno.entries?.length;
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
  const ir = (tab, deepLink) => onIr?.({ tab, deepLink });
  const avisos = (notif?.notificacoes || []).filter((n) => !n.lida).slice(0, 3);
  const nomeMes = nomeDoMes(hoje);
  const nada = pendencias === 0 && pendentesHoje === 0 && emEspera === 0 && avisos.length === 0;
  return (
    <div className="px-3.5 md:px-10 pt-2 md:pt-6 pb-10">
      <div className="hidden md:flex justify-end mb-3">
        <SinoNotificacoes />
      </div>
      <div className="md:max-w-3xl space-y-2.5 md:space-y-3 stagger">
        <div
          className="relative rounded-[22px] overflow-hidden"
          style={{
            aspectRatio: "16 / 9",
            background: INICIO.painel,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)",
          }}
        >
          <img
            src="/brand/capa-inicio.webp"
            alt="AriTur Transportes — Conectando destinos, cuidando de cada viagem"
            width={1280}
            height={720}
            decoding="async"
            fetchPriority="high"
            className="block w-full h-full object-cover"
            data-testid="capa-inicio"
          />
        </div>
        <div className="grid grid-cols-3 gap-1.5 md:gap-2.5" data-testid="inicio-financeiro">
          <CartaoFinanceiro
            periodo="Ano"
            receita={receitaAno}
            lucro={lucroAno}
            carregando={carregandoAno}
            onClick={() => ir("financeiro")}
          />
          <CartaoFinanceiro
            periodo={nomeMes}
            receita={receitaMes}
            lucro={lucroMes}
            carregando={carregandoMes}
            onClick={() => ir("financeiro")}
          />
          <CartaoFinanceiro
            periodo="Hoje"
            receita={receitaHoje}
            lucro={lucroHoje}
            carregando={carregandoMes}
            onClick={() => ir("financeiro")}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:gap-2.5">
          <CartaoViagem
            rotulo="Ida"
            passageiros={paxIdaHoje}
            capacidade={capIdaHoje}
            onClick={() => ir("agenda", { kind: "data", data: hoje, sentido: "ida" })}
          />
          <CartaoViagem
            rotulo="Volta"
            passageiros={paxVoltaHoje}
            capacidade={capVoltaHoje}
            onClick={() => ir("agenda", { kind: "data", data: hoje, sentido: "volta" })}
          />
        </div>
        <div>
          <h2
            className="flex items-center mt-4 mb-2 px-0.5 text-[15px] font-bold"
            style={{ color: C.ink }}
          >
            <span className="riscos-at" aria-hidden="true">
              <i />
              <i />
            </span>
            Precisa de você
          </h2>
          <div
            className="cartao-at rounded-2xl border px-3"
            style={{ background: FUNDO_CARTAO, borderColor: INICIO.borda }}
            data-testid="precisa-de-voce"
          >
            {pendencias > 0 && (
              <ItemPrecisa
                Icon={Inbox}
                titulo={
                  pendencias === 1
                    ? "1 pendência no atendimento"
                    : `${pendencias} pendências no atendimento`
                }
                detalhe="clientes e reservas que pedem a equipe"
                acao="Abrir"
                onClick={() => ir("pendencias")}
              />
            )}
            {pendentesHoje > 0 && (
              <ItemPrecisa
                Icon={AlertTriangle}
                titulo={
                  pendentesHoje === 1
                    ? "1 reserva pendente hoje"
                    : `${pendentesHoje} reservas pendentes hoje`
                }
                detalhe="confirmar ou recusar na Agenda"
                acao="Ver"
                onClick={() => ir("agenda", { kind: "data", data: hoje })}
              />
            )}
            {emEspera > 0 && (
              <ItemPrecisa
                Icon={Hourglass}
                titulo={
                  emEspera === 1
                    ? "1 pessoa na lista de espera"
                    : `${emEspera} pessoas na lista de espera`
                }
                detalhe="chame quando abrir vaga"
                acao="Ver"
                onClick={() => ir("agenda")}
              />
            )}
            {avisos.map((n) => (
              <ItemPrecisa
                key={n.id}
                Icon={Bell}
                titulo={n.title}
                detalhe={n.body}
                acao="Lido"
                onClick={() => notif?.marcarLida?.(n.id)}
              />
            ))}
            {nada && (
              <p className="py-4 text-[13px]" style={{ color: C.inkSoft }}>
                Tudo em dia por aqui.
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-5 mt-6">
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
