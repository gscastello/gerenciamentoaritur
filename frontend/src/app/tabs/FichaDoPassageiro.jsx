// Ficha do passageiro (issue #438; visual v18, issue #446): o CRM de cada passageiro numa tela
// própria — no celular a tela inteira, no computador um painel —, aberta pela lista de
// Passageiros ou pela Agenda ("Ver passageiro"). Em cima, quem é, os atalhos (ligar, WhatsApp,
// agendar com o endereço de costume), os avisos (próxima viagem, sem pagamento marcado, sumiu) e
// os números; embaixo, cinco abas: Resumo, Viagens, Pagamentos, Conversa e Cadastro.
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Save,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../auth/AuthProvider.jsx";
import {
  clienteDesde,
  diaCurto,
  diasEntre,
  etiquetas,
  fraseDoHabito,
  haQuantoTempo,
  habitoPorDia,
  iniciais,
  nomeParaMostrar,
  pagamentosDoPassageiro,
  viagensPorMes,
} from "../../domain/crmDoPassageiro.js";
import { inicialDoAgendamento } from "../../domain/enderecoDeCostume.js";
import { FORMAS_PAGAMENTO, rotuloPagamento } from "../../domain/format.js";
import { dataDoHistorico } from "../../domain/historicoDoPassageiro.js";
import { primeiroErro, validarNome, validarTelefone } from "../../domain/validacao.js";
import { useEnderecoDeCostume } from "../../hooks/useEnderecoDeCostume.js";
import {
  useCadastrosRepetidos,
  useConversaDoPassageiro,
  usePassageiro,
} from "../../hooks/usePassageiros.js";
import { useSettings } from "../../hooks/useSettings.js";
import { copiarTexto } from "../../lib/clipboard.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { FadeIn, Presence, Skeleton } from "../../ui/motion/index.js";
import {
  C,
  ErrorBanner,
  Field,
  Select,
  TextInput,
  dataOperacao,
  digitos,
  enderecoEmbarque,
  enderecosFrequentes,
  fmtBRL,
  inputCls,
  inputStyle,
  todayStr,
} from "../tabShared.jsx";
import EnderecoDeCostume from "./EnderecoDeCostume.jsx";
import HistoricoDeViagens from "./HistoricoDeViagens.jsx";

const ABAS = [
  { id: "resumo", rotulo: "Resumo" },
  { id: "viagens", rotulo: "Viagens" },
  { id: "pagamentos", rotulo: "Pagamentos" },
  { id: "conversa", rotulo: "Conversa" },
  { id: "cadastro", rotulo: "Cadastro" },
];

const ENTRADA = {
  enter: { opacity: 1, transform: "translateY(0)" },
  exit: { opacity: 0, transform: "translateY(16px)" },
};

// Endereços que o passageiro mais usa num sentido — a mudança de desembarque é comum, então ter o
// histórico à mão ajuda o atendimento.
function EnderecosFreq({ titulo, itens, loading }) {
  return (
    <div>
      <div className="text-[12px] mb-1" style={{ color: C.inkFaint }}>
        {titulo}
      </div>
      {loading ? (
        <Skeleton height={36} rounded={8} />
      ) : itens.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          Sem histórico.
        </div>
      ) : (
        <ul className="space-y-1">
          {itens.map((e) => (
            <li
              key={e.texto}
              className="text-[13px] leading-snug flex items-start gap-1.5"
              style={{ color: C.inkSoft, overflowWrap: "anywhere" }}
            >
              <span style={{ color: C.ink }}>{e.texto}</span>
              {e.n > 1 && <span style={{ color: C.inkFaint }}>×{e.n}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// "Pode ser a mesma pessoa" (database/119): mesmo nome com outro número, ou o mesmo número com e
// sem o nono dígito. Juntar é só do admin e pede confirmação; "Não é" tira o par da lista.
function CadastrosRepetidos({ p, onJuntado }) {
  const { role } = useAuth();
  const { repetidos, erroRepetidos, ocupado, naoE, juntar } = useCadastrosRepetidos(
    p.customer_id,
    true,
  );
  if (repetidos.length === 0 && !erroRepetidos) return null;
  const juntarCom = async (o) => {
    const nomeFica = p.nome || p.telefone;
    if (
      !window.confirm(
        `Juntar "${o.nome || o.telefone}" em "${nomeFica}"?\n\nAs viagens, conversas e avisos passam para ${nomeFica} e o outro cadastro sai da lista. O telefone dele vira o 2º telefone. Não dá para desfazer pelo app.`,
      )
    )
      return;
    const r = await juntar(o.customer_id);
    if (r) onJuntado?.(r);
  };
  return (
    <div className="space-y-2" data-testid="cadastros-repetidos">
      {erroRepetidos && (
        <p className="text-[13px]" style={{ color: C.red }}>
          {erroRepetidos}
        </p>
      )}
      {repetidos.map((o) => (
        <div
          key={o.customer_id}
          className="rounded-2xl p-3 grid gap-2.5"
          style={{ background: C.panel, boxShadow: `inset 0 0 0 1px ${C.border}` }}
        >
          <div>
            <b className="block text-[14px]" style={{ color: C.ink }}>
              Pode ser a mesma pessoa
            </b>
            <p className="text-[13px]" style={{ color: C.inkSoft }}>
              {o.nome || "Sem nome"}, {o.telefone}, {o.viagens}{" "}
              {Number(o.viagens) === 1 ? "viagem" : "viagens"}. {o.motivo[0].toUpperCase()}
              {o.motivo.slice(1)}.
            </p>
          </div>
          <div className="flex gap-2">
            {role === "admin" && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => juntarCom(o)}
                className="btn-press min-h-[40px] px-3.5 rounded-xl text-[13.5px] font-semibold disabled:opacity-50"
                style={{ background: C.ink, color: C.bg }}
              >
                Juntar com este
              </button>
            )}
            <button
              type="button"
              disabled={ocupado}
              onClick={() => naoE(o.customer_id)}
              className="btn-press min-h-[40px] px-3 rounded-xl text-[13.5px] font-semibold disabled:opacity-50"
              style={{ color: C.inkSoft }}
            >
              Não é
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Cadastro({ p, trips, onSalvarNota, onSalvarPerfil, onRemover, onJuntado }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(null);
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);
  const pontos = trips?.ida?.pontos || [];

  const abrirEdicao = () => {
    setForm({
      nome: p.nome || "",
      telefone: p.telefone || "",
      telefone2: p.telefone2 || "",
      pontoPadrao: p.ponto_padrao || "",
      pagamentoPadrao: p.pagamento_padrao || "",
    });
    setErroForm("");
    setEditando(true);
  };

  const salvarEdicao = async () => {
    const problema = primeiroErro([
      validarNome(form.nome),
      validarTelefone(form.telefone),
      form.telefone2.trim() ? validarTelefone(form.telefone2) : null,
    ]);
    if (problema) {
      setErroForm(problema);
      return;
    }
    setSalvando(true);
    try {
      await onSalvarPerfil({
        name: form.nome.trim(),
        phone: validarTelefone(form.telefone).valor,
        phoneSecondary: form.telefone2.trim() ? validarTelefone(form.telefone2).valor : null,
        defaultRoutePointCode: form.pontoPadrao || null,
        defaultPaymentMethod: form.pagamentoPadrao || null,
      });
      setEditando(false);
    } catch (e) {
      setErroForm(mensagemAmigavel(e, "Não foi possível salvar o cadastro."));
    } finally {
      setSalvando(false);
    }
  };

  const removerCadastro = async () => {
    if (
      !window.confirm(
        `Remover o cadastro de ${p.nome}? O histórico de viagens é mantido, mas o passageiro some da lista.`,
      )
    )
      return;
    setSalvando(true);
    try {
      await onRemover();
    } catch (e) {
      setErroForm(mensagemAmigavel(e, "Não foi possível remover o passageiro."));
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <CadastrosRepetidos p={p} onJuntado={onJuntado} />
      <Field label="Notas do CRM">
        <textarea
          key={p.customer_id}
          defaultValue={p.notes || ""}
          onBlur={(e) => e.target.value !== (p.notes || "") && onSalvarNota(e.target.value)}
          rows={4}
          className={inputCls}
          style={inputStyle}
          placeholder="Preferências, observações, combinados…"
        />
      </Field>
      <div className="rounded-xl p-3" style={{ background: C.panel2 }}>
        {editando && form ? (
          <>
            <div className="text-xs font-semibold mb-2" style={{ color: C.ink }}>
              Editar cadastro
            </div>
            {erroForm && (
              <div className="text-xs mb-2" style={{ color: C.red }}>
                {erroForm}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-2">
              <Field label="Nome">
                <TextInput
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </Field>
              <Field label="Telefone">
                <TextInput
                  inputMode="tel"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                />
              </Field>
              <Field label="Telefone secundário (opcional)">
                <TextInput
                  inputMode="tel"
                  value={form.telefone2}
                  onChange={(e) => setForm({ ...form, telefone2: e.target.value })}
                />
              </Field>
              <Field label="Ponto de embarque padrão (opcional)">
                <Select
                  value={form.pontoPadrao}
                  onChange={(e) => setForm({ ...form, pontoPadrao: e.target.value })}
                >
                  <option value="">— nenhum —</option>
                  {pontos.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Pagamento padrão (opcional)">
                <Select
                  value={form.pagamentoPadrao}
                  onChange={(e) => setForm({ ...form, pagamentoPadrao: e.target.value })}
                >
                  <option value="">— nenhum —</option>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.valor} value={f.valor}>
                      {f.rotulo}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                onClick={salvarEdicao}
                disabled={salvando}
                className="btn-press flex items-center gap-1.5 text-[13px] px-3 min-h-[44px] rounded-lg font-medium disabled:opacity-40"
                style={{ background: C.amber, color: C.onBrand }}
              >
                <Save size={14} /> {salvando ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                disabled={salvando}
                className="btn-press flex items-center gap-1.5 text-[13px] px-3 min-h-[44px] rounded-lg"
                style={{ background: C.panel, color: C.inkSoft }}
              >
                <X size={14} /> Cancelar
              </button>
              <button
                type="button"
                onClick={removerCadastro}
                disabled={salvando}
                aria-label={`Remover cadastro de ${p.nome}`}
                className="btn-press flex items-center gap-1.5 text-[13px] px-3 min-h-[44px] rounded-lg ml-auto disabled:opacity-40"
                style={{ background: C.redSoft, color: C.red }}
              >
                <Trash2 size={14} /> Remover cadastro
              </button>
            </div>
          </>
        ) : (
          <div className="grid gap-2">
            <div className="text-[13px] grid gap-1" style={{ color: C.inkSoft }}>
              <span>
                Ponto padrão:{" "}
                <b style={{ color: C.ink }}>
                  {pontos.find((pt) => pt.id === p.ponto_padrao)?.nome || "não definido"}
                </b>
              </span>
              <span>
                Pagamento padrão:{" "}
                <b style={{ color: C.ink }}>
                  {p.pagamento_padrao ? rotuloPagamento(p.pagamento_padrao) : "não definido"}
                </b>
              </span>
              {p.telefone2 && (
                <span>
                  2º telefone: <b style={{ color: C.ink }}>{p.telefone2}</b>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={abrirEdicao}
              className="btn-press justify-self-start flex items-center gap-1.5 text-[13px] px-3 min-h-[44px] rounded-lg font-medium"
              style={{ background: C.panel, color: C.ink, border: `1px solid ${C.border}` }}
            >
              <Pencil size={14} /> Editar cadastro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Quando viaja: dias da semana × Ida/Volta, mais claro onde viaja mais.
function Habito({ viagens }) {
  const h = habitoPorDia(viagens);
  const max = Math.max(1, ...h.ida, ...h.volta);
  const frase = fraseDoHabito(h);
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const casa = (n, chave) => {
    const forte = n / max > 0.5;
    return (
      <span
        key={chave}
        className="h-[30px] rounded-[7px] flex items-center justify-center text-[12px] font-semibold tabular-nums"
        style={{
          background: n ? `rgba(245,243,241,${(0.14 + (0.8 * n) / max).toFixed(2)})` : C.panel,
          color: forte ? C.bg : C.inkSoft,
        }}
      >
        {n || ""}
      </span>
    );
  };
  return (
    <div>
      <div
        className="grid gap-1 items-center"
        style={{ gridTemplateColumns: "44px repeat(7, minmax(0,1fr))" }}
        role="img"
        aria-label={frase || "Ainda sem um dia de costume"}
      >
        <span />
        {ordem.map((d) => (
          <span key={d} className="text-center text-[11.5px]" style={{ color: C.inkFaint }}>
            {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d]}
          </span>
        ))}
        <span className="text-[12.5px]" style={{ color: C.inkSoft }}>
          Ida
        </span>
        {ordem.map((d) => casa(h.ida[d], `i${d}`))}
        <span className="text-[12.5px]" style={{ color: C.inkSoft }}>
          Volta
        </span>
        {ordem.map((d) => casa(h.volta[d], `v${d}`))}
      </div>
      <p className="text-[13px] mt-2" style={{ color: C.inkSoft }}>
        {frase || "Ainda sem um dia de costume."}
      </p>
    </div>
  );
}

function PorMes({ viagens, hoje }) {
  const meses = viagensPorMes(viagens, hoje);
  const max = Math.max(1, ...meses.map((m) => m.n));
  return (
    <div
      className="grid grid-cols-6 gap-2 items-end h-[92px]"
      role="img"
      aria-label={meses.map((m) => `${m.rotulo}: ${m.n}`).join(", ")}
    >
      {meses.map((m) => (
        <div key={m.chave} className="grid gap-1 justify-items-center content-end h-full">
          <span className="text-[12px] font-semibold tabular-nums" style={{ color: C.ink }}>
            {m.n}
          </span>
          <span
            className="w-full max-w-[34px] rounded-[6px_6px_2px_2px]"
            style={{
              height: Math.max(4, Math.round((m.n / max) * 54)),
              background: m.atual ? C.ink : C.inkSoft,
            }}
          />
          <span className="text-[11.5px]" style={{ color: C.inkFaint }}>
            {m.rotulo}
          </span>
        </div>
      ))}
    </div>
  );
}

function Bloco({ titulo, acao, children }) {
  return (
    <section className="mt-5 first:mt-1">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-[14.5px] font-bold" style={{ color: C.ink }}>
          {titulo}
        </h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Resumo({ p, viagens, carregandoViagens, trips, hoje, onAgendar }) {
  const enderecosIda = useMemo(
    () =>
      enderecosFrequentes(
        viagens.filter((v) => v.direcao === "ida"),
        (v) => enderecoEmbarque(v, trips) || v.bairro,
      ),
    [viagens, trips],
  );
  const enderecosVolta = useMemo(
    () =>
      enderecosFrequentes(
        viagens.filter((v) => v.direcao === "volta"),
        (v) => v.desembarque || enderecoEmbarque(v, trips),
      ),
    [viagens, trips],
  );
  return (
    <div>
      <Bloco titulo="Quando viaja">
        {carregandoViagens ? <Skeleton height={74} rounded={10} /> : <Habito viagens={viagens} />}
      </Bloco>
      <Bloco titulo="Viagens por mês">
        {carregandoViagens ? (
          <Skeleton height={92} rounded={10} />
        ) : (
          <PorMes viagens={viagens} hoje={hoje} />
        )}
      </Bloco>
      <Bloco titulo="Endereços">
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <EnderecosFreq titulo="Embarque (ida)" itens={enderecosIda} loading={carregandoViagens} />
          <EnderecosFreq
            titulo="Desembarque (volta)"
            itens={enderecosVolta}
            loading={carregandoViagens}
          />
        </div>
        <EnderecoDeCostume p={p} trips={trips} onAgendar={onAgendar} />
      </Bloco>
      <Bloco titulo="O que o bot sabe">
        <div className="rounded-2xl p-3 grid gap-2.5" style={{ background: C.panel }}>
          {p.bot_instructions || p.nota_do_bot ? (
            <>
              {p.bot_instructions && (
                <p className="text-[13.5px]" style={{ color: C.ink }}>
                  <span className="block text-[12px]" style={{ color: C.inkFaint }}>
                    Ensinado pela equipe
                  </span>
                  {p.bot_instructions}
                </p>
              )}
              {p.nota_do_bot && (
                <p className="text-[13.5px]" style={{ color: C.inkSoft }}>
                  <span className="block text-[12px]" style={{ color: C.inkFaint }}>
                    Anotado pelo bot nas conversas
                  </span>
                  {p.nota_do_bot}
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px]" style={{ color: C.inkSoft }}>
              Nada ensinado sobre este passageiro. Para ensinar, peça no Assistente: "ensine ao bot
              que…".
            </p>
          )}
        </div>
      </Bloco>
    </div>
  );
}

function Pagamentos({ viagens, carregando, hoje, onMarcarPago, marcando }) {
  const { pendentes, pagos, totalPendente, totalPago } = pagamentosDoPassageiro(viagens, hoje);
  if (carregando) return <Skeleton height={120} rounded={12} />;
  const linha = (v, pendente) => (
    <div
      key={v.id}
      className="flex items-center justify-between gap-3 min-h-[56px] py-2 border-b"
      style={{ borderColor: C.panel2 }}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold" style={{ color: C.ink }}>
          {v.direcao === "volta" ? "Volta" : "Ida"} de {dataDoHistorico(v.data)}
        </span>
        <span className="block text-[12.5px]" style={{ color: C.inkSoft }}>
          {fmtBRL(Number(v.valorTotal) || 0)}
          {pendente
            ? " · sem pagamento marcado"
            : ` · pago${v.pagamento ? ` em ${rotuloPagamento(v.pagamento)}` : ""}`}
        </span>
      </span>
      {pendente ? (
        <button
          type="button"
          onClick={() => onMarcarPago(v)}
          disabled={marcando}
          className="btn-press shrink-0 min-h-[40px] px-3 rounded-xl text-[13px] font-semibold disabled:opacity-50"
          style={{ background: C.ink, color: C.bg }}
        >
          Marcar pago
        </button>
      ) : (
        <Check size={16} style={{ color: C.ink }} aria-label="pago" />
      )}
    </div>
  );
  return (
    <div>
      <div className="grid grid-cols-2 rounded-2xl" style={{ background: C.panel }}>
        <div className="p-3">
          <span className="block text-[12px]" style={{ color: C.inkSoft }}>
            Sem pagamento marcado
          </span>
          <b className="block text-[19px] tabular-nums" style={{ color: C.ink }}>
            {fmtBRL(totalPendente)}
          </b>
          <span className="text-[12px]" style={{ color: C.inkFaint }}>
            {pendentes.length} {pendentes.length === 1 ? "viagem feita" : "viagens feitas"}
          </span>
        </div>
        <div className="p-3" style={{ boxShadow: `inset 1px 0 0 0 ${C.border}` }}>
          <span className="block text-[12px]" style={{ color: C.inkSoft }}>
            Pago e marcado
          </span>
          <b className="block text-[19px] tabular-nums" style={{ color: C.ink }}>
            {fmtBRL(totalPago)}
          </b>
          <span className="text-[12px]" style={{ color: C.inkFaint }}>
            {pagos.length} {pagos.length === 1 ? "viagem" : "viagens"}
          </span>
        </div>
      </div>
      {pendentes.length > 0 && (
        <Bloco titulo="Para marcar">{pendentes.map((v) => linha(v, true))}</Bloco>
      )}
      {pagos.length > 0 && (
        <Bloco titulo="Pagas">{pagos.slice(0, 10).map((v) => linha(v, false))}</Bloco>
      )}
      {pendentes.length === 0 && pagos.length === 0 && (
        <p className="text-[13px] mt-4" style={{ color: C.inkSoft }}>
          Nenhuma viagem feita ainda.
        </p>
      )}
    </div>
  );
}

const AUTOR = { cliente: "Passageiro", equipe: "Equipe", bot: "Bot" };
const QUANDO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const AVISO = {
  horario: "Horário do ponto",
  confirmacao: "Confirmar viagem",
  em_rota: "Em rota",
};
const SITUACAO_AVISO = {
  enviado: "enviado",
  fora_da_janela: "não enviado (fora das 24 h)",
  sem_conversa: "não enviado (sem conversa)",
};

function Conversa({ customerId, ativo }) {
  const { conversa, carregando, erro } = useConversaDoPassageiro(customerId, ativo);
  const cfg = useSettings();
  if (erro)
    return (
      <p className="text-[13px]" style={{ color: C.inkSoft }}>
        {erro}
      </p>
    );
  if (carregando) return <Skeleton height={160} rounded={12} />;
  const mensagens = conversa?.mensagens ?? [];
  const avisos = conversa?.avisos ?? [];
  const link =
    cfg.chatwootUrl && conversa?.chatwoot_conversation_id
      ? `${cfg.chatwootUrl}/conversations/${conversa.chatwoot_conversation_id}`
      : null;
  return (
    <div>
      <Bloco titulo="WhatsApp">
        {mensagens.length === 0 ? (
          <p className="text-[13px]" style={{ color: C.inkSoft }}>
            Nenhuma conversa guardada com este número.
          </p>
        ) : (
          <div className="grid gap-1.5" data-testid="conversa-do-passageiro">
            {mensagens.map((m) => {
              const doCliente = m.autor === "cliente";
              return (
                <p
                  key={`${m.em}-${m.autor}`}
                  className="max-w-[84%] rounded-2xl px-3 py-2 text-[13.5px] whitespace-pre-wrap"
                  style={{
                    justifySelf: doCliente ? "start" : "end",
                    background: doCliente ? C.panel2 : C.border,
                    color: C.ink,
                    overflowWrap: "anywhere",
                  }}
                >
                  {m.texto}
                  <span
                    className="block text-[11px] mt-0.5 text-right"
                    style={{ color: C.inkFaint }}
                  >
                    {AUTOR[m.autor] ?? m.autor} · {QUANDO.format(new Date(m.em))}
                  </span>
                </p>
              );
            })}
          </div>
        )}
      </Bloco>
      {avisos.length > 0 && (
        <Bloco titulo="Avisos enviados pelo app">
          <div className="rounded-2xl px-3" style={{ background: C.panel }}>
            {avisos.map((a) => (
              <div
                key={`${a.em}-${a.tipo}`}
                className="py-2.5 border-b last:border-b-0"
                style={{ borderColor: C.border }}
              >
                <span className="block text-[14px] font-semibold" style={{ color: C.ink }}>
                  {AVISO[a.tipo] ?? a.tipo}
                </span>
                <span className="block text-[12.5px]" style={{ color: C.inkSoft }}>
                  {QUANDO.format(new Date(a.em))} · {SITUACAO_AVISO[a.status] ?? a.status}
                  {a.resposta === "sim"
                    ? " · respondeu SIM"
                    : a.resposta === "nao"
                      ? " · respondeu NÃO"
                      : ""}
                </span>
              </div>
            ))}
          </div>
        </Bloco>
      )}
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="btn-press mt-4 flex items-center justify-center gap-2 min-h-[48px] rounded-2xl text-[14.5px] font-semibold"
          style={{ background: C.border, color: C.ink }}
        >
          <ExternalLink size={17} /> Abrir a conversa no Chatwoot
        </a>
      )}
    </div>
  );
}

function Conteudo({
  customerId,
  inicial,
  abaInicial,
  trips,
  onFechar,
  onAgendar,
  onAlterado,
  onRemovido,
}) {
  const {
    p,
    carregando,
    erro,
    tentarDeNovo,
    viagens,
    carregandoViagens,
    salvarNota,
    salvarPerfil,
    remover,
    marcarPago,
    marcandoPago,
  } = usePassageiro(customerId, { inicial });
  const { costume } = useEnderecoDeCostume(customerId);
  const [aba, setAba] = useState(abaInicial);
  const [copiado, setCopiado] = useState(false);
  const voltar = useRef(null);
  const abas = useRef(null);
  useEffect(() => {
    voltar.current?.focus();
  }, []);
  const hoje = todayStr();

  const tel = digitos(p?.telefone);
  const nome = p ? nomeParaMostrar(p) : "";
  const nota = async (texto) => onAlterado?.(customerId, await salvarNota(texto));
  const perfil = async (campos) => onAlterado?.(customerId, await salvarPerfil(campos));
  const removerEFechar = async () => {
    await remover();
    onRemovido?.(customerId);
    onFechar();
  };
  const pago = async (v) => {
    await marcarPago(v);
    onAlterado?.(customerId, {
      a_receber: Math.max(0, Number(p?.a_receber || 0) - (Number(v.valorTotal) || 0)),
    });
  };
  const agendar = (direcao) =>
    onAgendar?.(
      inicialDoAgendamento({
        cliente: p,
        direcao,
        costume: costume?.[direcao] ?? null,
        trips,
        data: dataOperacao(1),
      }),
    );
  const copiarTelefone = async () => {
    setCopiado(await copiarTexto(p.telefone));
    setTimeout(() => setCopiado(false), 1400);
  };
  const irPara = (id) => {
    setAba(id);
    abas.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const aReceber = Number(p?.a_receber) || 0;
  const atalho =
    "btn-press min-h-[64px] rounded-2xl grid justify-items-center content-center gap-1.5 text-[12.5px] font-medium";

  return (
    <>
      <header
        className="flex-none flex items-center gap-1 px-1.5"
        style={{ paddingTop: "max(8px, env(safe-area-inset-top, 0px))", background: C.bg }}
      >
        <button
          ref={voltar}
          type="button"
          onClick={onFechar}
          aria-label="Voltar"
          className="btn-press flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
          style={{ color: C.ink }}
        >
          <ChevronLeft size={22} />
        </button>
        <span className="flex-1" />
        {p && (
          <button
            type="button"
            onClick={() => irPara("cadastro")}
            aria-label="Ir para o cadastro"
            className="btn-press flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
            style={{ color: C.inkSoft }}
          >
            <Pencil size={19} />
          </button>
        )}
      </header>
      <div
        className="flex-1 overflow-y-auto overscroll-contain px-4"
        style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))" }}
      >
        {erro && (
          <ErrorBanner onRetry={tentarDeNovo} className="mb-3">
            {erro}
          </ErrorBanner>
        )}
        {carregando ? (
          <div className="space-y-3 pt-2" data-testid="ficha-carregando">
            <div className="flex items-center gap-3">
              <Skeleton width={56} height={56} rounded={28} />
              <div className="flex-1 grid gap-2">
                <Skeleton height={20} width="60%" />
                <Skeleton height={14} width="40%" />
              </div>
            </div>
            <Skeleton height={64} rounded={16} />
            <Skeleton height={120} rounded={16} />
          </div>
        ) : !p ? (
          <p className="text-sm" style={{ color: C.inkSoft }}>
            Este passageiro não está mais no cadastro.
          </p>
        ) : (
          <FadeIn>
            <div
              className="grid items-center gap-3.5"
              style={{ gridTemplateColumns: "56px minmax(0,1fr)" }}
            >
              <span
                aria-hidden="true"
                className="w-14 h-14 rounded-full flex items-center justify-center text-[18px] font-semibold"
                style={{ background: C.border, color: C.ink }}
              >
                {iniciais(nome)}
              </span>
              <div className="min-w-0">
                <h2
                  className="text-[21px] font-bold leading-tight break-words"
                  style={{
                    color: nome ? C.ink : C.inkSoft,
                    fontStyle: nome ? "normal" : "italic",
                    letterSpacing: "-.025em",
                  }}
                >
                  {nome || "Sem nome"}
                </h2>
                {p.telefone && (
                  <button
                    type="button"
                    onClick={copiarTelefone}
                    aria-label={`Copiar o telefone ${p.telefone}`}
                    className="inline-flex items-center gap-1.5 min-h-[30px] text-[13.5px] tabular-nums"
                    style={{ color: C.inkSoft }}
                  >
                    {copiado ? "copiado" : p.telefone}
                    {copiado ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                )}
                <span className="block text-[12.5px]" style={{ color: C.inkFaint }}>
                  {clienteDesde(p.cliente_desde)}
                </span>
              </div>
            </div>
            {etiquetas(p, hoje, rotuloPagamento).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {etiquetas(p, hoje, rotuloPagamento).map((e) => (
                  <span
                    key={e.texto}
                    className="text-[12.5px] rounded-lg px-2 py-1"
                    style={{
                      background:
                        e.tipo === "alerta" ? C.rubro3 : e.tipo === "forte" ? C.border : C.panel2,
                      color:
                        e.tipo === "alerta" ? C.brandText : e.tipo === "forte" ? C.ink : C.inkSoft,
                      fontWeight: e.tipo === "normal" ? 400 : 600,
                    }}
                  >
                    {e.texto}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-4 gap-2 mt-3.5">
              {tel ? (
                <a
                  href={`tel:${tel}`}
                  className={atalho}
                  style={{ background: C.ink, color: C.bg, fontWeight: 600 }}
                >
                  <Phone size={20} /> Ligar
                </a>
              ) : (
                <span className={atalho} style={{ background: C.panel, color: C.inkFaint }}>
                  <Phone size={20} /> Ligar
                </span>
              )}
              {tel ? (
                <a
                  href={`https://wa.me/55${tel}`}
                  target="_blank"
                  rel="noreferrer"
                  className={atalho}
                  style={{ background: C.panel, color: C.ink }}
                >
                  <MessageCircle size={20} /> WhatsApp
                </a>
              ) : (
                <span className={atalho} style={{ background: C.panel, color: C.inkFaint }}>
                  <MessageCircle size={20} /> WhatsApp
                </span>
              )}
              {["ida", "volta"].map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={!onAgendar}
                  onClick={() => agendar(d)}
                  className={`${atalho} disabled:opacity-40`}
                  style={{ background: C.panel, color: C.ink }}
                >
                  <Plus size={20} /> {d === "ida" ? "Agendar Ida" : "Agendar Volta"}
                </button>
              ))}
            </div>
            {(p.proxima_data || aReceber > 0 || p.sumiu) && (
              <div className="grid gap-1.5 mt-3">
                {p.proxima_data && (
                  <div
                    className="grid items-center gap-2.5 rounded-2xl pl-3 pr-2 py-2.5"
                    style={{ gridTemplateColumns: "20px minmax(0,1fr)", background: C.panel }}
                  >
                    <CalendarDays size={18} style={{ color: C.inkSoft }} />
                    <span className="text-[14px] font-semibold" style={{ color: C.ink }}>
                      Próxima viagem: {diaCurto(p.proxima_data, hoje)}
                      <span
                        className="block text-[12.5px] font-normal"
                        style={{ color: C.inkSoft }}
                      >
                        {dataDoHistorico(p.proxima_data)}
                      </span>
                    </span>
                  </div>
                )}
                {aReceber > 0 && (
                  <div
                    className="grid items-center gap-2.5 rounded-2xl pl-3 pr-1.5 py-1.5"
                    style={{ gridTemplateColumns: "20px minmax(0,1fr) auto", background: C.panel }}
                  >
                    <Wallet size={18} style={{ color: C.brandText }} />
                    <span className="text-[14px] font-semibold" style={{ color: C.ink }}>
                      {fmtBRL(aReceber)} sem pagamento marcado
                      <span
                        className="block text-[12.5px] font-normal"
                        style={{ color: C.inkSoft }}
                      >
                        {p.a_receber_qtd}{" "}
                        {p.a_receber_qtd === 1 ? "viagem feita" : "viagens feitas"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => irPara("pagamentos")}
                      className="btn-press min-h-[40px] px-3 rounded-xl text-[13px] font-semibold"
                      style={{ background: C.ink, color: C.bg }}
                    >
                      Ver
                    </button>
                  </div>
                )}
                {p.sumiu && p.ultima_viagem && (
                  <div
                    className="grid items-center gap-2.5 rounded-2xl pl-3 pr-1.5 py-1.5"
                    style={{ gridTemplateColumns: "20px minmax(0,1fr) auto", background: C.panel }}
                  >
                    <AlertTriangle size={18} style={{ color: C.brandText }} />
                    <span className="text-[14px] font-semibold" style={{ color: C.ink }}>
                      Não viaja há {diasEntre(p.ultima_viagem, hoje)} dias
                      <span
                        className="block text-[12.5px] font-normal"
                        style={{ color: C.inkSoft }}
                      >
                        {fraseDoHabito(habitoPorDia(viagens)) || "Viajava com frequência."} Um alô
                        costuma trazer de volta.
                      </span>
                    </span>
                    {tel && (
                      <a
                        href={`https://wa.me/55${tel}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-press min-h-[40px] px-3 rounded-xl text-[13px] font-semibold flex items-center"
                        style={{ background: C.border, color: C.ink }}
                      >
                        Chamar
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 mt-3 rounded-2xl" style={{ background: C.panel }}>
              {[
                ["Viagens", p.viagens_count ?? 0, `${p.viagens_90d ?? 0} nos últimos 90 dias`],
                [
                  "Já gerou",
                  fmtBRL(Number(p.total_gasto || 0)),
                  p.viagens_count
                    ? `média de ${fmtBRL(Number(p.total_gasto || 0) / p.viagens_count)}`
                    : "nenhuma viagem",
                ],
                [
                  "Última viagem",
                  p.ultima_viagem ? haQuantoTempo(diasEntre(p.ultima_viagem, hoje)) : "nenhuma",
                  p.ultima_viagem ? dataDoHistorico(p.ultima_viagem) : "",
                ],
                [
                  "Cancelou / faltou",
                  `${p.cancelamentos ?? 0} / ${p.nao_compareceu ?? 0}`,
                  `de ${p.reservas_total ?? 0} reservas`,
                ],
              ].map(([rotulo, valor, sub], i) => (
                <div
                  key={rotulo}
                  className="p-3 min-w-0"
                  style={{
                    boxShadow:
                      [
                        i % 2 ? `inset 1px 0 0 0 ${C.border}` : null,
                        i >= 2 ? `inset 0 1px 0 0 ${C.border}` : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "none",
                  }}
                >
                  <span className="block text-[12px]" style={{ color: C.inkSoft }}>
                    {rotulo}
                  </span>
                  <b
                    className="block text-[18px] tabular-nums truncate"
                    style={{ color: C.ink, letterSpacing: "-.03em" }}
                  >
                    {valor}
                  </b>
                  <span className="block text-[12px] truncate" style={{ color: C.inkFaint }}>
                    {sub}
                  </span>
                </div>
              ))}
            </div>
            <div
              ref={abas}
              className="sticky top-0 z-[2] -mx-4 px-4 mt-5 flex gap-5 overflow-x-auto scroll-mt-0"
              role="tablist"
              aria-label="Partes da ficha"
              style={{
                background: C.bg,
                boxShadow: `inset 0 -1px 0 0 ${C.border}`,
                scrollbarWidth: "none",
              }}
            >
              {ABAS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={aba === a.id}
                  onClick={() => setAba(a.id)}
                  className="relative shrink-0 min-h-[46px] text-[14.5px] font-medium whitespace-nowrap"
                  style={{ color: aba === a.id ? C.ink : C.inkSoft }}
                >
                  {a.rotulo}
                  {a.id === "pagamentos" && aReceber > 0 && (
                    <span
                      aria-hidden="true"
                      className="inline-block w-1.5 h-1.5 rounded-full ml-1.5 align-middle"
                      style={{ background: C.lanterna }}
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute left-0 right-0 bottom-0 h-[2px] rounded-full"
                    style={{
                      background: C.lanterna,
                      opacity: aba === a.id ? 1 : 0,
                      transition: "opacity var(--motion-base) var(--ease-out-quart)",
                    }}
                  />
                </button>
              ))}
            </div>
            <div
              className="pt-3"
              role="tabpanel"
              aria-label={ABAS.find((a) => a.id === aba)?.rotulo}
            >
              <FadeIn key={aba}>
                {aba === "resumo" && (
                  <Resumo
                    p={p}
                    viagens={viagens}
                    carregandoViagens={carregandoViagens}
                    trips={trips}
                    hoje={hoje}
                    onAgendar={onAgendar}
                  />
                )}
                {aba === "viagens" && (
                  <HistoricoDeViagens viagens={viagens} loading={carregandoViagens} trips={trips} />
                )}
                {aba === "pagamentos" && (
                  <Pagamentos
                    viagens={viagens}
                    carregando={carregandoViagens}
                    hoje={hoje}
                    onMarcarPago={pago}
                    marcando={marcandoPago}
                  />
                )}
                {aba === "conversa" && <Conversa customerId={customerId} ativo />}
                {aba === "cadastro" && (
                  <Cadastro
                    p={p}
                    trips={trips}
                    onSalvarNota={nota}
                    onSalvarPerfil={perfil}
                    onRemover={removerEFechar}
                    onJuntado={() => {
                      tentarDeNovo();
                      onAlterado?.(customerId, {});
                    }}
                  />
                )}
              </FadeIn>
            </div>
          </FadeIn>
        )}
      </div>
    </>
  );
}

/**
 * `ficha` = { customerId, inicial?, aba? } do último passageiro aberto; `aberta` liga e desliga
 * (a ficha some com transição). `onAlterado(id, campos)` e `onRemovido(id)` avisam a lista.
 */
export default function FichaDoPassageiro({
  ficha,
  aberta,
  onFechar,
  trips,
  onAgendar,
  onAlterado,
  onRemovido,
}) {
  const fecharNoEsc = (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onFechar();
  };

  return (
    <Presence when={aberta && !!ficha} {...ENTRADA}>
      {(_estado, estilo) =>
        createPortal(
          <div
            className="fixed inset-0 z-50 md:flex md:items-center md:justify-center"
            style={{
              background: "rgba(0,0,0,.6)",
              opacity: estilo?.opacity,
              transition: estilo?.transition,
            }}
            onClick={onFechar}
            onKeyDown={fecharNoEsc}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Ficha do passageiro${ficha?.inicial?.nome ? ` ${ficha.inicial.nome}` : ""}`}
              className="absolute inset-0 md:static md:w-[640px] md:max-w-[calc(100vw-48px)] md:h-[min(88vh,860px)] md:rounded-2xl md:border flex flex-col overflow-hidden"
              style={{ background: C.bg, borderColor: C.border, ...estilo }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={fecharNoEsc}
            >
              <Conteudo
                key={ficha.customerId}
                customerId={ficha.customerId}
                inicial={ficha.inicial ?? null}
                abaInicial={ficha.aba ?? "resumo"}
                trips={trips}
                onFechar={onFechar}
                // agendar pela ficha fecha a ficha: a nova reserva abre por cima da tela
                onAgendar={
                  onAgendar
                    ? (inicial) => {
                        onFechar();
                        onAgendar(inicial);
                      }
                    : null
                }
                onAlterado={onAlterado}
                onRemovido={onRemovido}
              />
            </div>
          </div>,
          document.body,
        )
      }
    </Presence>
  );
}
