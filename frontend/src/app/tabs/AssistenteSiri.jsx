import { ChevronDown, Copy, KeyRound, Mic, Trash2 } from "lucide-react";
import { useState } from "react";
import { useChavesDoAssistente } from "../../hooks/useChavesDoAssistente.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { FadeIn, Presence, Skeleton, Spinner, fadeSlideDown } from "../../ui/motion/index.js";
import { C, ErrorBanner } from "../tabShared.jsx";

/* ===================== ASSISTENTE PELA SIRI (issue #290) =====================
   Chave pessoal para o atalho do iPhone (app Atalhos). A chave aparece uma vez;
   no banco fica só o hash. Apagar a chave desliga o atalho na hora. */

const URL_VOZ = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/assistente-voz`;

function fmtData(iso) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Copiar({ texto, rotulo }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* sem área de transferência: a pessoa seleciona e copia na mão */
        }
      }}
      className="btn-press flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs shrink-0"
      style={{ background: C.panel, color: C.inkSoft }}
      aria-label={rotulo}
    >
      <Copy size={12} /> {ok ? "Copiado" : "Copiar"}
    </button>
  );
}

function Campo({ titulo, valor, rotulo }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-2.5 py-2"
      style={{ background: C.panel2 }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide" style={{ color: C.inkFaint }}>
          {titulo}
        </div>
        <div className="text-xs break-all font-mono" style={{ color: C.ink }}>
          {valor}
        </div>
      </div>
      <Copiar texto={valor} rotulo={rotulo} />
    </div>
  );
}

const PASSOS = [
  'No iPhone, abra o app "Atalhos" e toque em "+" para criar um atalho. Dê o nome que você vai falar para a Siri (ex.: "Rota Van").',
  'Ação "Ditar Texto" (idioma Português, Brasil).',
  'Ação "Obter Conteúdo do URL": cole o ENDEREÇO acima; Método POST; Cabeçalho "Authorization" com o valor "Bearer " + a CHAVE; Corpo JSON com o campo "texto" = Texto Ditado.',
  'Ação "Obter Valor do Dicionário": chave "fala". Depois, ação "Falar Texto".',
  'Ação "Obter Valor do Dicionário": chave "continuar" (do Conteúdo do URL). Ação "Se" o valor é "sim": "Executar Atalho" com o próprio atalho.',
  'Pronto: "E aí Siri, <nome do atalho>" e fale o pedido. Para gravar, responda "sim".',
];

export function AssistenteSiri() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("iPhone");
  const s = useChavesDoAssistente({ enabled: aberto });

  return (
    <div className="rounded-xl border" style={{ background: C.panel, borderColor: C.border }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="btn-press w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold"
        style={{ color: C.ink }}
      >
        <span className="flex items-center gap-2">
          <Mic size={16} /> Usar pela Siri (iPhone)
        </span>
        <ChevronDown
          size={16}
          style={{
            transform: aberto ? "rotate(180deg)" : undefined,
            transition: "transform var(--motion-fast) var(--ease-out-quart)",
          }}
        />
      </button>

      <Presence when={aberto} {...fadeSlideDown}>
        {(_estado, estilo) => (
          <div className="px-4 pb-4 flex flex-col gap-3" style={estilo}>
            <p className="text-xs" style={{ color: C.inkSoft }}>
              Fale com o assistente sem tocar na tela, até pelo CarPlay: "E aí Siri, &lt;nome do
              atalho&gt;", fale o pedido e responda "sim" para gravar. O atalho usa uma chave sua;
              apagar a chave desliga o atalho na hora.
            </p>

            {s.erro && <ErrorBanner>{mensagemAmigavel(s.erro)}</ErrorBanner>}

            {s.carregando ? (
              <Skeleton height={36} />
            ) : (
              s.chaves.map((c) => (
                <FadeIn
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs"
                  style={{ background: C.panel2, color: C.inkSoft }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <KeyRound size={14} />
                    <span className="truncate">
                      {c.nome} · …{c.final} · usada {fmtData(c.last_used_at)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => s.apagar(c.id)}
                    className="btn-press flex items-center gap-1 rounded-md px-2 py-1"
                    style={{ color: C.red }}
                    aria-label={`Apagar chave ${c.nome}`}
                  >
                    <Trash2 size={12} /> Apagar
                  </button>
                </FadeIn>
              ))
            )}

            {s.novaChave ? (
              <FadeIn variant="pop" className="flex flex-col gap-2">
                <div className="text-xs font-semibold" style={{ color: C.ink }}>
                  Chave gerada. Copie agora: ela não aparece de novo.
                </div>
                <Campo titulo="Chave" valor={s.novaChave} rotulo="Copiar a chave" />
                <Campo titulo="Endereço" valor={URL_VOZ} rotulo="Copiar o endereço" />
                <ol
                  className="text-xs flex flex-col gap-1.5 list-decimal pl-4"
                  style={{ color: C.inkSoft }}
                >
                  {PASSOS.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
                <button
                  type="button"
                  onClick={s.esconderNovaChave}
                  className="btn-press self-start rounded-lg px-3 py-1.5 text-xs"
                  style={{ background: C.panel2, color: C.inkSoft }}
                >
                  Já copiei
                </button>
              </FadeIn>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  aria-label="Nome do aparelho"
                  className="rounded-lg px-3 py-1.5 text-sm outline-none w-36"
                  style={{ background: C.panel2, color: C.ink }}
                />
                <button
                  type="button"
                  disabled={s.gerando}
                  onClick={() => s.gerar(nome).catch(() => {})}
                  className="btn-press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold"
                  style={{ background: C.brand, color: C.onBrand }}
                >
                  {s.gerando ? <Spinner /> : <KeyRound size={14} />} Gerar chave
                </button>
              </div>
            )}
          </div>
        )}
      </Presence>
    </div>
  );
}
