import { Gauge, MessageCircleMore } from "lucide-react";
import { useState } from "react";
import { PERIODOS_DO_ACERTO, correcoesPorReserva, nivelDoAcerto } from "../../domain/botAcerto.js";
import { useBotAcerto } from "../../hooks/useBotAcerto.js";
import { useSettings } from "../../hooks/useSettings.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { FadeIn, Skeleton, SkeletonStat, Spinner, Stagger } from "../../ui/motion/index.js";
import { C, Card, ErrorBanner } from "../tabShared.jsx";

// Issue #311: quantas reservas o bot lançou e quantas a equipe precisou corrigir —
// o número que diz quando dá para ligar o modo automático. Issue #310: liga/desliga a
// confirmação da reserva ao cliente depois do "Agendado ☑️".

const COR_DO_NIVEL = { bom: C.rota, atencao: C.warn, ruim: C.red, sem_dados: C.inkFaint };

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

function Numero({ rotulo, valor, cor }) {
  return (
    <div className="rounded-lg p-3" style={{ background: C.panel2 }}>
      <div className="text-xs" style={{ color: C.inkSoft }}>
        {rotulo}
      </div>
      <div className="text-xl font-semibold" style={{ color: cor ?? C.ink }}>
        {valor}
      </div>
    </div>
  );
}

function ConfirmacaoAoCliente() {
  const cfg = useSettings();
  const [erro, setErro] = useState("");
  const ligada = cfg.agendadoConfirmacao;
  const alternar = async () => {
    setErro("");
    try {
      await cfg.setAgendadoConfirmacao(!ligada);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar (só admin)."));
    }
  };
  return (
    <div className="rounded-lg p-3 mt-4" style={{ background: C.panel2 }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium flex items-center gap-2">
            <MessageCircleMore size={15} style={{ color: C.brandText }} /> Confirmar ao cliente
          </div>
          <p className="text-xs mt-1" style={{ color: C.inkSoft }}>
            Depois do "Agendado ☑️", o bot manda ao cliente o resumo da vaga (dia, sentido, embarque,
            desembarque e quantidade, sem valor) e pede o que faltou. Se algo estiver errado, o
            próprio cliente avisa.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ligada}
          aria-label="Confirmar ao cliente a reserva do Agendado"
          onClick={alternar}
          disabled={cfg.saving || cfg.loading}
          className="btn-press shrink-0 text-xs px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 disabled:opacity-40"
          style={
            ligada
              ? { background: C.amber, color: C.onBrand }
              : { background: C.panel, color: C.inkSoft, border: `1px solid ${C.border}` }
          }
        >
          {cfg.saving && <Spinner size={12} />}
          {ligada ? "Ligada" : "Desligada"}
        </button>
      </div>
      {erro && (
        <ErrorBanner onDismiss={() => setErro("")} className="mt-2">
          {erro}
        </ErrorBanner>
      )}
    </div>
  );
}

export default function SistemaBotAcerto() {
  const [dias, setDias] = useState(30);
  const { dados, carregando, erro, recarregar } = useBotAcerto(dias);
  const nivel = nivelDoAcerto(dados?.acerto, dados?.lancadas);
  const grupos = correcoesPorReserva(dados?.correcoes);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Gauge size={16} style={{ color: C.brandText }} /> Acerto do bot
        </div>
        <fieldset className="flex gap-1 border-0 p-0 m-0" aria-label="Período do acerto">
          {PERIODOS_DO_ACERTO.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={dias === d}
              onClick={() => setDias(d)}
              className="btn-press text-xs px-2 py-1 rounded-md"
              style={
                dias === d
                  ? { background: C.amberSoft, color: C.brandText, border: `1px solid ${C.amber}66` }
                  : { background: C.panel2, color: C.inkSoft, border: `1px solid ${C.border}` }
              }
            >
              {d} dias
            </button>
          ))}
        </fieldset>
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Reservas lançadas pelo bot (Agendado ☑️ e atendimento automático) e quantas a equipe precisou
        corrigir depois. Mudança que o cliente pediu também aparece na lista: confira cada uma.
      </p>

      {erro && (
        <ErrorBanner onRetry={recarregar} className="mb-3">
          {mensagemAmigavel(erro, "Não foi possível ler o acerto do bot.")}
        </ErrorBanner>
      )}

      {carregando && !dados && (
        <div aria-label="Carregando o acerto do bot">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <SkeletonStat />
            <SkeletonStat />
            <SkeletonStat />
          </div>
          <Skeleton height={14} width="70%" />
        </div>
      )}

      {dados && (
        <FadeIn>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <Numero rotulo="Lançadas" valor={dados.lancadas} />
            <Numero rotulo="Corrigidas" valor={dados.corrigidas} />
            <Numero
              rotulo="Acerto"
              valor={dados.acerto == null ? "—" : `${dados.acerto}%`}
              cor={COR_DO_NIVEL[nivel.nivel]}
            />
          </div>
          <div className="text-xs mb-3" style={{ color: COR_DO_NIVEL[nivel.nivel] }}>
            {nivel.texto}
            {dados.completadas > 0 &&
              ` ${dados.completadas} completada(s) depois (endereço ou valor que faltava).`}
          </div>

          {grupos.length > 0 && (
            <>
              <div className="text-xs font-medium mb-2" style={{ color: C.inkSoft }}>
                Últimas correções
              </div>
              <Stagger className="space-y-2" maxItems={8}>
                {grupos.map((g) => (
                  <div
                    key={g.reserva}
                    className="rounded-lg p-2.5 text-xs"
                    style={{ background: C.panel2 }}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium" style={{ color: C.ink }}>
                        {g.cliente}
                        {g.viagem && <span style={{ color: C.inkSoft }}> · {g.viagem}</span>}
                      </span>
                      <span style={{ color: C.inkFaint }}>
                        {[g.por, quando(g.em)].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <ul className="mt-1 space-y-0.5" style={{ color: C.inkSoft }}>
                      {g.itens.map((t, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: textos podem repetir (1→2→1)
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </Stagger>
            </>
          )}
        </FadeIn>
      )}

      <ConfirmacaoAoCliente />
    </Card>
  );
}
