import {
  BookOpen,
  Bot,
  CalendarPlus,
  ClipboardList,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  MessageCircle,
  Save,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import {
  FILTROS_DA_FILA,
  aguardandoDeVerdade,
  contagemDaFila,
  filaDeConversas,
} from "../../domain/filaDeAtendimento.js";
import {
  anotacaoDaEncomenda,
  embarqueDoRascunho,
  inicialDoRascunho,
  viagemDoRascunho,
} from "../../domain/rascunhoReserva.js";
import { useAtendimento } from "../../hooks/useAtendimento.js";
import { useBotKnowledge } from "../../hooks/useBotKnowledge.js";
import { useRascunhosDeReserva } from "../../hooks/useRascunhosDeReserva.js";
import { useSettings } from "../../hooks/useSettings.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { FadeIn, Presence, Skeleton, fadeScale } from "../../ui/motion/index.js";
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
//
// Issue #360: a tela se divide em janelas (abas no topo, montadas pelo App):
// Conversas (só a fila do WhatsApp), Para lançar (reservas preparadas pela IA),
// Pendências (PendenciasTab) e Bot (modo e perguntas sem resposta).

// Duração da saída antes de tirar o item da lista de verdade — precisa bater
// com o `duration` do Presence (AGENTS.md §5).
const SAIDA_MS = 200;

const MODOS = {
  ia: {
    icon: Bot,
    label: "IA automática",
    desc: "O bot responde os clientes e confirma reservas sozinho.",
  },
  sombra: {
    icon: Eye,
    label: "Sombra (só aprende)",
    desc: 'O bot observa e aprende, sem gastar com respostas, e lança as reservas que a equipe marcar com "Agendado ☑️". Para ver o que ele responderia, escreva no Chatwoot a nota privada #testar (com ou sem uma pergunta).',
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

// Conversa no formato que todo mundo conhece (crítica de design, issue #393): iniciais, nome,
// prévia e hora à direita. "Aguardando resposta" em branco forte com relógio; "Com o bot" e
// "Com a equipe" em cinza; "sem cadastro" com borda tracejada. Sem etiqueta vermelha.
function iniciais(nome) {
  const partes = String(nome || "")
    .replace(/[^\p{L}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "#";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}
function ConversaItem({ c, chatwootUrl, onVerCadastro }) {
  const n = nomesDaConversa(c);
  const comEquipe = c.status === "open";
  const aguardando = aguardandoDeVerdade(c);
  const autor = { cliente: "Cliente", equipe: "Equipe", bot: "Bot" }[c.last_message_by];
  const link =
    chatwootUrl && c.chatwoot_conversation_id
      ? `${chatwootUrl}/conversations/${c.chatwoot_conversation_id}`
      : null;
  return (
    <div
      className="row-hover grid gap-3 py-2.5 border-b"
      style={{ gridTemplateColumns: "40px minmax(0,1fr) auto", borderColor: C.panel2 }}
    >
      <span
        aria-hidden="true"
        className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold"
        style={{ background: C.panel2, color: C.inkSoft }}
      >
        {iniciais(n.principal)}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-sm font-medium truncate"
            style={{ fontSize: 15, fontWeight: 600, color: C.ink }}
          >
            {n.principal}
          </span>
          {n.semCadastro && (
            <span
              className="text-[11px] px-1.5 rounded shrink-0"
              style={{ border: `1px dashed ${C.inkFaint}`, color: C.inkSoft }}
            >
              sem cadastro
            </span>
          )}
        </div>
        {c.previa && (
          <div className="text-[13px] truncate" style={{ color: C.inkSoft }} title={c.previa}>
            {autor && <span style={{ color: C.ink }}>{autor}: </span>}
            {c.previa}
          </div>
        )}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs">
          {aguardando ? (
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: C.ink }}>
              <Clock size={13} />
              <span>Aguardando resposta</span>
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1" style={{ color: C.inkFaint }}>
            {comEquipe ? <Users size={12} /> : <Bot size={12} />}
            <span>{comEquipe ? "Com a equipe" : "Com o bot"}</span>
          </span>
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: C.inkFaint }}>
          {fmtTelefone(c.phone)}
          {n.perfil && <> · perfil do WhatsApp: {n.perfil}</>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        {c.last_message_at && (
          <span className="text-xs" style={{ color: C.inkFaint }}>
            {tempoRelativo(c.last_message_at)}
          </span>
        )}
        <div className="flex">
          {c.customer_id && (
            <button
              type="button"
              onClick={() => onVerCadastro(c)}
              aria-label="Ver cadastro"
              title="Ver cadastro"
              className="btn-press w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ color: C.inkSoft }}
            >
              <Users size={17} />
            </button>
          )}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir no Chatwoot"
              title="Abrir no Chatwoot"
              className="btn-press w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ color: C.inkSoft }}
            >
              <ExternalLink size={17} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Reserva preparada pela IA a partir da conversa (issue #254): a equipe confere
// e lança com um toque — o formulário calcula preço e vaga como sempre.
function RascunhoItem({ r, trips, chatwootUrl, onLancar, onDescartar, onCopiar }) {
  const encomenda = r.type === "encomenda";
  const embarque = embarqueDoRascunho(r, trips);
  const quem = r.customer_name || r.phone || "cliente";
  return (
    <div
      className="rounded-lg p-3 flex items-start justify-between gap-3"
      style={{ background: C.panel2, border: `1px solid ${C.border}` }}
      data-testid="rascunho-reserva"
    >
      <div className="min-w-0">
        <div className="flex items-center flex-wrap gap-1.5">
          <Chip cor={C.onBrand} fundo={C.amber}>
            {viagemDoRascunho(r)}
          </Chip>
          {encomenda && (
            <Chip cor={C.inkSoft} fundo={C.panel}>
              Encomenda
            </Chip>
          )}
          {!encomenda && r.quantity > 1 && (
            <Chip cor={C.amber} fundo={C.amberSoft}>
              {r.quantity} passagens
            </Chip>
          )}
          {!r.customer_id && (
            <Chip cor={C.inkSoft} fundo={C.panel}>
              sem cadastro
            </Chip>
          )}
        </div>
        <div className="text-sm font-medium mt-1" style={{ overflowWrap: "anywhere" }}>
          {embarque || "Embarque a definir"}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: C.inkFaint }}>
          {[r.customer_name, r.phone].filter(Boolean).join(" · ") || "sem identificação"}
          {r.dropoff_location && <> · desce: {r.dropoff_location}</>}
        </div>
        {r.client_excerpt && (
          <div
            className="text-xs mt-1 italic"
            style={{ color: C.inkSoft, overflowWrap: "anywhere" }}
          >
            “{r.client_excerpt}”
          </div>
        )}
        {r.notes && (
          <div className="text-[11px] mt-1" style={{ color: C.amber, overflowWrap: "anywhere" }}>
            Conferir: {r.notes}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {!encomenda && onLancar && (
          <button
            type="button"
            onClick={() => onLancar(r)}
            aria-label={`Lançar reserva de ${quem}`}
            className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-semibold"
            style={{ background: C.amber, color: C.onBrand }}
          >
            <CalendarPlus size={13} /> Lançar
          </button>
        )}
        {encomenda && (
          <button
            type="button"
            onClick={() => onCopiar(r)}
            className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md font-semibold"
            style={{ background: C.panel, color: C.ink, border: `1px solid ${C.border}` }}
          >
            <Copy size={12} /> Copiar anotação
          </button>
        )}
        {chatwootUrl && r.chatwoot_conversation_id && (
          <a
            href={`${chatwootUrl}/conversations/${r.chatwoot_conversation_id}`}
            target="_blank"
            rel="noreferrer"
            className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md"
            style={{ background: C.panel, color: C.inkSoft }}
          >
            <ExternalLink size={12} /> Conversa
          </a>
        )}
        <button
          type="button"
          onClick={() => onDescartar(r.id)}
          aria-label={`Descartar reserva preparada de ${quem}`}
          className="btn-press flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md"
          style={{ background: C.panel, color: C.inkSoft }}
        >
          <X size={12} /> Descartar
        </button>
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

// Seção sem cartão em volta (crítica de design, issue #393): um título curto e a lista logo
// abaixo; a explicação fica pequena, em cinza.
function Secao({ icon: Icon, titulo, resumo, children }) {
  return (
    <section>
      {titulo && (
        <h2 className="text-[15px] font-bold mb-1 flex items-center gap-2" style={{ color: C.ink }}>
          <Icon size={16} style={{ color: C.inkSoft }} /> {titulo}
        </h2>
      )}
      {resumo && (
        <p className="text-xs mb-3" style={{ color: C.inkFaint }}>
          {resumo}
        </p>
      )}
      {children}
    </section>
  );
}

const RESUMOS = {
  conversas: "Só as conversas do WhatsApp, a mais recente primeiro.",
  lancar: "Reservas que a IA preparou lendo as conversas. Confira e lance.",
  bot: "Como o bot está atendendo e as perguntas que ele não soube responder.",
};

function FiltroDaFila({ filtro, onFiltro, contagem }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Filtrar conversas">
      {FILTROS_DA_FILA.map((f) => {
        const ativo = filtro === f.id;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onFiltro(f.id)}
            className="btn-press shrink-0 text-[13px] px-3 min-h-[36px] rounded-full"
            style={{
              background: "transparent",
              color: ativo ? C.ink : C.inkSoft,
              fontWeight: ativo ? 600 : 500,
              border: `1px solid ${ativo ? C.inkSoft : C.border}`,
            }}
          >
            {f.label} <span style={{ opacity: 0.75 }}>{contagem[f.id] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * `vista`: "conversas" | "lancar" | "bot" (issue #360). As abas no topo (e a de
 * Pendências, que é a PendenciasTab) são montadas pelo App.
 */
export default function AtendimentoTab({
  vista = "conversas",
  modoAtendimento,
  onNavigate,
  trips,
  onAgendar,
}) {
  const at = useAtendimento();
  const rasc = useRascunhosDeReserva({ enabled: vista === "lancar" });
  const kb = useBotKnowledge();
  const cfg = useSettings();
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const aoErrar = (msg) => (e) => setErro(mensagemAmigavel(e, msg));

  const perguntasSaida = useSaida(at.resolverPergunta, aoErrar("Não foi possível dispensar."));
  const rascunhosSaida = useSaida(rasc.descartar, aoErrar("Não foi possível descartar."));
  const [copiado, setCopiado] = useState("");
  const copiarAnotacao = async (r) => {
    const linha = anotacaoDaEncomenda(r);
    try {
      await navigator.clipboard.writeText(linha);
      setCopiado(r.id);
    } catch {
      setErro(`Não foi possível copiar. Anote na Agenda: ${linha}`);
    }
  };

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
  const fila = filaDeConversas(at.conversas, filtro);
  const contagem = contagemDaFila(at.conversas);
  const chatwootUrl = cfg.chatwootUrl;

  return (
    <div>
      <Header
        title="Atendimento"
        subtitle={RESUMOS[vista] ?? RESUMOS.conversas}
        right={
          chatwootUrl && (
            <a
              href={chatwootUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-press flex items-center gap-1.5 text-[13px] px-3 min-h-[40px] rounded-lg font-medium border"
              style={{ background: C.panel, color: C.ink, borderColor: C.border }}
            >
              <ExternalLink size={14} /> Abrir Chatwoot
            </a>
          )
        }
      />
      <div className="px-3.5 md:px-10 pb-10 space-y-4 stagger">
        {erro && <ErrorBanner onDismiss={() => setErro("")}>{erro}</ErrorBanner>}

        {vista === "conversas" && (
          <Secao icon={MessageCircle}>
            <FiltroDaFila filtro={filtro} onFiltro={setFiltro} contagem={contagem} />
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
                {filtro === "todas"
                  ? "Nenhuma conversa em andamento."
                  : "Nenhuma conversa neste filtro."}
              </div>
            )}
            <div data-testid="fila-de-conversas">
              {fila.map((c) => (
                <FadeIn key={c.conversation_id}>
                  <ConversaItem
                    c={c}
                    chatwootUrl={chatwootUrl}
                    onVerCadastro={(conv) =>
                      onNavigate({
                        tab: "passageiros",
                        deepLink: { kind: "passageiro", termo: conv.nome_cadastro || conv.phone },
                      })
                    }
                  />
                </FadeIn>
              ))}
            </div>
          </Secao>
        )}

        {vista === "lancar" && (
          <Secao
            icon={ClipboardList}
            titulo="Reservas prontas para lançar"
            resumo="A IA leu as conversas e preparou estas reservas (o cliente já mandou a data e o endereço). Confira e lance: preço e vagas saem do app como sempre."
          >
            {rasc.error && (
              <ErrorBanner onRetry={rasc.recarregar} className="mb-3">
                {mensagemAmigavel(rasc.error, "Não foi possível carregar as reservas preparadas.")}
              </ErrorBanner>
            )}
            {rasc.loading && rasc.rascunhos.length === 0 && (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} height={84} rounded={10} />
                ))}
              </div>
            )}
            {!rasc.loading && !rasc.error && rasc.rascunhos.length === 0 && (
              <div className="text-center py-4 text-xs" style={{ color: C.inkFaint }}>
                Nenhuma reserva preparada agora. Elas aparecem aqui quando o cliente manda a data e
                o endereço na conversa.
              </div>
            )}
            {copiado && (
              <output className="block text-[11px] mb-2" style={{ color: C.inkSoft }}>
                Anotação copiada: cole na caixinha do ponto, na Agenda.
              </output>
            )}
            <div className="space-y-2">
              {rasc.rascunhos.map((r) => (
                <Presence
                  key={r.id}
                  when={!rascunhosSaida.saindo.has(r.id)}
                  duration={SAIDA_MS}
                  {...fadeScale}
                >
                  <RascunhoItem
                    r={r}
                    trips={trips}
                    chatwootUrl={chatwootUrl}
                    onLancar={onAgendar ? (x) => onAgendar(inicialDoRascunho(x, trips)) : null}
                    onDescartar={rascunhosSaida.sair}
                    onCopiar={copiarAnotacao}
                  />
                </Presence>
              ))}
            </div>
          </Secao>
        )}

        {vista === "bot" && (
          <>
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
                  style={{
                    background: C.panel2,
                    color: C.inkSoft,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  Alterar modo, base e estilo
                </button>
              </div>
            </Card>

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
                    <PerguntaItem
                      p={p}
                      onCadastrar={cadastrarResposta}
                      onDispensar={perguntasSaida.sair}
                    />
                  </Presence>
                ))}
              </div>
            </Secao>
          </>
        )}
      </div>
    </div>
  );
}
