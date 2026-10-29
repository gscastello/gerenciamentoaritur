import { Check, Eye, Pencil, RotateCcw, Save, Sparkles, X } from "lucide-react";
import { useState } from "react";
import {
  TIPOS_DE_LICAO,
  TIPOS_QUE_EXIGEM_APROVACAO,
  haQuantoTempo,
  mensagemDoAprendizado,
} from "../../domain/botAprendizado.js";
import { useBotLearnings } from "../../hooks/useBotLearnings.js";
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
  const exigeAprovacao = TIPOS_QUE_EXIGEM_APROVACAO.includes(licao.kind);
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
        <Pill color={exigeAprovacao ? C.warn : C.blue}>{tipo?.rotulo ?? licao.kind}</Pill>
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

function NotaDoCliente({ nota, onEditar }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nota.notes);
  const [salvando, setSalvando] = useState(false);
  const desativada = nota.status !== "ativa";

  const salvar = async () => {
    if (texto.trim().length < 10) return;
    setSalvando(true);
    try {
      await onEditar(nota, { notes: texto.trim() });
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: C.panel2, opacity: desativada ? 0.6 : 1 }}
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <span className="text-[13px] font-semibold" style={{ color: C.ink }}>
          {nota.customer_name}
        </span>
        {nota.evidence_count > 1 && (
          <span className="text-[11px]" style={{ color: C.inkFaint }}>
            atualizado {nota.evidence_count}×
          </span>
        )}
        <span className="text-[11px]" style={{ color: C.inkFaint }}>
          · {haQuantoTempo(nota.last_seen_at)}
        </span>
        {desativada && <Pill color={C.inkFaint}>desativada</Pill>}
      </div>
      {editando ? (
        <>
          <Field label={`Anotação sobre ${nota.customer_name}`}>
            <TextArea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
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
        </>
      ) : (
        <>
          <div className="text-[12px]" style={{ color: C.inkSoft, overflowWrap: "anywhere" }}>
            {nota.notes}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-label={`Editar anotação de ${nota.customer_name}`}
              className="btn-press flex items-center gap-1 text-[11px] px-2 py-1 rounded-md"
              style={botao()}
            >
              <Pencil size={12} /> Editar
            </button>
            <button
              type="button"
              onClick={() => onEditar(nota, { status: desativada ? "ativa" : "arquivada" })}
              aria-label={`${desativada ? "Reativar" : "Desativar"} anotação de ${nota.customer_name}`}
              className="btn-press flex items-center gap-1 text-[11px] px-2 py-1 rounded-md"
              style={desativada ? botao() : botao(C.red)}
            >
              {desativada ? (
                <>
                  <RotateCcw size={12} /> Reativar
                </>
              ) : (
                <>
                  <X size={12} /> Desativar
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Sistema → Bot → Aprendizado do bot (issue #218). O bot observa as conversas em
 * qualquer modo (clientes, atendente, o que ele mesmo enviou e o rascunho do modo
 * sombra), propõe lições e anota o que vale lembrar de cada cliente recorrente.
 * Linguagem, estilo, fluxo e respostas por situação já valem e pedem conferência;
 * informações (fatos e funcionamento da empresa) só valem depois de aprovadas.
 */
export default function SistemaBotAprendizado() {
  const ap = useBotLearnings();
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [verDescartadas, setVerDescartadas] = useState(false);
  const [verClientes, setVerClientes] = useState(false);

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
  const editarNota = (nota, campos) =>
    tentar(() => ap.editarNota(nota, campos), "Não foi possível salvar (só admin).");
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

  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Eye size={16} style={{ color: C.amber }} /> Aprendizado do bot
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        O bot está sempre aprendendo, em qualquer modo de atendimento (IA, manual ou sombra): lê o
        que os clientes escrevem, como o atendente responde e agenda, o que ele mesmo respondeu e o
        que cada situação pede. Disso saem lições, sem nomes nem telefones, e uma anotação por
        cliente recorrente. O jeito dos clientes falarem, o estilo do atendente e as respostas por
        situação já passam a valer (confira abaixo); informações como preço, regra, horário e o
        funcionamento da empresa só valem depois que você aprovar. O texto das conversas é apagado
        após 90 dias.
      </p>

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

      <div className="mb-3">
        <button
          type="button"
          onClick={() => setVerClientes((v) => !v)}
          className="btn-press text-xs font-semibold underline"
          style={{ color: C.ink }}
        >
          {verClientes ? "Ocultar" : "Ver"} clientes recorrentes ({ap.notasDeClientes.length})
        </button>
        {verClientes && (
          <div className="space-y-2 mt-2">
            {ap.notasDeClientes.length === 0 ? (
              <div className="text-xs" style={{ color: C.inkFaint }}>
                Nenhum cliente anotado ainda. As anotações aparecem quando um cliente com 2 ou mais
                viagens conversa com a empresa.
              </div>
            ) : (
              ap.notasDeClientes.map((n) => (
                <NotaDoCliente key={n.id} nota={n} onEditar={editarNota} />
              ))
            )}
          </div>
        )}
      </div>

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
