import { Check, Send, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAssistente } from "../../hooks/useAssistente.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { BotaoDitado } from "../../ui/BotaoDitado.jsx";
import { FadeIn, ProgressBar, Spinner } from "../../ui/motion/index.js";
import { C, ErrorBanner, Header } from "../tabShared.jsx";
import { AssistenteSiri } from "./AssistenteSiri.jsx";

/* ===================== ASSISTENTE DA EQUIPE (issue #288) =====================
   A equipe pede como pede ao Claude Code: "agende a passagem de 98…", "remarque a
   volta do fulano para sexta", "o que está pendente hoje?". O assistente consulta
   o app e PROPÕE; nada é gravado sem o toque em "Confirmar" no cartão. */

const EXEMPLOS = [
  "O que está pendente para hoje?",
  "Agende a passagem de 98 9XXXX-XXXX lendo a conversa do WhatsApp",
  "Quantas vagas tem na Volta de amanhã?",
  "Remarque a volta do Zequinha para sexta",
];

const TITULO_DA_ACAO = {
  criar: "Nova reserva",
  mudar: "Mudar reserva",
  cancelar: "Cancelar reserva",
  lancar_rascunho: "Lançar reserva pronta",
  descartar_rascunho: "Descartar reserva pronta",
  resolver_pendencia: "Resolver pendência",
  // o que o sócio informa ou corrige vira aprendizado do bot (issue #318)
  ensinar: "Ensinar ao bot",
  ensinar_lugar: "Ensinar lugar ao bot",
  // hábito de um passageiro (issue #328)
  costume: "Endereço de costume",
  instruir_cliente: "Instrução sobre o passageiro",
};

const ROTULO_ESTADO = {
  gravando: "Gravando…",
  feita: "Feito",
  erro: "Não gravou",
  descartada: "Descartada",
};

function CartaoDeAcao({ acao, onConfirmar, onDescartar }) {
  const aberta = acao.estado === "proposta" || acao.estado === "erro";
  const titulo = TITULO_DA_ACAO[acao.tipo] ?? "Ação";
  return (
    <FadeIn
      variant="pop"
      className="rounded-xl border p-3 mt-2"
      style={{
        background: C.panel2,
        borderColor: acao.estado === "erro" ? C.red : C.border,
        opacity: acao.estado === "descartada" ? 0.55 : 1,
        transition: "opacity var(--motion-base) var(--ease-out-quart)",
      }}
    >
      <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: C.inkFaint }}>
        {titulo}
        {acao.estado !== "proposta" && ` · ${ROTULO_ESTADO[acao.estado] ?? acao.estado}`}
      </div>
      <div className="text-sm whitespace-pre-line" style={{ color: C.ink }}>
        {acao.descricao}
      </div>
      {acao.aviso && (
        <div className="text-xs mt-1" style={{ color: C.rota }}>
          {acao.aviso}
        </div>
      )}
      {acao.resultado && (
        <div className="text-xs mt-1" style={{ color: acao.estado === "erro" ? C.red : C.inkSoft }}>
          {acao.resultado}
        </div>
      )}
      {acao.estado === "gravando" && (
        <div className="mt-2">
          <ProgressBar label="Gravando no app" />
        </div>
      )}
      {aberta && (
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => onConfirmar(acao)}
            className="btn-press flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold"
            style={{ background: C.brand, color: C.onBrand }}
          >
            <Check size={14} /> Confirmar
          </button>
          <button
            type="button"
            onClick={() => onDescartar(acao)}
            className="btn-press flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm"
            style={{ background: C.panel, color: C.inkSoft }}
          >
            <X size={14} /> Descartar
          </button>
        </div>
      )}
    </FadeIn>
  );
}

function Bolha({ m, onConfirmar, onDescartar }) {
  const minha = m.papel === "usuario";
  return (
    <FadeIn className={`flex ${minha ? "justify-end" : "justify-start"}`}>
      <div
        className="rounded-2xl px-3 py-2 max-w-[92%] md:max-w-[75%]"
        style={{ background: minha ? C.amberSoft : C.panel, border: `1px solid ${C.border}` }}
      >
        <div className="text-sm whitespace-pre-line" style={{ color: C.ink }}>
          {m.texto}
        </div>
        {(m.acoes ?? []).map((a) => (
          <CartaoDeAcao key={a.id} acao={a} onConfirmar={onConfirmar} onDescartar={onDescartar} />
        ))}
      </div>
    </FadeIn>
  );
}

export default function AssistenteTab() {
  const { mensagens, enviar, confirmar, descartar, limpar, pensando, erro } = useAssistente();
  const [texto, setTexto] = useState("");
  const [erroDitado, setErroDitado] = useState(null);
  const fim = useRef(null);

  // a última mensagem fica à vista
  // biome-ignore lint/correctness/useExhaustiveDependencies: rola quando chega mensagem ou muda o "pensando"
  useEffect(() => {
    fim.current?.scrollIntoView?.({ block: "end" });
  }, [mensagens.length, pensando]);

  const mandar = (t = texto) => {
    if (!t.trim() || pensando) return;
    enviar(t);
    setTexto("");
  };

  return (
    <div className="pb-24">
      <Header
        title="Assistente"
        subtitle="Peça como pediria a um atendente: ele consulta o app e propõe; você confirma."
        right={
          mensagens.length > 0 && (
            <button
              type="button"
              onClick={limpar}
              className="btn-press flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs"
              style={{ background: C.panel2, color: C.inkSoft }}
            >
              <Trash2 size={14} /> Nova conversa
            </button>
          )
        }
      />

      <div className="px-4 md:px-10 flex flex-col gap-3 max-w-3xl">
        {mensagens.length === 0 && <AssistenteSiri />}
        {mensagens.length === 0 && (
          <FadeIn
            className="rounded-xl border p-4"
            style={{ background: C.panel, borderColor: C.border }}
          >
            <div
              className="flex items-center gap-2 text-sm font-semibold mb-2"
              style={{ color: C.ink }}
            >
              <Sparkles size={16} /> Exemplos
            </div>
            <div className="flex flex-col gap-2">
              {EXEMPLOS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setTexto(e)}
                  className="btn-press text-left text-sm rounded-lg px-3 py-2"
                  style={{ background: C.panel2, color: C.inkSoft }}
                >
                  {e}
                </button>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: C.inkFaint }}>
              Nada é gravado sem o seu "Confirmar". Preço sempre pela tabela do app.
            </p>
          </FadeIn>
        )}

        {mensagens.map((m) => (
          <Bolha key={m.id} m={m} onConfirmar={confirmar} onDescartar={descartar} />
        ))}

        {pensando && (
          <FadeIn className="flex items-center gap-2 text-sm" style={{ color: C.inkSoft }}>
            <Spinner /> Consultando o app…
          </FadeIn>
        )}
        {erro && <ErrorBanner>{mensagemAmigavel(erro)}</ErrorBanner>}
        {erroDitado && (
          <ErrorBanner onDismiss={() => setErroDitado(null)}>{erroDitado}</ErrorBanner>
        )}
        <div ref={fim} />
      </div>

      <form
        className="fixed bottom-16 md:bottom-4 left-0 right-0 md:left-auto md:right-6 md:w-[min(48rem,calc(100%-18rem))] px-4 md:px-0"
        onSubmit={(e) => {
          e.preventDefault();
          mandar();
        }}
      >
        <div
          className="flex items-end gap-2 rounded-2xl border p-2"
          style={{ background: C.panel, borderColor: C.border }}
        >
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                mandar();
              }
            }}
            rows={2}
            placeholder="Escreva ou dite o pedido…"
            aria-label="Pedido para o assistente"
            className="flex-1 bg-transparent outline-none resize-none text-sm px-2 py-1"
            style={{ color: C.ink }}
          />
          <BotaoDitado
            rotulo="Ditar pedido"
            cores={{ ativo: C.amber, ativoTexto: C.onBrand, fundo: C.panel2, texto: C.inkSoft }}
            onErro={setErroDitado}
            onTexto={(fala) =>
              setTexto((atual) => (atual.trim() ? `${atual.trim()} ${fala}` : fala))
            }
          />
          <button
            type="submit"
            disabled={!texto.trim() || pensando}
            aria-label="Enviar"
            className="btn-press rounded-xl p-2.5"
            style={{
              background: texto.trim() && !pensando ? C.brand : C.panel2,
              color: texto.trim() && !pensando ? C.onBrand : C.inkFaint,
            }}
          >
            {pensando ? <Spinner /> : <Send size={16} />}
          </button>
        </div>
      </form>
    </div>
  );
}
