import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  Headset,
  Home as HomeIcon,
  Hourglass,
  MapPin,
  MessageCircle,
  Package,
  Sunrise,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import { useState } from "react";
import { foraDaAreaPadrao } from "../../domain/cidades.js";
import {
  primeiroErro,
  validarData,
  validarNome,
  validarQuantidade,
  validarTelefone,
  validarValor,
} from "../../domain/validacao.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { EVENTS, emit } from "../../observability/index.js";
import {
  C,
  Card,
  Field,
  HeroFX,
  PIX_KEY,
  PIX_NAME,
  Select,
  TextInput,
  fmtBRL,
  fmtDate,
  isMonday,
  labelLocal,
  shiftHour,
  textoDesembarque,
  todayStr,
  useBairros,
  useDropoff,
  vagasDisponiveis,
} from "../tabShared.jsx";

export default function ReservarTab({
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
