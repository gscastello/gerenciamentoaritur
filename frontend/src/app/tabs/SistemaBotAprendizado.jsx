import { Check, Eye, Pencil, RotateCcw, Save, Sparkles, X } from "lucide-react";
import { useState } from "react";
import {
  TIPOS_DE_LICAO,
  haQuantoTempo,
  mensagemDoAprendizado,
} from "../../domain/botAprendizado.js";
import { useBotLearnings } from "../../hooks/useBotLearnings.js";
import { useSettings } from "../../hooks/useSettings.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { C, Card, ErrorBanner, Field, Pill, TextArea, TextInput } from "../tabShared.jsx";

const botao = (cor) => ({
  background: cor ? `${cor}22` : C.panel2,
  color: cor ?? C.inkSoft,
  border: `1px solid ${cor ? `${cor}66` : C.border}`,
});

function Licao({ licao, onRevisar, onEditar, desativada }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ title: licao.title, content: licao.content });
  const [salvando, setSalvando] = useState(false);
  const tipo = TIPOS_DE_LICAO[licao.kind];
  const ehFato = licao.kind === "fato";
  const proposta = licao.status === "proposta";

  const salvar = async () => {
    if (form.title.trim().length < 3 || form.content.trim().length < 10) return;
    setSalvando(true);
    try {
      await onEditar(licao, { title: form.title.trim(), content: form.content.trim() });
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  };

  if (editando) {
    return (
      <div className="rounded-lg p-3" style={{ background: C.panel2 }}>
        <Field label="Título">
          <TextInput
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field label="O que o bot aprendeu">
          <TextArea
            rows={3}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </Field>
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando}
            className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40"
            style={{ background: C.amber, color: C.onBrand }}
          >
            <Save size={13} /> {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="btn-press text-xs px-3 py-1.5 rounded-md"
            style={botao()}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: C.panel2, opacity: desativada ? 0.6 : 1 }}
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <Pill color={ehFato ? C.warn : C.blue}>{tipo?.rotulo ?? licao.kind}</Pill>
        {licao.evidence_count > 1 && (
          <span className="text-[11px]" style={{ color: C.inkFaint }}>
            visto {licao.evidence_count}×
          </span>
        )}
        <span className="text-[11px]" style={{ color: C.inkFaint }}>
          · {haQuantoTempo(licao.last_seen_at)}
        </span>
      </div>
      <div className="text-[13px] font-semibold" style={{ color: C.ink }}>
        {licao.title}
      </div>
      <div className="text-[12px] mt-0.5" style={{ color: C.inkSoft, overflowWrap: "anywhere" }}>
        {licao.content}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {desativada ? (
          <button
            type="button"
            onClick={() => onRevisar(licao, "restaurar")}
            aria-label={`Restaurar ${licao.title}`}
            className="btn-press flex items-center gap-1 text-[11px] px-2 py-1 rounded-md"
            style={botao()}
          >
            <RotateCcw size={12} /> Restaurar para revisão
          </button>
        ) : (
          <>
            {proposta ? (
              <button
                type="button"
                onClick={() => onRevisar(licao, "aprovar")}
                aria-label={`Aprovar ${licao.title}`}
                className="btn-press flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md"
                style={botao(C.green)}
              >
                <Check size={12} /> Aprovar
              </button>
            ) : licao.needs_review ? (
              <button
                type="button"
                onClick={() => onRevisar(licao, "confirmar")}
                aria-label={`Está certo: ${licao.title}`}
                className="btn-press flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md"
                style={botao(C.green)}
              >
                <Check size={12} /> Está certo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-label={`Editar ${licao.title}`}
              className="btn-press flex items-center gap-1 text-[11px] px-2 py-1 rounded-md"
              style={botao()}
            >
              <Pencil size={12} /> Editar
            </button>
            <button
              type="button"
              onClick={() =>
                onRevisar(licao, proposta || licao.needs_review ? "recusar" : "arquivar")
              }
              aria-label={`${proposta || licao.needs_review ? "Recusar" : "Desativar"} ${licao.title}`}
              className="btn-press flex items-center gap-1 text-[11px] px-2 py-1 rounded-md"
              style={botao(C.red)}
            >
              <X size={12} /> {proposta || licao.needs_review ? "Recusar" : "Desativar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Sistema → Bot → Aprendizado do modo sombra (issue #218). No modo sombra o bot
 * observa as conversas (clientes, atendente e o rascunho dele) e propõe lições.
 * Linguagem, estilo e fluxo já valem e pedem conferência; informações (fatos)
 * só valem depois de aprovadas.
 */
export default function SistemaBotAprendizado() {
  const ap = useBotLearnings();
  const cfg = useSettings();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [verDescartadas, setVerDescartadas] = useState(false);

  const tentar = async (fn, msg) => {
    setErro("");
    try {
      return await fn();
    } catch (e) {
      setErro(mensagemAmigavel(e, msg));
      throw e;
    }
  };
  const revisar = (licao, acao) =>
    tentar(() => ap.revisar(licao, acao), "Não foi possível salvar (só admin).").catch(() => {});
  const editar = (licao, campos) =>
    tentar(() => ap.editar(licao, campos), "Não foi possível salvar (só admin).");
  const aprender = async () => {
    setAviso("");
    try {
      const r = await tentar(() => ap.aprenderAgora(), "Não foi possível aprender agora.");
      setAviso(mensagemDoAprendizado(r));
    } catch {
      /* o erro já está na tela */
    }
  };

  const n = ap.numeros;
  const emSombra = cfg.attendanceMode === "sombra";

  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Eye size={16} style={{ color: C.amber }} /> Aprendizado do modo Sombra
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        No modo Sombra o bot só observa: lê o que os clientes escrevem, como o atendente responde e
        agenda, e compara com o que ele mesmo diria. Disso saem lições, sem nomes nem telefones. O
        jeito dos clientes falarem e o estilo do atendente já passam a valer (confira abaixo);
        informações como preço, regra e horário só valem depois que você aprovar. O texto das
        conversas é apagado após 90 dias.
      </p>

      {!emSombra && (
        <div
          className="text-xs rounded-lg px-3 py-2 mb-3"
          style={{ background: C.panel2, color: C.inkSoft }}
        >
          O bot só observa conversas com o modo de atendimento em <b>Sombra</b> (aba Sistema → Modo
          de atendimento). As lições abaixo continuam valendo nos outros modos.
        </div>
      )}

      {erro && (
        <ErrorBanner onDismiss={() => setErro("")} className="mb-3">
          {erro}
        </ErrorBanner>
      )}
      {ap.error && (
        <ErrorBanner onRetry={ap.recarregar} className="mb-3">
          {mensagemAmigavel(ap.error, "Não foi possível carregar o aprendizado.")}
        </ErrorBanner>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <div className="text-xs" style={{ color: C.inkSoft }}>
          <b style={{ color: C.ink }}>{n?.observacoes ?? 0}</b> mensagens observadas ·{" "}
          <b style={{ color: C.ink }}>{n?.pendentes ?? 0}</b> esperando para aprender · último
          aprendizado {haQuantoTempo(n?.ultimo_aprendizado)}
        </div>
        <button
          type="button"
          onClick={aprender}
          disabled={ap.aprendendo}
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40"
          style={{ background: C.amber, color: C.onBrand }}
        >
          <Sparkles size={13} /> {ap.aprendendo ? "Aprendendo…" : "Aprender agora"}
        </button>
      </div>
      {aviso && (
        <div
          className="text-xs rounded-lg px-3 py-2 mb-3"
          style={{ background: C.greenSoft, color: C.green }}
        >
          {aviso}
        </div>
      )}

      <div className="text-xs font-semibold mb-2" style={{ color: C.ink }}>
        Para você revisar ({ap.paraRevisar.length})
      </div>
      {ap.paraRevisar.length === 0 ? (
        <div className="text-xs mb-3" style={{ color: C.inkFaint }}>
          Nada esperando revisão.
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {ap.paraRevisar.map((l) => (
            <Licao key={l.id} licao={l} onRevisar={revisar} onEditar={editar} />
          ))}
        </div>
      )}

      <div className="text-xs font-semibold mb-2" style={{ color: C.ink }}>
        Valendo no bot ({ap.emUso.length})
      </div>
      {ap.emUso.length === 0 ? (
        <div className="text-xs mb-3" style={{ color: C.inkFaint }}>
          Ainda não há lições revisadas em uso.
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {ap.emUso.map((l) => (
            <Licao key={l.id} licao={l} onRevisar={revisar} onEditar={editar} />
          ))}
        </div>
      )}

      {ap.descartadas.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerDescartadas((v) => !v)}
            className="btn-press text-xs underline"
            style={{ color: C.inkSoft }}
          >
            {verDescartadas ? "Ocultar" : "Ver"} recusadas e desativadas ({ap.descartadas.length})
          </button>
          {verDescartadas && (
            <div className="space-y-2 mt-2">
              {ap.descartadas.map((l) => (
                <Licao key={l.id} licao={l} onRevisar={revisar} onEditar={editar} desativada />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
