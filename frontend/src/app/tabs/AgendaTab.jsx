import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hourglass,
  Megaphone,
  MessageCircle,
  NotebookPen,
  Package,
  Pencil,
  PlayCircle,
  Plus,
  RefreshCw,
  Route,
  StopCircle,
  Sunrise,
  Truck,
  X,
  X as XIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { parseAnotacaoEncomenda, parseAnotacaoRapida } from "../../domain/anotacaoRapida.js";
import {
  primeiroErro,
  validarData,
  validarNome,
  validarObrigatorio,
  validarQuantidade,
  validarTelefone,
  validarValor,
} from "../../domain/validacao.js";
import { useCustomerLookup } from "../../hooks/useCustomerLookup.js";
import { useTrips } from "../../hooks/useTrips.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { EVENTS, emit } from "../../observability/index.js";
import { Presence } from "../../ui/motion/index.js";
import {
  BUSCA_PROXIMO,
  BotaoAgendar,
  BuscaChip,
  C,
  CapacidadeBar,
  Card,
  Field,
  Header,
  HeroFX,
  IDA_ORDEM_SECOES,
  MiniStat,
  OCUPA_VAGA,
  Pill,
  Select,
  StatusPill,
  TextArea,
  TextInput,
  VOLTA_ORDEM,
  anotacaoBase,
  deslocarDia,
  diaAgendaPadrao,
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
  todayStr,
  useBairros,
  useDeepLinkData,
} from "../tabShared.jsx";

/* ============================= 2. AGENDA — tela operacional ============================= */
export default function AgendaTab({
  reservas,
  R,
  capacidade,
  trips,
  segundaAtiva,
  segundaHoras,
  deepLink,
  onAgendar,
}) {
  const [data, setData] = useState(diaAgendaPadrao());
  useDeepLinkData(deepLink, setData);
  const [editando, setEditando] = useState(null);
  const [encomendaModal, setEncomendaModal] = useState(null); // null = fechado; {} = nova; {pendente:r} = agendando uma pendente
  const [acaoErro, setAcaoErro] = useState("");
  const T = useTrips(data);
  // Mantém a reserva em edição durante a animação de saída do modal (issue #2).
  const modalHeld = useRef(null);
  if (editando) modalHeld.current = editando;
  const segunda = isMonday(data) && segundaAtiva;
  const doDia = reservas.filter((r) => r.data === data && !["frete", "encomenda"].includes(r.tipo));
  // Encomendas já agendadas (com viagem/ponto reais) pro dia selecionado —
  // ver database/42. Nunca entram em `doDia`: têm remetente/destinatário,
  // não "passageiro", e desembarque próprio, então ganham seção à parte.
  const encomendasAgendadas = reservas.filter(
    (r) => r.tipo === "encomenda" && r.data === data && r.status !== "cancelada",
  );
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

  // Nova encomenda OU agendar uma pendente (database/42): o modal decide
  // pelo payload (tem `id` = está agendando uma existente, chama a edição;
  // sem `id` = criando do zero).
  const salvarEncomenda = async ({ id, ...payload }) => {
    if (id) {
      await R.editReservationFull(id, payload);
    } else {
      await R.createReservation(payload);
    }
  };
  const entregarEncomenda = (id) =>
    acao(
      R.editReservationFull(id, { status: "embarcado" }),
      "Não foi possível marcar como entregue.",
    );

  // Anotação rápida direto no ponto/horário da Agenda: "1P Cohatrac
  // 98999998888" cria a reserva sem abrir modal nenhum. O ponto já é
  // conhecido (é o da linha clicada) — só quantidade/local/telefone vêm
  // do texto. Mesma RPC de sempre (rpc_create_reservation via
  // R.createReservation); capacidade e duplicidade continuam decididas
  // pelo banco. Prefixo "E" na mesma caixinha agenda uma encomenda em vez
  // de passagem — embarque é o próprio ponto/horário da caixinha, só
  // item (opcional) + telefone de quem recebe vêm do texto (database/42:
  // nunca ocupa vaga).
  const bairrosAnotacao = useBairros();
  const buscarClientePorTelefone = useCustomerLookup();
  const criarViaAnotacao = async (direcao, ponto, texto) => {
    const encomenda = parseAnotacaoEncomenda(texto);
    if (!encomenda.semPrefixo) {
      if (!encomenda.ok) return { ok: false, erro: encomenda.erro };
      try {
        const nomeExistente = await buscarClientePorTelefone(encomenda.telefone);
        const res = await R.createReservation({
          tripDate: data,
          direction: direcao,
          customerName: nomeExistente || "Encomenda",
          customerPhone: encomenda.telefone,
          type: "encomenda",
          routePointCode: ponto.id,
          unitPrice: 0,
          status: "confirmada",
          extraData: { encItem: encomenda.item || null, origem: "anotacao_agenda" },
        });
        emit(EVENTS.RESERVA_CRIADA, {
          via: "anotacao_agenda_encomenda",
          status: res?.status || "confirmada",
          duplicada: res?.message === "duplicate_ignored",
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, erro: mensagemAmigavel(e, "Não foi possível criar a encomenda.") };
      }
    }

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
          <div className="relative">
            {/* Dia em destaque, centralizado — é em torno dele que toda a
                tela opera, então vira o elemento visual dominante, com
                setas pra andar dia a dia sem precisar abrir o calendário. */}
            <div className="flex items-center justify-center gap-3 md:gap-6">
              <button
                type="button"
                onClick={() => setData(deslocarDia(data, -1))}
                aria-label="Dia anterior"
                className="btn-press p-2 rounded-full shrink-0"
                style={{ background: "rgba(0,0,0,.3)", color: "#fff" }}
              >
                <ChevronLeft size={20} />
              </button>
              <div className="text-center min-w-0">
                {data === todayStr() ? (
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "rgba(255,255,255,.75)" }}
                  >
                    Hoje
                  </div>
                ) : data === deslocarDia(todayStr(), 1) ? (
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: "rgba(255,255,255,.75)" }}
                  >
                    Amanhã
                  </div>
                ) : null}
                <div
                  className="capitalize truncate"
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 800,
                    fontSize: "1.7rem",
                    lineHeight: 1.1,
                    color: "#fff",
                  }}
                >
                  {diaSemana(data)}
                </div>
                <div className="text-sm" style={{ color: "rgba(255,255,255,.75)" }}>
                  {fmtDate(data)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setData(deslocarDia(data, 1))}
                aria-label="Próximo dia"
                className="btn-press p-2 rounded-full shrink-0"
                style={{ background: "rgba(0,0,0,.3)", color: "#fff" }}
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEncomendaModal({ pendente: r })}
                      className="btn-press text-xs px-2 py-1 rounded-md"
                      style={{ background: C.greenSoft, color: C.green }}
                    >
                      Agendar
                    </button>
                    <button
                      onClick={() => atualizarStatus(r.id, "cancelada")}
                      className="btn-press text-xs px-2 py-1 rounded-md"
                      style={{ background: C.border, color: C.inkSoft }}
                    >
                      Arquivar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package size={16} style={{ color: C.inkSoft }} />
              <div className="text-sm font-semibold" style={{ color: C.ink }}>
                Encomendas do dia{" "}
                {encomendasAgendadas.length > 0 && (
                  <span style={{ color: C.inkFaint }}>({encomendasAgendadas.length})</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEncomendaModal({})}
              className="btn-press flex items-center gap-1 text-xs px-2 py-1.5 rounded-md font-medium"
              style={{ background: C.amberSoft, color: C.amber }}
            >
              <Plus size={13} /> Nova
            </button>
          </div>
          {encomendasAgendadas.length === 0 ? (
            <p className="text-xs" style={{ color: C.inkFaint }}>
              Nenhuma encomenda agendada pra {fmtDate(data)}.
            </p>
          ) : (
            <div className="space-y-2">
              {encomendasAgendadas.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
                  style={{ background: C.panel2, opacity: r.status === "embarcado" ? 0.6 : 1 }}
                >
                  <div className="text-xs">
                    <span className="font-semibold">{r.direcao === "ida" ? "Ida" : "Volta"}</span> ·{" "}
                    {r.extra?.encItem || "encomenda"} ·{" "}
                    {trips[r.direcao]?.pontos.find((p) => p.id === r.pontoId)?.nome || "?"} →{" "}
                    {r.desembarque || "?"}
                    <br />
                    <span style={{ color: C.inkFaint }}>
                      entrega: {r.extra?.encRemetenteNome || "—"} (
                      {r.extra?.encRemetenteTelefone || "—"}){" · "}recebe: {r.nome} ({r.telefone})
                      {r.valorTotal ? ` · ${fmtBRL(r.valorTotal)}` : ""}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {r.status !== "embarcado" && (
                      <button
                        onClick={() => entregarEncomenda(r.id)}
                        className="btn-press text-xs px-2 py-1 rounded-md"
                        style={{ background: C.greenSoft, color: C.green }}
                      >
                        Entregue
                      </button>
                    )}
                    <button
                      onClick={() => atualizarStatus(r.id, "cancelada")}
                      className="btn-press text-xs px-2 py-1 rounded-md"
                      style={{ background: C.redSoft, color: C.red }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

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
      {encomendaModal && (
        <NovaEncomendaModal
          pendente={encomendaModal.pendente}
          dataInicial={data}
          trips={trips}
          onClose={() => setEncomendaModal(null)}
          onSalvar={salvarEncomenda}
        />
      )}
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
          placeholder="Anotar — 1P Cohatrac 98999998888 · encomenda: E 98999998888"
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

export function NovaReservaModal({
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

/* ============================= Encomendas ============================= *
 * Agendar uma encomenda nova, ou pegar uma que o cliente já mandou pelo
 * WhatsApp (pendente, sem viagem/ponto ainda — ver database/42) e
 * encaixar numa viagem/ponto real. Mesmo modal serve pros dois casos:
 * `pendente` presente = está agendando; ausente = está criando do zero.
 * Nunca ocupa vaga (database/42 mantém reservation_passengers em
 * 'cancelado' sempre pra este tipo). */
function NovaEncomendaModal({
  pendente,
  dataInicial,
  direcaoInicial = "ida",
  trips,
  onClose,
  onSalvar,
}) {
  const primeiroPonto = (dir) => trips[dir]?.pontos?.[0]?.id || "";
  const direcaoBase = pendente?.direcao || direcaoInicial;
  const [f, setF] = useState({
    direcao: direcaoBase,
    data: dataInicial || todayStr(),
    pontoId: primeiroPonto(direcaoBase),
    desembarque: pendente?.extra?.encDesembarque || "",
    item: pendente?.extra?.encItem || "",
    remetenteNome: pendente?.extra?.encRemetenteNome || "",
    remetenteTelefone: pendente?.extra?.encRemetenteTelefone || "",
    destinatarioNome: pendente?.nome || "",
    destinatarioTelefone: pendente?.telefone || "",
    valor: "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const viagem = trips[f.direcao] || trips.ida;
  const trocarDirecao = (dir) => setF((s) => ({ ...s, direcao: dir, pontoId: primeiroPonto(dir) }));

  const podeEnviar =
    f.destinatarioNome.trim() && f.destinatarioTelefone.trim() && f.pontoId && f.data;

  const salvar = async () => {
    setErro("");
    const problema = primeiroErro([
      validarNome(f.destinatarioNome),
      validarTelefone(f.destinatarioTelefone),
      validarData(f.data, { min: pendente ? undefined : todayStr() }),
      f.valor !== "" ? validarValor(f.valor, { min: 0 }) : null,
    ]);
    if (problema) {
      setErro(problema);
      return;
    }
    setSalvando(true);
    try {
      const extraData = {
        encItem: f.item.trim() || null,
        encRemetenteNome: f.remetenteNome.trim() || null,
        encRemetenteTelefone: f.remetenteTelefone.trim() || null,
      };
      if (pendente) {
        await onSalvar({
          id: pendente.id,
          move: { trip_date: f.data, direction: f.direcao, route_point_code: f.pontoId },
          details: {
            dropoff_location: f.desembarque.trim() || null,
            ...(f.valor !== "" ? { unit_price: Number.parseFloat(f.valor) || 0 } : {}),
          },
          contact: {
            customer_id: pendente.customer_id,
            name: f.destinatarioNome.trim(),
            phone: f.destinatarioTelefone.trim(),
          },
          extraData,
          status: "confirmada",
        });
      } else {
        await onSalvar({
          tripDate: f.data,
          direction: f.direcao,
          type: "encomenda",
          customerName: f.destinatarioNome.trim(),
          customerPhone: f.destinatarioTelefone.trim(),
          routePointCode: f.pontoId,
          unitPrice: f.valor !== "" ? Number.parseFloat(f.valor) || 0 : 0,
          dropoffLocation: f.desembarque.trim() || null,
          status: "confirmada",
          extraData,
        });
      }
      onClose({ ok: true });
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar a encomenda."));
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
            className="font-semibold text-sm flex items-center gap-1.5"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <Package size={15} /> {pendente ? "Agendar encomenda" : "Nova encomenda"}
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
          <Field label="Ponto de desembarque">
            <TextInput
              value={f.desembarque}
              onChange={(e) => setF({ ...f, desembarque: e.target.value })}
              placeholder="Ex.: Pirapemas centro"
            />
          </Field>
        </div>

        <div className="mb-2">
          <Field label="O que é (opcional)">
            <TextInput
              value={f.item}
              onChange={(e) => setF({ ...f, item: e.target.value })}
              placeholder="Ex.: caixa de sapato, documentos…"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Quem entrega (nome)">
            <TextInput
              value={f.remetenteNome}
              onChange={(e) => setF({ ...f, remetenteNome: e.target.value })}
            />
          </Field>
          <Field label="Quem entrega (telefone)">
            <TextInput
              inputMode="tel"
              value={f.remetenteTelefone}
              onChange={(e) => setF({ ...f, remetenteTelefone: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Quem recebe (nome) *">
            <TextInput
              value={f.destinatarioNome}
              onChange={(e) => setF({ ...f, destinatarioNome: e.target.value })}
            />
          </Field>
          <Field label="Quem recebe (telefone) *">
            <TextInput
              inputMode="tel"
              value={f.destinatarioTelefone}
              onChange={(e) => setF({ ...f, destinatarioTelefone: e.target.value })}
            />
          </Field>
        </div>

        <div className="mb-4">
          <Field label="Valor do frete (opcional — vira receita no Financeiro)">
            <TextInput
              type="number"
              value={f.valor}
              onChange={(e) => setF({ ...f, valor: e.target.value })}
              placeholder="0,00"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={salvando || !podeEnviar}
            onClick={salvar}
            className="btn-press text-sm px-4 py-2 rounded-lg font-medium"
            style={{
              background: salvando || !podeEnviar ? C.border : C.amber,
              color: salvando || !podeEnviar ? C.inkFaint : C.onBrand,
            }}
          >
            {salvando ? "Salvando…" : pendente ? "Agendar" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
