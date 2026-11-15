import { Check, Copy, MessageCircle, PhoneCall, X } from "lucide-react";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatarTelefoneBR } from "../../domain/agendaLinha.js";
import { TEXTO_PADRAO, montarAvisos } from "../../domain/avisoAosPassageiros.js";
import { useAvisos } from "../../hooks/useAvisos.js";
import { copiarTexto } from "../../lib/clipboard.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { Spinner } from "../../ui/motion/index.js";
import { C, todayStr } from "../tabShared.jsx";

const ROTULO_DO_STATUS = {
  enviado: "avisado",
  fora_da_janela: "fora das 24 h",
  sem_conversa: "sem conversa",
  falhou: "falhou",
};
const hora = (iso) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * "Avisar passageiros" (issue #432): a mensagem de cada passageiro da viagem com o horário do
 * ponto dele. A equipe confere, ajusta o texto, desmarca quem não deve receber e toca Enviar —
 * nada sai sem esse toque. Quem está fora das 24 h do WhatsApp (sem o modelo da Meta) ou sem
 * conversa fica na lista "Avisar pelo celular".
 */
export default function AvisarPassageiros({
  data,
  direcao,
  reservas,
  pontos,
  segundaAtiva,
  segundaHoras,
  onFechar,
}) {
  const { avisos, loading, enviar, enviando } = useAvisos(data, direcao);
  const [modelo, setModelo] = useState(TEXTO_PADRAO);
  const lista = useMemo(
    () =>
      montarAvisos({
        reservas,
        data,
        direcao,
        hoje: todayStr(),
        pontos,
        segundaAtiva,
        segundaHoras,
        modelo,
        avisos,
      }),
    [reservas, data, direcao, pontos, segundaAtiva, segundaHoras, modelo, avisos],
  );
  const [desmarcados, setDesmarcados] = useState(() => new Set());
  const [marcadosAMais, setMarcadosAMais] = useState(() => new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  const marcado = (a) => (a.marcado ? !desmarcados.has(a.id) : marcadosAMais.has(a.id));
  const alternar = (a) => {
    setConfirmando(false);
    const [set, setSet] = a.marcado
      ? [desmarcados, setDesmarcados]
      : [marcadosAMais, setMarcadosAMais];
    const novo = new Set(set);
    if (novo.has(a.id)) novo.delete(a.id);
    else novo.add(a.id);
    setSet(novo);
  };
  const escolhidos = lista.filter(marcado);

  const enviarAgora = async () => {
    if (!confirmando) {
      setConfirmando(true);
      return;
    }
    setErro("");
    try {
      const r = await enviar(
        escolhidos.map((a) => ({ reservation_id: a.id, texto: a.texto, ...a.variaveis })),
      );
      setResultado(r);
      setConfirmando(false);
      setDesmarcados(new Set());
      setMarcadosAMais(new Set());
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível enviar."));
      setConfirmando(false);
    }
  };

  // quem não recebeu pelo WhatsApp (nesta rodada ou antes): avisar pelo celular
  const statusAtual = (a) =>
    resultado?.find((x) => x.reservation_id === a.id)?.status ?? a.anterior?.status ?? null;
  const peloCelular = lista.filter((a) =>
    ["fora_da_janela", "sem_conversa", "falhou"].includes(statusAtual(a)),
  );
  const copiarTelefones = async () => {
    const ok = await copiarTexto(
      peloCelular
        .map((a) => `${a.nome || "(sem nome)"} — ${a.telefone} — ${a.pontoNome} ${a.horario ?? ""}`)
        .join("\n"),
    );
    setCopiado(ok);
  };

  const titulo = `Avisar passageiros · ${direcao === "ida" ? "Ida" : "Volta"} ${data.split("-").reverse().slice(0, 2).join("/")}`;
  return createPortal(
    <div
      className="fixed inset-0 z-40 anim-fadeIn"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onFechar}
      onKeyDown={(e) => e.key === "Escape" && onFechar()}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        data-testid="avisar-passageiros"
        className="absolute inset-x-2 md:left-1/2 md:right-auto md:w-[460px] md:-translate-x-1/2 rounded-3xl border flex flex-col anim-slideDown"
        style={{
          top: "max(12px, env(safe-area-inset-top))",
          bottom: "max(8px, env(safe-area-inset-bottom))",
          background: C.panel,
          borderColor: C.border,
          boxShadow: "0 24px 48px -16px #000",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <h2 className="text-[16px] font-semibold" style={{ color: C.ink }}>
            {titulo}
          </h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="btn-press w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ color: C.inkSoft }}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3">
          <p className="text-[12px] leading-relaxed" style={{ color: C.inkSoft }}>
            Quem escreveu nas últimas 24 h recebe pelo WhatsApp; quem não escreveu só recebe com o
            modelo aprovado pela Meta. Quem ficar de fora aparece em "Avisar pelo celular".
          </p>
          <label className="block">
            <span className="text-[12px] font-semibold" style={{ color: C.inkSoft }}>
              Texto
            </span>
            <textarea
              value={modelo}
              onChange={(e) => {
                setModelo(e.target.value);
                setConfirmando(false);
              }}
              rows={4}
              className="mt-1 w-full rounded-xl px-3 py-2 text-[14px] leading-snug"
              style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
            />
            <span className="text-[11px]" style={{ color: C.inkFaint }}>
              {"{saudacao}"} = "Olá, Maria!" · {"{quando}"} = "de amanhã, segunda (16/11)" ·{" "}
              {"{aviso_do_dia}"} = a Ida da segunda mais cedo · {"{embarque}"} = ponto e horário de
              cada um
            </span>
          </label>

          {loading && !lista.length ? (
            <div className="py-6 flex justify-center">
              <Spinner />
            </div>
          ) : lista.length === 0 ? (
            <p className="text-[13px] py-4" style={{ color: C.inkFaint }}>
              Nenhum passageiro com telefone nesta viagem.
            </p>
          ) : (
            <ul className="space-y-1.5" aria-label="Passageiros">
              {lista.map((a) => {
                const st = statusAtual(a);
                return (
                  <li key={a.id}>
                    <label
                      className="flex items-start gap-3 rounded-xl px-3 py-2.5 cursor-pointer"
                      style={{ background: C.panel2 }}
                    >
                      <input
                        type="checkbox"
                        checked={marcado(a)}
                        onChange={() => alternar(a)}
                        className="mt-1 w-5 h-5 shrink-0"
                        aria-label={`Avisar ${a.nome || a.telefone}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className="text-[14px] font-semibold truncate"
                            style={{ color: C.ink }}
                          >
                            {a.nome || formatarTelefoneBR(a.telefone)}
                          </span>
                          <span
                            className="text-[12px] shrink-0 tabular-nums"
                            style={{ color: C.inkSoft }}
                          >
                            {a.pontoNome} · {a.horario ?? "—"}
                          </span>
                        </span>
                        {st && (
                          <span
                            className="inline-block text-[11px] mt-0.5 px-1.5 rounded"
                            style={{
                              background: st === "enviado" ? C.greenSoft : C.panel,
                              color: st === "enviado" ? C.green : C.warn,
                            }}
                          >
                            {ROTULO_DO_STATUS[st] ?? st}
                            {st === "enviado" && a.anterior?.criado_em
                              ? ` ${hora(a.anterior.criado_em)}`
                              : ""}
                          </span>
                        )}
                        <span
                          className="block text-[12px] mt-1 leading-snug line-clamp-3"
                          style={{ color: C.inkFaint }}
                        >
                          {a.texto}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {peloCelular.length > 0 && (
            <section
              className="rounded-xl px-3 py-3"
              style={{ border: `1px solid ${C.border}` }}
              data-testid="avisar-pelo-celular"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-[13px] font-semibold" style={{ color: C.ink }}>
                  Avisar pelo celular ({peloCelular.length})
                </h3>
                <button
                  type="button"
                  onClick={copiarTelefones}
                  className="btn-press flex items-center gap-1 text-[12px] px-2.5 min-h-[36px] rounded-lg"
                  style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
                >
                  {copiado ? <Check size={13} /> : <Copy size={13} />}{" "}
                  {copiado ? "Copiado" : "Copiar lista"}
                </button>
              </div>
              <ul className="space-y-1">
                {peloCelular.map((a) => {
                  const tel = String(a.telefone).replace(/\D/g, "");
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate" style={{ color: C.inkSoft }}>
                        {a.nome || "(sem nome)"} · {a.pontoNome} {a.horario ?? ""}
                      </span>
                      <span className="flex shrink-0">
                        <a
                          href={`tel:${tel}`}
                          aria-label={`Ligar para ${a.nome || a.telefone}`}
                          className="btn-press w-11 h-11 rounded-xl flex items-center justify-center"
                          style={{ color: C.inkSoft }}
                        >
                          <PhoneCall size={17} />
                        </a>
                        <a
                          href={`https://wa.me/55${tel}?text=${encodeURIComponent(a.texto)}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Abrir o WhatsApp de ${a.nome || a.telefone} com o aviso`}
                          className="btn-press w-11 h-11 rounded-xl flex items-center justify-center"
                          style={{ color: C.inkSoft }}
                        >
                          <MessageCircle size={17} />
                        </a>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {erro && (
            <p role="alert" className="text-[13px]" style={{ color: C.brandText }}>
              {erro}
            </p>
          )}
        </div>
        <div className="px-4 pb-4 pt-2 border-t" style={{ borderColor: C.border }}>
          {resultado && (
            <p
              className="text-[12px] mb-2"
              style={{ color: C.inkSoft }}
              data-testid="resultado-do-aviso"
            >
              {(() => {
                const n = resultado.filter((x) => x.status === "enviado").length;
                const f = resultado.length - n;
                return `${n} ${n === 1 ? "enviado" : "enviados"} · ${f} para avisar pelo celular`;
              })()}
            </p>
          )}
          <button
            type="button"
            onClick={enviarAgora}
            disabled={!escolhidos.length || enviando}
            className="btn-press w-full min-h-[48px] rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: C.brand, color: "#fff" }}
          >
            {enviando ? (
              <>
                <Spinner size={16} /> Enviando…
              </>
            ) : confirmando ? (
              `Confirmar: enviar para ${escolhidos.length}`
            ) : (
              `Enviar para ${escolhidos.length}`
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
