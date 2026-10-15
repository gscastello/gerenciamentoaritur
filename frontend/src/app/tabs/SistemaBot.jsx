import { BookOpen, MessageSquareText, Pause, Pencil, Play, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useBotKnowledge } from "../../hooks/useBotKnowledge.js";
import { useSettings } from "../../hooks/useSettings.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { Presence, Skeleton, fadeScale } from "../../ui/motion/index.js";
import { C, Card, ErrorBanner, Field, TextArea, TextInput } from "../tabShared.jsx";

// Duração da saída antes de tirar o item da lista de verdade — precisa
// bater com o `duration` do Presence (AGENTS.md §5).
const SAIDA_MS = 200;

function ItemConhecimento({ item, onSalvar, onAlternar, onRemover }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ title: item.title, content: item.content });
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSalvando(true);
    try {
      await onSalvar(item.id, { title: form.title.trim(), content: form.content.trim() });
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  };

  if (editando) {
    return (
      <div className="rounded-lg p-3" style={{ background: C.panel2 }}>
        <Field label="Assunto">
          <TextInput
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field label="O que o bot deve saber">
          <TextArea
            rows={4}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </Field>
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !form.title.trim() || !form.content.trim()}
            className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40"
            style={{ background: C.amber, color: C.onBrand }}
          >
            <Save size={13} /> {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setForm({ title: item.title, content: item.content });
              setEditando(false);
            }}
            className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
            style={{ background: C.panel, color: C.inkSoft }}
          >
            <X size={13} /> Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-3 flex items-start justify-between gap-3"
      style={{ background: C.panel2, opacity: item.active ? 1 : 0.55 }}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ overflowWrap: "anywhere" }}>
          {item.title}
          {!item.active && (
            <span className="ml-2 text-[10px] font-normal" style={{ color: C.inkFaint }}>
              pausado
            </span>
          )}
        </div>
        <div
          className="text-xs mt-1 whitespace-pre-wrap"
          style={{ color: C.inkSoft, overflowWrap: "anywhere" }}
        >
          {item.content}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onAlternar(item)}
          aria-label={`${item.active ? "Pausar" : "Ativar"} ${item.title}`}
          title={item.active ? "Pausar (o bot deixa de usar)" : "Ativar"}
          className="btn-press"
        >
          {item.active ? (
            <Pause size={13} style={{ color: C.inkFaint }} />
          ) : (
            <Play size={13} style={{ color: C.green }} />
          )}
        </button>
        <button
          type="button"
          onClick={() => setEditando(true)}
          aria-label={`Editar ${item.title}`}
          className="btn-press"
        >
          <Pencil size={13} style={{ color: C.inkFaint }} />
        </button>
        <button
          type="button"
          onClick={() => onRemover(item)}
          aria-label={`Remover ${item.title}`}
          className="btn-press"
        >
          <Trash2 size={13} style={{ color: C.red }} />
        </button>
      </div>
    </div>
  );
}

function GuiaDeEstilo({ valor, onSalvar, salvando }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <MessageSquareText size={16} style={{ color: C.amber }} /> Como o bot fala com o cliente
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Descreva o tom que combina com o seu público: se trata por "você" ou "senhor/senhora", se usa
        emoji, se é mais formal ou descontraído, expressões que deve usar ou evitar.
      </p>
      <Field label="Guia de estilo">
        <TextArea
          rows={5}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: Fale de forma simples e educada, trate por você, no máximo um emoji por mensagem, frases curtas."
        />
      </Field>
      <button
        type="button"
        onClick={() => onSalvar(texto.trim())}
        disabled={salvando || texto.trim() === valor}
        className="btn-press mt-2 flex items-center gap-1.5 text-xs px-3 py-2 rounded-md font-medium disabled:opacity-40"
        style={{ background: C.amber, color: C.onBrand }}
      >
        <Save size={13} /> Salvar guia de estilo
      </button>
    </Card>
  );
}

export default function SistemaBot() {
  const base = useBotKnowledge();
  const cfg = useSettings();
  const [novo, setNovo] = useState({ title: "", content: "" });
  const [erro, setErro] = useState("");
  const [saindo, setSaindo] = useState(() => new Set());

  const tentar = async (fn, msg) => {
    setErro("");
    try {
      await fn();
      return true;
    } catch (e) {
      setErro(mensagemAmigavel(e, msg));
      return false;
    }
  };

  const adicionar = async () => {
    if (!novo.title.trim() || !novo.content.trim()) return;
    const ok = await tentar(
      () => base.criar({ title: novo.title.trim(), content: novo.content.trim() }),
      "Não foi possível adicionar (só admin).",
    );
    if (ok) setNovo({ title: "", content: "" });
  };
  const salvarItem = async (id, fields) => {
    setErro("");
    try {
      await base.atualizar(id, fields);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar (só admin)."));
      throw e;
    }
  };
  const alternar = (item) =>
    tentar(() => base.atualizar(item.id, { active: !item.active }), "Não foi possível alterar.");
  const remover = (item) => {
    if (!window.confirm(`Remover "${item.title}" da base do bot?`)) return;
    setErro("");
    setSaindo((prev) => new Set(prev).add(item.id));
    setTimeout(async () => {
      try {
        await base.remover(item.id);
      } catch (e) {
        setErro(mensagemAmigavel(e, "Não foi possível remover (só admin)."));
        setSaindo((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }, SAIDA_MS);
  };

  return (
    <div className="space-y-4">
      <GuiaDeEstilo
        valor={cfg.botStyleGuide}
        onSalvar={(texto) =>
          tentar(() => cfg.setBotStyleGuide(texto), "Não foi possível salvar o guia (só admin).")
        }
        salvando={cfg.saving}
      />

      <Card>
        <div className="text-sm font-semibold mb-1 flex items-center gap-2">
          <BookOpen size={16} style={{ color: C.amber }} /> O que o bot sabe sobre a empresa
        </div>
        <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
          Um assunto por item (bagagem, crianças, cancelamento, atraso…). O bot usa estes textos
          junto com os horários, vagas e preços do sistema para responder, com as palavras dele. Se
          o assunto não estiver aqui, ele chama um atendente em vez de inventar.
        </p>

        {erro && (
          <ErrorBanner onDismiss={() => setErro("")} className="mb-3">
            {erro}
          </ErrorBanner>
        )}
        {base.error && (
          <ErrorBanner onRetry={base.recarregar} className="mb-3">
            {mensagemAmigavel(base.error, "Não foi possível carregar a base do bot.")}
          </ErrorBanner>
        )}

        <div className="rounded-lg p-3 mb-3" style={{ background: C.panel2 }}>
          <Field label="Assunto">
            <TextInput
              value={novo.title}
              onChange={(e) => setNovo({ ...novo, title: e.target.value })}
              placeholder="Ex.: Bagagem"
            />
          </Field>
          <Field label="O que o bot deve saber">
            <TextArea
              rows={3}
              value={novo.content}
              onChange={(e) => setNovo({ ...novo, content: e.target.value })}
              placeholder="Ex.: Cada passageiro pode levar uma mala grande e uma bolsa de mão sem custo. Volumes maiores precisam ser combinados com a equipe."
            />
          </Field>
          <button
            type="button"
            onClick={adicionar}
            disabled={!novo.title.trim() || !novo.content.trim() || base.salvando}
            className="btn-press mt-2 flex items-center gap-1.5 text-xs px-3 py-2 rounded-md font-medium disabled:opacity-40"
            style={{ background: C.amber, color: C.onBrand }}
          >
            <Plus size={13} /> Adicionar à base
          </button>
        </div>

        {base.loading && base.itens.length === 0 && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={64} rounded={10} />
            ))}
          </div>
        )}
        {!base.loading && !base.error && base.itens.length === 0 && (
          <div className="text-center py-4 text-xs" style={{ color: C.inkFaint }}>
            Nada cadastrado ainda — o bot vai transferir para a equipe qualquer pergunta fora do
            roteiro de reservas.
          </div>
        )}
        <div className="space-y-2">
          {base.itens.map((item) => (
            <Presence
              key={item.id}
              when={!saindo.has(item.id)}
              duration={SAIDA_MS}
              {...fadeScale}
            >
              <ItemConhecimento
                item={item}
                onSalvar={salvarItem}
                onAlternar={alternar}
                onRemover={remover}
              />
            </Presence>
          ))}
        </div>
      </Card>
    </div>
  );
}
