import {
  BookOpen,
  Bot,
  Check,
  ExternalLink,
  Eye,
  Inbox,
  MessageCircle,
  Save,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAtendimento } from "../../hooks/useAtendimento.js";
import { useBotKnowledge } from "../../hooks/useBotKnowledge.js";
import { useSettings } from "../../hooks/useSettings.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { Presence, Skeleton, fadeScale } from "../../ui/motion/index.js";
import {
  C,
  Card,
  ErrorBanner,
  Field,
  Header,
  TextArea,
  TextInput,
  normalizar,
  tempoRelativo,
} from "../tabShared.jsx";

/* ===================== ATENDIMENTO WHATSAPP (fila + bot) ===================== */
// Substitui o antigo simulador "Reservar". O número de WhatsApp está no
// Chatwoot; aqui a equipe vê, num lugar só: o que está esperando por ela
// (conversas abertas e pendências), o que o bot está tratando e as perguntas
// que ele não soube responder (pra cadastrar na base). O estado do Chatwoot
// vem do espelho que a Edge Function `chatwoot-bot` grava no banco.

// Duração da saída antes de tirar o item da lista de verdade — precisa bater
// com o `duration` do Presence (AGENTS.md §5).
const SAIDA_MS = 200;
const MAX_PENDENCIAS = 5;

const MODOS = {
  ia: {
    icon: Bot,
    label: "IA automática",
    desc: "O bot responde os clientes e confirma reservas sozinho.",
  },
  sombra: {
    icon: Eye,
    label: "Sombra (teste)",
    desc: "O bot escreve a resposta como nota privada no Chatwoot; nada é enviado ao cliente.",
  },
  manual: {
    icon: UserCog,
    label: "Manual",
    desc: "O bot não responde; a equipe atende pelo Chatwoot ou pelo celular.",
  },
};

function useSaida(executar, onErro) {
  const [saindo, setSaindo] = useState(() => new Set());
  const sair = (id) => {
    setSaindo((prev) => new Set(prev).add(id));
    setTimeout(async () => {
      try {
        await executar(id);
      } catch (e) {
        onErro(e);
        setSaindo((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }, SAIDA_MS);
  };
  return { saindo, sair };
}

function fmtTelefone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${d}`;
}

// Nome do CADASTRO primeiro: o do perfil do WhatsApp costuma ser apelido ou
// fictício e só aparece como referência.
function nomesDaConversa(c) {
  const cadastro = (c.nome_cadastro || "").trim();
  const perfil = (c.nome_whatsapp || "").trim();
  const principal = cadastro || perfil || fmtTelefone(c.phone);
  const perfilDiferente = cadastro && perfil && normalizar(cadastro) !== normalizar(perfil);
  return {
    principal,
    perfil: perfilDiferente ? perfil : null,
    semCadastro: !cadastro,
  };
}

function ordemDaFila(a, b) {
  if (!!a.aguardando_equipe !== !!b.aguardando_equipe) return a.aguardando_equipe ? -1 : 1;
  return new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);
}

function Chip({ children, cor, fundo }) {
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0"
      style={{ background: fundo, color: cor }}
    >
      {children}
    </span>
  );
}

function ConversaItem({ c, chatwootUrl, onVerCadastro }) {
  const n = nomesDaConversa(c);
  const comEquipe = c.status === "open";
  const autor = { cliente: "Cliente", equipe: "Equipe", bot: "Bot" }[c.last_message_by];
  return (
    <div
      className="rounded-lg p-3 flex items-start justify-between gap-3"
      style={{
        background: C.panel2,
        border: `1px solid ${c.aguardando_equipe ? C.amber : "transparent"}`,
      }}
    >
      <div className="min-w-0">
        <div className="flex items-center flex-wrap gap-1.5">
          <span className="text-sm font-medium" style={{ overflowWrap: "anywhere" }}>
            {n.principal}
          </span>
          {c.aguardando_equipe && (
            <Chip cor={C.onBrand} fundo={C.amber}>
              Aguardando resposta
            </Chip>
          )}
          <Chip cor={comEquipe ? C.amber : C.inkSoft} fundo={comEquipe ? C.amberSoft : C.panel}>
            {comEquipe ? "Com a equipe" : "Com o bot"}
          </Chip>
          {n.semCadastro && (
            <Chip cor={C.inkSoft} fundo={C.panel}>
              sem cadastro
            </Chip>
          )}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: C.inkFaint }}>
          {fmtTelefone(c.phone)}
          {n.perfil && <> · perfil do WhatsApp: {n.perfil}</>}
        </div>
        {c.previa && (
          <div
            className="text-xs mt-1"
            style={{ color: C.inkSoft, overflowWrap: "anywhere" }}
            title={c.previa}
          >
            {autor && <b style={{ color: C.ink }}>{autor}: </b>}
            {c.previa}
          </div>
        )}
        {c.last_message_at && (
          <div className="text-[11px] mt-0.5" style={{ color: C.inkFaint }}>
            {tempoRelativo(c.last_message_at)}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {chatwootUrl && c.chatwoot_conversation_id && (
          <a
            href={`${chatwootUrl}/conversations/${c.chatwoot_conversation_id}`}
            target="_blank"
            rel="noreferrer"
            className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-medium"
            style={{ background: C.panel, color: C.ink, border: `1px solid ${C.border}` }}
          >
            <ExternalLink size={12} /> Abrir no Chatwoot
          </a>
        )}
        {c.customer_id && (
          <button
            type="button"
            onClick={() => onVerCadastro(c)}
            className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md"
            style={{ background: C.panel, color: C.inkSoft }}
          >
            <Users size={12} /> Ver cadastro
          </button>
        )}
      </div>
    </div>
  );
}

function PerguntaItem({ p, onCadastrar, onDispensar }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ title: "", content: "" });
  const [salvando, setSalvando] = useState(false);

  const cadastrar = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSalvando(true);
    try {
      await onCadastrar(p, { title: form.title.trim(), content: form.content.trim() });
    } catch {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-lg p-3" style={{ background: C.panel2 }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm" style={{ overflowWrap: "anywhere" }}>
            “{p.question}”
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: C.inkFaint }}>
            {tempoRelativo(p.created_at)}
          </div>
        </div>
        {!aberto && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-medium"
              style={{ background: C.amber, color: C.onBrand }}
            >
              <BookOpen size={12} /> Cadastrar resposta
            </button>
            <button
              type="button"
              onClick={() => onDispensar(p.id)}
              aria-label={`Dispensar a pergunta: ${p.question}`}
              title="Dispensar (não vai pra base)"
              className="btn-press"
            >
              <X size={13} style={{ color: C.inkFaint }} />
            </button>
          </div>
        )}
      </div>
      {aberto && (
        <div className="mt-3">
          <Field label="Assunto">
            <TextInput
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex.: Animais de estimação"
            />
          </Field>
          <Field label="O que o bot deve saber">
            <TextArea
              rows={3}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Escreva a regra/informação; o bot responde com as palavras dele."
            />
          </Field>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={cadastrar}
              disabled={salvando || !form.title.trim() || !form.content.trim()}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40"
              style={{ background: C.amber, color: C.onBrand }}
            >
              <Save size={13} /> {salvando ? "Salvando…" : "Salvar na base"}
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              disabled={salvando}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
              style={{ background: C.panel, color: C.inkSoft }}
            >
              <X size={13} /> Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Secao({ icon: Icon, titulo, resumo, children }) {
  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Icon size={16} style={{ color: C.amber }} /> {titulo}
      </div>
      {resumo && (
        <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
          {resumo}
        </p>
      )}
      {children}
    </Card>
  );
}

export default function AtendimentoTab({ pend, modoAtendimento, onNavigate }) {
  const at = useAtendimento();
  const kb = useBotKnowledge();
  const cfg = useSettings();
  const [erro, setErro] = useState("");
  const aoErrar = (msg) => (e) => setErro(mensagemAmigavel(e, msg));

  const perguntasSaida = useSaida(at.resolverPergunta, aoErrar("Não foi possível dispensar."));
  const pendenciasSaida = useSaida(pend.resolver, aoErrar("Não foi possível resolver."));

  const cadastrarResposta = async (pergunta, item) => {
    setErro("");
    try {
      await kb.criar(item);
      perguntasSaida.sair(pergunta.id);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível cadastrar a resposta (só admin)."));
      throw e;
    }
  };

  const modo = MODOS[modoAtendimento] || MODOS.manual;
  const fila = [...at.conversas].sort(ordemDaFila);
  const aguardando = fila.filter((c) => c.aguardando_equipe).length;
  const comEquipe = fila.filter((c) => c.status === "open").length;
  const comBot = fila.filter((c) => c.status === "pending").length;
  const pendencias = (pend.pendencias || []).slice(0, MAX_PENDENCIAS);
  const chatwootUrl = cfg.chatwootUrl;

  return (
    <div>
      <Header
        title="Atendimento WhatsApp"
        subtitle="Conversas com a equipe e com o bot, pendências e perguntas que o bot não soube responder."
        right={
          chatwootUrl && (
            <a
              href={chatwootUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium"
              style={{ background: C.amber, color: C.onBrand }}
            >
              <ExternalLink size={14} /> Abrir Chatwoot
            </a>
          )
        }
      />
      <div className="px-6 md:px-10 pb-10 space-y-4 stagger">
        {erro && <ErrorBanner onDismiss={() => setErro("")}>{erro}</ErrorBanner>}

        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0">
              <modo.icon size={18} style={{ color: C.amber, marginTop: 2 }} />
              <div className="min-w-0">
                <div className="text-sm font-semibold">Bot: {modo.label}</div>
                <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>
                  {modo.desc}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate({ tab: "sistema" })}
              className="btn-press text-xs px-3 py-1.5 rounded-md"
              style={{ background: C.panel2, color: C.inkSoft, border: `1px solid ${C.border}` }}
            >
              Alterar modo, base e estilo
            </button>
          </div>
        </Card>

        <Secao
          icon={MessageCircle}
          titulo="Conversas"
          resumo={
            at.loading && at.conversas.length === 0
              ? null
              : `${aguardando} aguardando resposta · ${comEquipe} com a equipe · ${comBot} com o bot`
          }
        >
          {at.errorConversas && (
            <ErrorBanner onRetry={at.recarregarConversas} className="mb-3">
              {mensagemAmigavel(at.errorConversas, "Não foi possível carregar as conversas.")}
            </ErrorBanner>
          )}
          {at.loading && at.conversas.length === 0 && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={72} rounded={10} />
              ))}
            </div>
          )}
          {!at.loading && !at.errorConversas && fila.length === 0 && (
            <div className="text-center py-4 text-xs" style={{ color: C.inkFaint }}>
              Nenhuma conversa em andamento. A fila aparece assim que o Agent Bot do Chatwoot estiver
              ligado à caixa do WhatsApp.
            </div>
          )}
          <div className="space-y-2">
            {fila.map((c) => (
              <ConversaItem
                key={c.conversation_id}
                c={c}
                chatwootUrl={chatwootUrl}
                onVerCadastro={(conv) =>
                  onNavigate({
                    tab: "passageiros",
                    deepLink: { kind: "passageiro", termo: conv.nome_cadastro || conv.phone },
                  })
                }
              />
            ))}
          </div>
        </Secao>

        <Secao
          icon={Inbox}
          titulo="Pendências abertas"
          resumo={`${pend.total} no total — transferências do bot e as abertas à mão.`}
        >
          {pend.error && (
            <ErrorBanner onRetry={pend.recarregar} className="mb-3">
              {mensagemAmigavel(pend.error, "Não foi possível carregar as pendências.")}
            </ErrorBanner>
          )}
          {pend.loading && pend.pendencias.length === 0 && (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} height={56} rounded={10} />
              ))}
            </div>
          )}
          {!pend.loading && !pend.error && pend.pendencias.length === 0 && (
            <div className="text-center py-4 text-xs" style={{ color: C.inkFaint }}>
              Nenhuma pendência aberta.
            </div>
          )}
          <div className="space-y-2">
            {pendencias.map((p) => (
              <Presence
                key={p.id}
                when={!pendenciasSaida.saindo.has(p.id)}
                duration={SAIDA_MS}
                {...fadeScale}
              >
                <div
                  className="rounded-lg p-3 flex items-start justify-between gap-3"
                  style={{ background: C.panel2 }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium" style={{ overflowWrap: "anywhere" }}>
                      {p.assunto}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: C.inkFaint }}>
                      {p.cliente || p.phone || "sem identificação"} · {tempoRelativo(p.created_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => pendenciasSaida.sair(p.id)}
                    aria-label={`Resolver pendência: ${p.assunto}`}
                    className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-semibold shrink-0"
                    style={{ background: C.panel, color: C.ink, border: `1px solid ${C.border}` }}
                  >
                    <Check size={13} /> Resolver
                  </button>
                </div>
              </Presence>
            ))}
          </div>
          {pend.total > MAX_PENDENCIAS && (
            <button
              type="button"
              onClick={() => onNavigate({ tab: "pendencias" })}
              className="btn-press mt-3 text-xs px-3 py-1.5 rounded-md"
              style={{ background: C.panel2, color: C.inkSoft }}
            >
              Ver todas as {pend.total} pendências
            </button>
          )}
        </Secao>

        <Secao
          icon={BookOpen}
          titulo="Perguntas que o bot não soube responder"
          resumo="Cadastre a resposta na base e o bot passa a responder sozinho da próxima vez."
        >
          {at.errorPerguntas && (
            <ErrorBanner onRetry={at.recarregarPerguntas} className="mb-3">
              {mensagemAmigavel(at.errorPerguntas, "Não foi possível carregar as perguntas.")}
            </ErrorBanner>
          )}
          {at.loading && at.perguntas.length === 0 && (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} height={56} rounded={10} />
              ))}
            </div>
          )}
          {!at.loading && !at.errorPerguntas && at.perguntas.length === 0 && (
            <div className="text-center py-4 text-xs" style={{ color: C.inkFaint }}>
              Nenhuma pergunta pendente.
            </div>
          )}
          <div className="space-y-2">
            {at.perguntas.map((p) => (
              <Presence
                key={p.id}
                when={!perguntasSaida.saindo.has(p.id)}
                duration={SAIDA_MS}
                {...fadeScale}
              >
                <PerguntaItem p={p} onCadastrar={cadastrarResposta} onDispensar={perguntasSaida.sair} />
              </Presence>
            ))}
          </div>
        </Secao>
      </div>
    </div>
  );
}
