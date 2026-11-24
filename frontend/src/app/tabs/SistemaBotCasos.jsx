import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { diferencasDoCaso, mensagensDoCaso, mudancasDoCaso } from "../../domain/botCasos.js";
import { useBotCasosAConferir } from "../../hooks/useBotCasosAConferir.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { FadeIn, Presence, Skeleton, Spinner, fadeScale } from "../../ui/motion/index.js";
import { C, Card, ErrorBanner } from "../tabShared.jsx";

// Issue #508: casos do banco de casos em que a reserva mudou depois de uma nova mensagem do
// cliente. A avaliação não conta "errado" neles até o dono dizer qual vale: o da marca (o cliente
// mudou depois) ou o de agora (a reserva lançada no Agendado estava errada).

const SAIDA_MS = 200;

const quando = (iso) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Fortaleza",
      })
    : "";

function Caso({ caso, salvando, onConferir }) {
  const mudancas = mudancasDoCaso(caso);
  const mensagens = mensagensDoCaso(caso);
  const diferencas = diferencasDoCaso(caso);
  const ocupado = salvando !== null;
  const botao = (vale, texto, principal) => (
    <button
      type="button"
      onClick={() => onConferir(caso, vale)}
      disabled={ocupado}
      className="btn-press text-xs px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 disabled:opacity-40"
      style={
        principal
          ? { background: C.amber, color: C.onBrand }
          : { background: C.panel, color: C.ink, border: `1px solid ${C.border}` }
      }
    >
      {salvando === vale && <Spinner size={12} />}
      {texto}
    </button>
  );
  return (
    <div className="rounded-lg p-3 text-xs" style={{ background: C.panel2 }}>
      <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5">
        <span className="font-medium" style={{ color: C.ink }}>
          Conversa {caso.chatwoot_conversation_id}
        </span>
        <span style={{ color: C.inkFaint }}>Agendado {quando(caso.marca_em)}</span>
      </div>

      {mensagens.length > 0 && (
        <div className="mt-2 space-y-1">
          <div style={{ color: C.inkSoft }}>Cliente escreveu depois:</div>
          {mensagens.map((m, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: mensagens só são lidas, nunca reordenadas
              key={i}
              className="rounded-md px-2 py-1 break-words"
              style={{ background: C.panel, color: C.ink }}
            >
              <span style={{ color: C.inkFaint }}>{quando(m.em)} · </span>
              {m.texto}
            </div>
          ))}
        </div>
      )}

      <ul className="mt-2 space-y-1.5">
        {mudancas.map((m) => (
          <li key={m.reserva || m.daMarca} className="break-words">
            <div style={{ color: C.inkSoft }}>
              Mudou {m.campos.join(", ") || "a reserva"}
              {m.em && ` às ${quando(m.em)}`}
            </div>
            <div style={{ color: C.ink }}>Na marca: {m.daMarca}</div>
            <div style={{ color: C.ink }}>Agora: {m.deAgora}</div>
          </li>
        ))}
      </ul>

      {diferencas.length > 0 && (
        <div className="mt-2 break-words" style={{ color: C.inkSoft }}>
          Leitura do bot: {diferencas.join("; ")}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {botao("marca", "Cliente mudou depois: vale o da marca", true)}
        {botao("agora", "A marca estava errada: vale o de agora", false)}
      </div>
    </div>
  );
}

export default function SistemaBotCasos() {
  const { casos, carregando, erro, recarregar, conferir } = useBotCasosAConferir();
  const [salvando, setSalvando] = useState({});
  const [saindo, setSaindo] = useState(() => new Set());
  const [erroSalvar, setErroSalvar] = useState("");

  const aoConferir = async (caso, vale) => {
    setErroSalvar("");
    setSalvando((s) => ({ ...s, [caso.id]: vale }));
    try {
      await conferir(caso.id, vale);
      setSaindo((prev) => new Set(prev).add(caso.id));
      setTimeout(recarregar, SAIDA_MS);
    } catch (e) {
      setErroSalvar(mensagemAmigavel(e, "Não foi possível salvar a conferência (só admin)."));
    } finally {
      setSalvando((s) => ({ ...s, [caso.id]: null }));
    }
  };

  const faltam = casos.filter((c) => !saindo.has(c.id)).length;

  return (
    <Card>
      <div className="text-sm font-semibold flex items-center gap-2 mb-1">
        <ClipboardCheck size={16} style={{ color: C.inkSoft }} /> Casos do bot para conferir
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        A reserva mudou depois que o cliente escreveu de novo, então a avaliação não sabe se o bot
        errou. Até você conferir, esses casos ficam como pendentes, sem contar como erro nem como
        acerto.
      </p>

      {erro && (
        <ErrorBanner onRetry={recarregar} className="mb-3">
          {mensagemAmigavel(erro, "Não foi possível ler os casos do bot.")}
        </ErrorBanner>
      )}
      {erroSalvar && (
        <ErrorBanner onDismiss={() => setErroSalvar("")} className="mb-3">
          {erroSalvar}
        </ErrorBanner>
      )}

      {carregando && casos.length === 0 && (
        <div aria-label="Carregando os casos do bot" className="space-y-2">
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
      )}

      {!carregando && !erro && casos.length === 0 && (
        <FadeIn>
          <div className="text-xs" style={{ color: C.inkFaint }}>
            Nenhum caso para conferir.
          </div>
        </FadeIn>
      )}

      {casos.length > 0 && (
        <FadeIn>
          <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
            {faltam} caso(s)
          </div>
          <div className="space-y-2">
            {casos.map((caso) => (
              <Presence
                key={caso.id}
                when={!saindo.has(caso.id)}
                duration={SAIDA_MS}
                {...fadeScale}
              >
                <Caso caso={caso} salvando={salvando[caso.id] ?? null} onConferir={aoConferir} />
              </Presence>
            ))}
          </div>
        </FadeIn>
      )}
    </Card>
  );
}
