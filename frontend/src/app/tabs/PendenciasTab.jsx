import { Check, MessageCircle, PhoneCall, X } from "lucide-react";
import { useState } from "react";
import { mensagemAmigavel } from "../../lib/erros.js";
import { C, Card, Header, TextInput, digitos, tempoRelativo } from "../tabShared.jsx";

/* ===================== PENDÊNCIAS (fila de atendimento) ===================== */
// Atendimentos que precisam da equipe: o bot de WhatsApp transferiu, ou
// alguém abriu à mão ("ligar de volta para o cliente X"). Cada pendência
// nova também toca o sino (database/32).
export default function PendenciasTab({ pend }) {
  const [novo, setNovo] = useState({ subject: "", detail: "", phone: "" });
  const [erro, setErro] = useState("");
  const abrir = async () => {
    if (!novo.subject.trim()) return;
    setErro("");
    try {
      await pend.abrir({
        subject: novo.subject.trim(),
        detail: novo.detail.trim(),
        phone: novo.phone.trim() || null,
      });
      setNovo({ subject: "", detail: "", phone: "" });
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível abrir a pendência."));
    }
  };
  const resolver = async (id) => {
    setErro("");
    try {
      await pend.resolver(id);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível resolver."));
    }
  };
  const fonte = (s) => (s === "whatsapp" ? "WhatsApp" : s === "sistema" ? "Sistema" : "Manual");
  return (
    <div>
      <Header
        title="Pendências"
        subtitle="Atendimentos que precisam da equipe — do bot de WhatsApp ou abertos à mão."
      />
      <div className="px-6 md:px-10 pb-10 space-y-4">
        {erro && (
          <div
            className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <span>{erro}</span>
            <button type="button" onClick={() => setErro("")}>
              <X size={13} />
            </button>
          </div>
        )}

        <Card>
          <div className="text-sm font-semibold mb-2" style={{ color: C.ink }}>
            Nova pendência
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            <TextInput
              placeholder="Assunto (ex.: ligar de volta)"
              value={novo.subject}
              onChange={(e) => setNovo({ ...novo, subject: e.target.value })}
            />
            <TextInput
              placeholder="Telefone (opcional)"
              value={novo.phone}
              onChange={(e) => setNovo({ ...novo, phone: e.target.value })}
            />
            <TextInput
              placeholder="Detalhe (opcional)"
              value={novo.detail}
              onChange={(e) => setNovo({ ...novo, detail: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={abrir}
            disabled={!novo.subject.trim()}
            className="btn-press mt-2 text-xs px-3 py-2 rounded-lg font-medium"
            style={{
              background: novo.subject.trim() ? C.amber : C.border,
              color: novo.subject.trim() ? C.onBrand : C.inkFaint,
            }}
          >
            Abrir pendência
          </button>
        </Card>

        {pend.loading && pend.pendencias.length === 0 && (
          <Card>
            <div className="text-center py-6 text-xs" style={{ color: C.inkFaint }}>
              carregando…
            </div>
          </Card>
        )}
        {!pend.loading && pend.pendencias.length === 0 && (
          <Card>
            <div className="text-center py-6 text-xs" style={{ color: C.inkFaint }}>
              Nenhuma pendência aberta.
            </div>
          </Card>
        )}
        {pend.pendencias.map((p) => {
          const tel = digitos(p.phone);
          return (
            <Card key={p.id}>
              <div
                className="text-sm font-semibold"
                style={{ color: C.ink, overflowWrap: "anywhere" }}
              >
                {p.assunto}
              </div>
              {p.detail && (
                <div
                  className="text-xs mt-0.5"
                  style={{ color: C.inkSoft, overflowWrap: "anywhere" }}
                >
                  {p.detail}
                </div>
              )}
              <div
                className="text-[11px] mt-1 flex flex-wrap items-center gap-1.5"
                style={{ color: C.inkFaint }}
              >
                <span>{fonte(p.source)}</span>
                {p.cliente && <span>· {p.cliente}</span>}
                {p.phone && <span>· {p.phone}</span>}
                <span>· {tempoRelativo(p.created_at)}</span>
                {p.aberto_por && <span>· por {p.aberto_por}</span>}
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {tel && (
                  <a
                    href={`https://wa.me/55${tel}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md"
                    style={{ background: C.panel2, color: C.ink }}
                  >
                    <MessageCircle size={13} /> Abrir no WhatsApp
                  </a>
                )}
                {tel && (
                  <a
                    href={`tel:${tel}`}
                    className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md"
                    style={{ background: C.panel2, color: C.inkSoft }}
                  >
                    <PhoneCall size={13} /> Ligar
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => resolver(p.id)}
                  className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-semibold"
                  style={{ background: C.panel, color: C.ink, border: `1px solid ${C.border}` }}
                >
                  <Check size={13} /> Resolver
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
