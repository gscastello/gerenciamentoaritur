import { NotebookPen, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { useNotes } from "../../hooks/useNotes.js";
import { Skeleton } from "../../ui/motion/index.js";
import { C, Header } from "../tabShared.jsx";

/* ===================== BLOCO DE NOTAS DA AGENDA (issue #90) ================
   Notas soltas, sem data obrigatória — bloco de notas de verdade
   (substituiu o antigo bloco por data, que era só rede de segurança pra
   colar a lista do Evernote). Cada card salva sozinho enquanto edita. */
function fmtNotaStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoje = d.toDateString() === new Date().toDateString();
  return hoje
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function NotaCard({ nota, onChange, onBlur, onTogglePin, onRemove }) {
  return (
    <div
      className="rounded-xl border p-3 flex flex-col gap-2"
      style={{
        background: C.panel,
        borderColor: nota.pinned ? C.brandDim : C.border,
        minHeight: 180,
      }}
    >
      <textarea
        value={nota.content}
        onChange={(e) => onChange(nota.id, e.target.value)}
        onBlur={(e) => onBlur(nota.id, e.target.value)}
        spellCheck={false}
        placeholder="Escreva aqui…"
        className="w-full flex-1 bg-transparent outline-none resize-none leading-relaxed"
        style={{ color: C.ink, fontSize: "0.85rem", minHeight: 110 }}
      />
      <div className="flex items-center justify-between text-[11px]" style={{ color: C.inkFaint }}>
        <span>{fmtNotaStamp(nota.updated_at)}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onTogglePin(nota.id, nota.pinned)}
            className="btn-press rounded-md p-1.5"
            style={{ color: nota.pinned ? C.brand : C.inkFaint }}
            aria-label={nota.pinned ? "Desafixar" : "Fixar"}
            title={nota.pinned ? "Desafixar" : "Fixar"}
          >
            {nota.pinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            type="button"
            onClick={() => onRemove(nota.id)}
            className="btn-press rounded-md p-1.5"
            style={{ color: C.inkFaint }}
            aria-label="Apagar"
            title="Apagar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BlocoDeNotasTab() {
  const { notes, loading, error, create, creating, scheduleSave, flush, togglePin, remove } =
    useNotes();

  return (
    <div>
      <Header
        title="Bloco de notas"
        subtitle="Notas soltas para o que quiser — recados, listas, rascunhos. Salva sozinho, sincroniza com a equipe na hora."
        right={
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium"
            style={{ background: C.brand, color: "#fff", opacity: creating ? 0.7 : 1 }}
          >
            <Plus size={14} />
            Nova nota
          </button>
        }
      />
      <div className="px-6 md:px-10 pb-10">
        {error && (
          <div
            className="text-xs rounded-lg px-3 py-2 mb-3"
            style={{ background: C.redSoft, color: C.red }}
          >
            Não foi possível carregar as notas. {error?.message}
          </div>
        )}

        {loading ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
          >
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={180} rounded={12} />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div
            className="rounded-xl border p-8 text-center"
            style={{ borderColor: C.border, color: C.inkFaint }}
          >
            <NotebookPen size={22} className="mx-auto mb-2" style={{ color: C.inkFaint }} />
            <div className="text-sm" style={{ color: C.inkSoft }}>
              Nenhuma nota ainda.
            </div>
            <button
              type="button"
              onClick={create}
              className="btn-press text-xs px-3 py-2 rounded-lg font-medium mt-3"
              style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
            >
              Criar a primeira
            </button>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
          >
            {notes.map((nota) => (
              <NotaCard
                key={nota.id}
                nota={nota}
                onChange={scheduleSave}
                onBlur={flush}
                onTogglePin={togglePin}
                onRemove={(id) => {
                  if (window.confirm("Apagar esta nota? Não dá para desfazer.")) remove(id);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
