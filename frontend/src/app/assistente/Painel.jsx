import {
  ArrowDown,
  Check,
  ChevronRight,
  Inbox,
  MessageCircle,
  SquarePen,
  Ticket,
  Users,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  pedidoDaPendencia,
  pendenciaProntaParaFechar,
  propostaParaAVoz,
  respostaDaFala,
  textoParaFalar,
} from "../../domain/assistente.js";
import { useLeituraEmVoz } from "../../hooks/useVoz.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { FadeIn, Skeleton, useReducedMotion } from "../../ui/motion/index.js";
import { C, ErrorBanner } from "../tabShared.jsx";
import { AssistenteSiri } from "../tabs/AssistenteSiri.jsx";
import { Campo } from "./Campo.jsx";
import { CartaoDeAcao, CartaoDeCorrecao } from "./Cartoes.jsx";
import { CorrecoesDoClaude } from "./CorrecoesDoClaude.jsx";
import { useConversaDoAssistente } from "./contexto.jsx";

/**
 * A área que sobra acima do teclado. No iPhone o teclado cobre o que está preso embaixo; a altura
 * visível (visualViewport) mantém o campo sempre à vista.
 */
function useAreaVisivel() {
  const [area, setArea] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const medir = () => {
      const comTeclado = window.innerHeight - vv.height > 120;
      setArea({ altura: vv.height, topo: vv.offsetTop, comTeclado });
    };
    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, []);
  return area;
}

function saudacao(nome) {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Fortaleza",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const oi = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const primeiro = String(nome ?? "")
    .trim()
    .split(/\s+/)[0];
  return primeiro ? `${oi}, ${primeiro}` : oi;
}

const SUGESTOES = [
  { icone: Ticket, texto: "Agende lendo a conversa de ", completar: true, rotulo: "Agendar" },
  {
    icone: Users,
    texto: "Quantas vagas tem na Volta de hoje e na Ida de amanhã?",
    rotulo: "Vagas",
  },
  { icone: MessageCircle, texto: "O que está pendente para hoje?", rotulo: "Pendente hoje" },
  { icone: Wrench, texto: "O bot errou: ", completar: true, rotulo: "Contar um erro" },
];

function Mensagem({ m, onConfirmar, onDescartar, onDescartarCorrecao }) {
  if (m.papel === "usuario") {
    return (
      <FadeIn className="flex justify-end">
        <div
          className="rounded-[20px] rounded-br-md px-4 py-2.5 max-w-[86%] text-[16px] leading-snug whitespace-pre-line"
          style={{ background: C.amberSoft, color: C.ink, overflowWrap: "anywhere" }}
        >
          {m.texto}
        </div>
      </FadeIn>
    );
  }
  return (
    <FadeIn>
      <div
        className="text-[16px] leading-relaxed whitespace-pre-line"
        style={{ color: C.ink, overflowWrap: "anywhere" }}
      >
        {m.texto}
      </div>
      {(m.acoes ?? []).map((a) => (
        <CartaoDeAcao key={a.id} acao={a} onConfirmar={onConfirmar} onDescartar={onDescartar} />
      ))}
      {(m.correcoes ?? []).map((c) => (
        <CartaoDeCorrecao key={c.id} correcao={c} onDescartar={onDescartarCorrecao} />
      ))}
    </FadeIn>
  );
}

function BotaoDoTopo({ rotulo, onClick, children, ativo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={ativo}
      className="btn-press w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
      style={{ color: ativo ? C.ink : C.inkSoft, background: ativo ? C.panel2 : "transparent" }}
    >
      {children}
    </button>
  );
}

function Vazio({ nome, pendencias, onEnviar, onPreencher, onPendencia, onIrPendencias }) {
  const primeira = pendencias?.pendencias?.[0];
  const total = pendencias?.total ?? 0;
  return (
    <div className="flex flex-col gap-5 pt-2">
      <FadeIn>
        <h2
          className="text-[26px] font-bold leading-tight"
          style={{ color: C.ink, letterSpacing: "-.025em" }}
        >
          {saudacao(nome)}
        </h2>
        <p className="text-[15px] mt-1" style={{ color: C.inkSoft }}>
          Peça, fale ou conte um erro. Nada é gravado sem o seu Confirmar.
        </p>
      </FadeIn>

      {primeira && (
        <FadeIn delay={40} className="rounded-2xl overflow-hidden" style={{ background: C.panel2 }}>
          <button
            type="button"
            onClick={() => onPendencia(primeira)}
            className="btn-press w-full text-left px-4 py-3.5 flex items-start gap-3"
          >
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: C.brand, color: C.onBrand }}
            >
              <Inbox size={19} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold" style={{ color: C.ink }}>
                Resolver a pendência mais nova
              </span>
              <span
                className="block text-[14px] mt-0.5 line-clamp-2"
                style={{ color: C.inkSoft, overflowWrap: "anywhere" }}
              >
                {primeira.assunto}
                {primeira.cliente ? ` · ${primeira.cliente}` : ""}
              </span>
            </span>
          </button>
          {total > 1 && onIrPendencias && (
            <button
              type="button"
              onClick={onIrPendencias}
              className="btn-press w-full flex items-center justify-between px-4 min-h-[48px] text-[14px]"
              style={{ color: C.inkSoft, boxShadow: `inset 0 1px 0 ${C.border}` }}
            >
              Ver as {total} pendências <ChevronRight size={17} />
            </button>
          )}
        </FadeIn>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {SUGESTOES.map((s, i) => (
          <FadeIn key={s.rotulo} delay={80 + i * 30}>
            <button
              type="button"
              onClick={() => (s.completar ? onPreencher(s.texto) : onEnviar(s.texto))}
              className="btn-press w-full h-full min-h-[92px] rounded-2xl px-3.5 py-3 flex flex-col justify-between items-start text-left"
              style={{ background: C.panel2, color: C.ink }}
            >
              <s.icone size={20} style={{ color: C.brandText }} />
              <span className="text-[15px] font-semibold">{s.rotulo}</span>
            </button>
          </FadeIn>
        ))}
      </div>

      <CorrecoesDoClaude />
      <AssistenteSiri />
    </div>
  );
}

export default function Painel({ estado, nome, pendencias, onFechar, onIrPendencias }) {
  const a = useConversaDoAssistente();
  const { mensagens, pensando, pedido, pedidoEnviado, enviar, confirmar, descartar } = a;
  const area = useAreaVisivel();
  const reduzir = useReducedMotion();
  const leitura = useLeituraEmVoz();
  const [erroVoz, setErroVoz] = useState(null);
  const [rascunho, setRascunho] = useState({ texto: "", n: 0 });
  const [longeDoFim, setLongeDoFim] = useState(false);
  const rolagem = useRef(null);
  const painel = useRef(null);
  const dentro = estado === "entered";

  const irParaOFim = useCallback(
    (suave = true) =>
      rolagem.current?.scrollTo?.({
        top: rolagem.current.scrollHeight,
        behavior: suave && !reduzir ? "smooth" : "auto",
      }),
    [reduzir],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: rola quando chega mensagem, muda o "pensando" ou abre o teclado
  useEffect(() => {
    irParaOFim();
  }, [mensagens.length, pensando, area?.comTeclado, irParaOFim]);

  // a tela de trás não rola junto
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", tecla);
    const quemAbriu = document.activeElement;
    painel.current?.focus({ preventScroll: true });
    return () => {
      quemAbriu?.focus?.({ preventScroll: true });
      document.body.style.overflow = antes;
      document.removeEventListener("keydown", tecla);
    };
  }, [onFechar]);

  const mandar = useCallback(
    async (texto, opcoes) => {
      setErroVoz(null);
      leitura.calar();
      const r = await enviar(texto, opcoes);
      if (r && leitura.ligada) leitura.falar(textoParaFalar(r.texto, r.acoes));
    },
    [enviar, leitura],
  );

  // pedido que veio de outra tela (pendência): conversa nova, uma vez só
  const enviados = useRef(new Set());
  useEffect(() => {
    if (!pedido || pensando || enviados.current.has(pedido.at)) return;
    enviados.current.add(pedido.at);
    pedidoEnviado();
    mandar(pedido.texto, {
      contexto: pedido.contexto,
      pendencia: pedido.pendencia,
      novaConversa: true,
    });
  }, [pedido, pensando, pedidoEnviado, mandar]);

  // falou: "sim"/"não" decide a proposta aberta; o resto é um pedido
  const aoFalar = (fala) => {
    const proposta = propostaParaAVoz(mensagens);
    const resposta = proposta ? respostaDaFala(fala) : null;
    if (resposta === "sim") confirmar(proposta);
    else if (resposta === "nao") descartar(proposta);
    else mandar(fala);
  };

  const fechavel = pendenciaProntaParaFechar(mensagens);
  const [fechando, setFechando] = useState(false);
  const [fechadas, setFechadas] = useState([]);
  const fecharPendencia = async () => {
    setFechando(true);
    try {
      await pendencias.resolver(fechavel.id);
      setFechadas((l) => [...l, fechavel.id]);
    } catch (e) {
      setErroVoz(mensagemAmigavel(e, "Não foi possível tirar da lista."));
    } finally {
      setFechando(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50" data-testid="assistente">
      <button
        type="button"
        aria-label="Fechar o assistente"
        tabIndex={-1}
        onClick={onFechar}
        className="hidden md:block absolute inset-0 w-full h-full cursor-default"
        style={{
          background: "rgba(0,0,0,.6)",
          opacity: dentro ? 1 : 0,
          transition: "opacity var(--motion-base) var(--ease-out-quart)",
        }}
      />
      <section
        ref={painel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Assistente"
        className="absolute left-0 right-0 md:left-auto md:right-0 md:w-[460px] md:border-l flex flex-col outline-none"
        style={{
          // no celular com teclado, só a parte visível; sem ele, a tela toda (100dvh)
          top: area?.comTeclado ? area.topo : 0,
          height: area?.comTeclado ? area.altura : "100dvh",
          background: C.bg,
          color: C.ink,
          borderColor: C.border,
          transform: dentro ? "none" : "translateY(24px)",
          opacity: dentro ? 1 : 0,
          transition: dentro
            ? "transform var(--motion-slow) var(--ease-out-quart), opacity var(--motion-base) var(--ease-out-quart)"
            : "transform 200ms var(--ease-in), opacity 200ms var(--ease-in)",
        }}
      >
        <header
          className="shrink-0 flex items-center gap-1 pl-4 pr-2 pb-2"
          style={{
            paddingTop: "max(0.5rem, env(safe-area-inset-top))",
            boxShadow: `inset 0 -1px 0 ${C.panel2}`,
          }}
        >
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] font-bold" style={{ letterSpacing: "-.01em" }}>
              Assistente
            </h1>
            <p className="text-[13px] truncate" style={{ color: C.inkSoft }} aria-live="polite">
              {pensando ? "Consultando o app" : "Pronto"}
            </p>
          </div>
          {leitura.disponivel && (
            <BotaoDoTopo
              rotulo={leitura.ligada ? "Parar de ler as respostas" : "Ler as respostas em voz alta"}
              ativo={leitura.ligada}
              onClick={() => {
                if (!leitura.ligada) leitura.falar("Vou ler as respostas.");
                leitura.alternar();
              }}
            >
              {leitura.ligada ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </BotaoDoTopo>
          )}
          {mensagens.length > 0 && (
            <BotaoDoTopo rotulo="Nova conversa" onClick={a.limpar}>
              <SquarePen size={20} />
            </BotaoDoTopo>
          )}
          <BotaoDoTopo rotulo="Fechar o assistente" onClick={onFechar}>
            <X size={22} />
          </BotaoDoTopo>
        </header>

        <div
          ref={rolagem}
          onScroll={(e) => {
            const el = e.currentTarget;
            setLongeDoFim(el.scrollHeight - el.scrollTop - el.clientHeight > 260);
          }}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-4 flex flex-col gap-5"
          style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
        >
          {mensagens.length === 0 && (
            <Vazio
              nome={nome}
              pendencias={pendencias}
              onEnviar={mandar}
              onPreencher={(t) => setRascunho((r) => ({ texto: t, n: r.n + 1 }))}
              onPendencia={(p) => {
                const { texto, ...opcoes } = pedidoDaPendencia(p);
                mandar(texto, { ...opcoes, novaConversa: true });
              }}
              onIrPendencias={
                onIrPendencias
                  ? () => {
                      onFechar();
                      onIrPendencias();
                    }
                  : null
              }
            />
          )}
          {mensagens.map((m) => (
            <Mensagem
              key={m.id}
              m={m}
              onConfirmar={confirmar}
              onDescartar={descartar}
              onDescartarCorrecao={(id) =>
                a.descartarCorrecao(id).catch((e) => setErroVoz(mensagemAmigavel(e)))
              }
            />
          ))}
          {pensando && (
            <FadeIn aria-label="Consultando o app" role="status" className="flex flex-col gap-2">
              <Skeleton height={14} width="86%" rounded={7} />
              <Skeleton height={14} width="64%" rounded={7} />
            </FadeIn>
          )}
          {fechavel && !fechadas.includes(fechavel.id) && !pensando && pendencias?.resolver && (
            <FadeIn variant="pop">
              <button
                type="button"
                onClick={fecharPendencia}
                disabled={fechando}
                className="btn-press w-full flex items-center justify-center gap-2 min-h-[50px] rounded-2xl text-[15px] font-semibold"
                style={{
                  background: C.panel2,
                  color: C.ink,
                  boxShadow: `inset 0 0 0 1px ${C.border}`,
                }}
              >
                <Check size={17} /> Resolvida: tirar a pendência da lista
              </button>
            </FadeIn>
          )}
          {a.erro && !pensando && (
            <ErrorBanner onRetry={() => mandar("", { repetir: true })}>
              {mensagemAmigavel(a.erro)}
            </ErrorBanner>
          )}
        </div>

        <div
          className="shrink-0 px-3 pt-2 relative"
          style={{
            paddingBottom: area?.comTeclado ? 8 : "max(12px, env(safe-area-inset-bottom))",
            background: C.bg,
          }}
        >
          {longeDoFim && (
            <button
              type="button"
              onClick={() => irParaOFim()}
              aria-label="Ir para o fim da conversa"
              className="btn-press absolute -top-12 right-4 w-11 h-11 rounded-full flex items-center justify-center anim-fadeIn"
              style={{
                background: C.panel2,
                color: C.ink,
                boxShadow: `inset 0 0 0 1px ${C.border}`,
              }}
            >
              <ArrowDown size={19} />
            </button>
          )}
          {erroVoz && (
            <ErrorBanner className="mb-2" onDismiss={() => setErroVoz(null)}>
              {erroVoz}
            </ErrorBanner>
          )}
          <Campo
            inicial={rascunho}
            pensando={pensando}
            onEnviar={mandar}
            onFala={aoFalar}
            onErro={setErroVoz}
            onComecarAFalar={() => {
              setErroVoz(null);
              leitura.calar();
            }}
          />
        </div>
      </section>
    </div>,
    document.body,
  );
}
