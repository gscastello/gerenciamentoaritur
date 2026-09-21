import {
  AlertTriangle,
  Bot,
  Check,
  Download,
  KeyRound,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCog,
  UserX,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useBackup } from "../../hooks/useBackup.js";
import { useDiagnostics } from "../../hooks/useDiagnostics.js";
import { useErrorLog } from "../../hooks/useErrorLog.js";
import { useSettings } from "../../hooks/useSettings.js";
import { useUsersList } from "../../hooks/useUsers.js";
import {
  abrirRelatorioPDF,
  baixarCSVZip,
  baixarExcel,
  baixarJSON,
} from "../../lib/backupExport.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import {
  getMotionPref,
  resolveMotion,
  setMotionPref,
  watchSystemMotion,
} from "../../lib/motion.js";
import { EVENTS, emit } from "../../observability/index.js";
import {
  C,
  Card,
  HeroFX,
  Select,
  TextInput,
  fmtDataHora,
  normalizar,
  runDiagnostics,
  useBairros,
  useDropoff,
} from "../tabShared.jsx";

/* ============================= 8. SISTEMA ============================= */
const DIAG_KIND_LABEL = {
  overbooking: "Overbooking (passageiros acima da capacidade)",
  ponto_invalido: "Ponto de embarque removido ou não informado",
  sem_telefone: "Reserva ativa sem telefone de contato",
  quantidade_dessincronizada: "Quantidade fora de sincronia com os passageiros",
  sem_viagem: "Passagem confirmada sem viagem associada",
  pagamento_ausente: "Passagem confirmada há +1 dia sem registro de pagamento",
};

// Cidades da rota (issue #6): atendidas (São Luís/Cantanhede/Pirapemas) e
// intermediárias (onde não paramos → reserva pendente). settings.served_cities
// / settings.intermediate_cities. (definição estava faltando no PR #83)
function ListaChips({ titulo, ajuda, itens, onSalvar, salvando }) {
  const [novo, setNovo] = useState("");
  const norm = (s) => normalizar(s);
  const add = () => {
    const v = norm(novo);
    if (v && !itens.includes(v)) onSalvar([...itens, v]);
    setNovo("");
  };
  const remove = (c) => onSalvar(itens.filter((x) => x !== c));
  return (
    <div>
      <div className="text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>
        {titulo}
      </div>
      <div className="text-[11px] mb-2" style={{ color: C.inkFaint }}>
        {ajuda}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {itens.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full capitalize"
            style={{ background: C.panel2, color: C.inkSoft }}
          >
            {c}
            <button
              type="button"
              onClick={() => remove(c)}
              disabled={salvando}
              aria-label={`remover ${c}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {itens.length === 0 && (
          <span className="text-xs" style={{ color: C.inkFaint }}>
            (vazio)
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <TextInput
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Adicionar cidade…"
          className="w-48"
        />
        <button
          type="button"
          onClick={add}
          disabled={!norm(novo) || salvando}
          className="btn-press text-xs px-3 py-2 rounded-md disabled:opacity-40"
          style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

function SistemaCidades() {
  const s = useSettings();
  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Route size={16} style={{ color: C.amber }} /> Cidades da rota
      </div>
      <p className="text-xs mb-4" style={{ color: C.inkSoft }}>
        No fluxo de reserva, embarque/desembarque que menciona uma cidade <b>intermediária</b> faz a
        reserva nascer <b>pendente</b> (não ocupa vaga, a equipe confirma). As <b>atendidas</b> são
        a rota normal. O bot do WhatsApp usa as mesmas listas.
      </p>
      {s.error && (
        <div
          className="mb-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          {mensagemAmigavel(s.error, "Erro ao carregar as configurações.")}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-6">
        <ListaChips
          titulo="Cidades atendidas"
          ajuda="A rota para nessas cidades."
          itens={s.servedCities}
          onSalvar={s.setServedCities}
          salvando={s.saving}
        />
        <ListaChips
          titulo="Cidades intermediárias"
          ajuda="No caminho, mas não paramos — vira reserva pendente."
          itens={s.intermediateCities}
          onSalvar={s.setIntermediateCities}
          salvando={s.saving}
        />
      </div>
    </Card>
  );
}

// Preço de "Buscar em Casa" por bairro — tabela neighborhood_pricing,
// editável (database/23-precos-bairro-editaveis.sql).
// Baldes de desembarque (database/24-baldes-desembarque.sql) — rótulo,
// campo de detalhe e ordem, editáveis. O `code` novo não é adivinhado
// sozinho pela inferência por palavra-chave; a classificação manual do
// motorista prevalece.
function SistemaBaldes() {
  const dropoff = useDropoff();
  const [erro, setErro] = useState("");
  const [novo, setNovo] = useState({
    direction: "ida",
    label: "",
    detailLabel: "",
    detailRequired: false,
  });
  const [editId, setEditId] = useState(null);
  const [ev, setEv] = useState({});

  const run = async (fn, msg) => {
    setErro("");
    try {
      await fn();
      return true;
    } catch (e) {
      setErro(mensagemAmigavel(e, msg || "Não foi possível concluir."));
      return false;
    }
  };
  const criar = () =>
    run(async () => {
      if (!novo.label.trim()) return;
      await dropoff.criar({
        direction: novo.direction,
        label: novo.label.trim(),
        detailLabel: novo.detailLabel.trim() || "Ponto de referência",
        detailRequired: novo.detailRequired,
        sortOrder: 100 + dropoff.porDirecao(novo.direction).length * 10,
      });
      setNovo({ ...novo, label: "", detailLabel: "" });
    }, "Não foi possível criar o local.");
  const salvar = () =>
    run(async () => {
      await dropoff.editar(editId, {
        label: (ev.label ?? "").trim() || "Local",
        detail_label: (ev.detail_label ?? "").trim() || "Ponto de referência",
        detail_placeholder: ev.detail_placeholder ?? "",
        detail_required: !!ev.detail_required,
        sort_order: Number.parseInt(ev.sort_order, 10) || 100,
      });
      setEditId(null);
    }, "Não foi possível salvar.");

  const linha = (b) =>
    editId === b.id ? (
      <tr key={b.id} style={{ background: C.panel2 }}>
        <td className="px-2 py-1.5">
          <TextInput
            value={ev.label}
            onChange={(e) => setEv({ ...ev, label: e.target.value })}
            className="text-xs"
          />
        </td>
        <td className="px-2 py-1.5">
          <TextInput
            value={ev.detail_label}
            onChange={(e) => setEv({ ...ev, detail_label: e.target.value })}
            className="text-xs"
            placeholder="Rótulo do campo de detalhe"
          />
          <TextInput
            value={ev.detail_placeholder}
            onChange={(e) => setEv({ ...ev, detail_placeholder: e.target.value })}
            className="text-xs mt-1"
            placeholder="Placeholder (ex.: Km, o que tem perto)"
          />
        </td>
        <td className="px-2 py-1.5 text-center">
          <input
            type="checkbox"
            checked={!!ev.detail_required}
            onChange={(e) => setEv({ ...ev, detail_required: e.target.checked })}
          />
        </td>
        <td className="px-2 py-1.5 w-14">
          <TextInput
            type="number"
            value={ev.sort_order}
            onChange={(e) => setEv({ ...ev, sort_order: e.target.value })}
            className="text-xs w-14"
          />
        </td>
        <td className="px-2 py-1.5">
          <div className="flex gap-2">
            <button type="button" onClick={salvar}>
              <Save size={13} style={{ color: C.green }} />
            </button>
            <button type="button" onClick={() => setEditId(null)}>
              <X size={13} style={{ color: C.inkFaint }} />
            </button>
          </div>
        </td>
      </tr>
    ) : (
      <tr key={b.id} className="row-hover border-t" style={{ borderColor: C.borderSoft }}>
        <td className="px-2 py-1.5">{b.label}</td>
        <td className="px-2 py-1.5 text-xs" style={{ color: C.inkSoft }}>
          {b.detail_label}
        </td>
        <td className="px-2 py-1.5 text-center text-xs">{b.detail_required ? "sim" : "—"}</td>
        <td className="px-2 py-1.5 text-xs" style={{ color: C.inkFaint }}>
          {b.sort_order}
        </td>
        <td className="px-2 py-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditId(b.id);
                setEv({
                  label: b.label,
                  detail_label: b.detail_label,
                  detail_placeholder: b.detail_placeholder,
                  detail_required: b.detail_required,
                  sort_order: String(b.sort_order),
                });
              }}
            >
              <Pencil size={12} style={{ color: C.inkFaint }} />
            </button>
            <button
              type="button"
              onClick={() => run(() => dropoff.remover(b.id), "Não foi possível remover.")}
            >
              <X size={13} style={{ color: C.inkFaint }} />
            </button>
          </div>
        </td>
      </tr>
    );

  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <MapPin size={16} style={{ color: C.amber }} /> Locais de desembarque
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        O passo "Onde você vai ficar" da reserva e os grupos da rota do motorista. Renomeie, defina
        se o detalhe é obrigatório e a ordem em que o ônibus alcança cada local.
      </p>
      {erro && (
        <div
          className="mb-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          {erro}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <Select
          value={novo.direction}
          onChange={(e) => setNovo({ ...novo, direction: e.target.value })}
          className="w-24"
        >
          <option value="ida">Ida</option>
          <option value="volta">Volta</option>
        </Select>
        <TextInput
          value={novo.label}
          onChange={(e) => setNovo({ ...novo, label: e.target.value })}
          placeholder="Nome do local"
          className="w-44"
        />
        <TextInput
          value={novo.detailLabel}
          onChange={(e) => setNovo({ ...novo, detailLabel: e.target.value })}
          placeholder="Rótulo do detalhe"
          className="w-44"
        />
        <label className="text-xs flex items-center gap-1" style={{ color: C.inkSoft }}>
          <input
            type="checkbox"
            checked={novo.detailRequired}
            onChange={(e) => setNovo({ ...novo, detailRequired: e.target.checked })}
          />
          detalhe obrigatório
        </label>
        <button
          type="button"
          onClick={criar}
          disabled={!novo.label.trim() || dropoff.salvando}
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md disabled:opacity-40"
          style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
        >
          <Plus size={13} /> Criar
        </button>
      </div>
      {["ida", "volta"].map((dir) => (
        <div key={dir} className="mb-3">
          <div className="text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>
            {dir === "ida" ? "Ida (São Luís → Pirapemas)" : "Volta (Pirapemas → São Luís)"}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
                  <th className="px-2 py-1 font-medium">Local</th>
                  <th className="px-2 py-1 font-medium">Campo de detalhe</th>
                  <th className="px-2 py-1 font-medium">Obrig.</th>
                  <th className="px-2 py-1 font-medium">Ordem</th>
                  <th className="px-2 py-1 font-medium" aria-label="ações" />
                </tr>
              </thead>
              <tbody>{dropoff.porDirecao(dir).map(linha)}</tbody>
            </table>
          </div>
        </div>
      ))}
    </Card>
  );
}

function SistemaBairros() {
  const bairros = useBairros();
  const [novo, setNovo] = useState({ nome: "", preco: "80" });
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const [precoEdit, setPrecoEdit] = useState({}); // id -> valor sendo digitado

  const salvar = async (nome, preco) => {
    setErro("");
    try {
      await bairros.salvar(nome, Number.parseFloat(preco));
      return true;
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar."));
      return false;
    }
  };
  const adicionar = async () => {
    if (!novo.nome.trim() || !novo.preco) return;
    if (await salvar(novo.nome.trim(), novo.preco)) setNovo({ nome: "", preco: novo.preco });
  };
  const remover = async (b) => {
    setErro("");
    try {
      await bairros.remover(b.id);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível remover."));
    }
  };

  const filtro = normalizar(busca);
  const lista = bairros.bairros
    .filter((b) => !filtro || normalizar(b.neighborhood).includes(filtro))
    .sort(
      (a, b) =>
        Number(a.price) - Number(b.price) || a.neighborhood.localeCompare(b.neighborhood, "pt-BR"),
    );

  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <MapPin size={16} style={{ color: C.amber }} /> Preços por bairro (Buscar em Casa)
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Quando o cliente escolhe "Buscar em Casa", o valor da passagem vem daqui pelo nome do
        bairro. Bairro não cadastrado → a reserva vai para confirmação manual.{" "}
        {bairros.bairros.length} bairros.
      </p>

      {erro && (
        <div
          className="mb-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          {erro}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label className="text-[10px] block" style={{ color: C.inkFaint }}>
            Bairro
          </label>
          <TextInput
            value={novo.nome}
            onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
            placeholder="Ex.: Cohama"
            className="w-48"
          />
        </div>
        <div>
          <label className="text-[10px] block" style={{ color: C.inkFaint }}>
            Valor (R$)
          </label>
          <TextInput
            type="number"
            value={novo.preco}
            onChange={(e) => setNovo({ ...novo, preco: e.target.value })}
            className="w-24"
          />
        </div>
        <button
          type="button"
          onClick={adicionar}
          disabled={!novo.nome.trim() || !novo.preco || bairros.salvando}
          className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md disabled:opacity-40"
          style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
        >
          <Plus size={13} /> Adicionar / atualizar
        </button>
      </div>

      <TextInput
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar bairro…"
        className="mb-2"
      />
      <div className="overflow-x-auto" style={{ maxHeight: 360, overflowY: "auto" }}>
        <table className="w-full text-sm">
          <tbody>
            {lista.map((b) => (
              <tr key={b.id} className="row-hover border-t" style={{ borderColor: C.borderSoft }}>
                <td className="px-2 py-1.5">{b.neighborhood}</td>
                <td className="px-2 py-1.5 w-28">
                  <TextInput
                    type="number"
                    defaultValue={String(b.price)}
                    value={precoEdit[b.id] ?? undefined}
                    onChange={(e) => setPrecoEdit({ ...precoEdit, [b.id]: e.target.value })}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v && Number(v) !== Number(b.price)) salvar(b.neighborhood, v);
                      setPrecoEdit((p) =>
                        Object.fromEntries(Object.entries(p).filter(([k]) => k !== b.id)),
                      );
                    }}
                    className="w-20 text-xs py-1"
                  />
                </td>
                <td className="px-2 py-1.5 w-8">
                  <button
                    type="button"
                    onClick={() => remover(b)}
                    aria-label={`remover ${b.neighborhood}`}
                  >
                    <X size={13} style={{ color: C.inkFaint }} />
                  </button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td className="px-2 py-4 text-xs" style={{ color: C.inkFaint }}>
                  {bairros.loading ? "carregando…" : "Nenhum bairro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Equipe / logins (database/25-usuarios-equipe.sql + Edge Function
// `create-user`). Só admin enxerga de verdade (RLS). Criar um LOGIN novo
// precisa do Auth (service_role) → vai pela Edge Function; editar papel /
// nome / telefone / ativo é direto na tabela ou via RPC com guarda.
const PAPEIS_EQUIPE = [
  { v: "admin", label: "Admin (sócio)" },
  { v: "atendente", label: "Atendente" },
  { v: "motorista", label: "Motorista" },
  { v: "financeiro", label: "Financeiro" },
];
const papelLabel = (v) => PAPEIS_EQUIPE.find((p) => p.v === v)?.label || v;

function senhaTemporaria() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i += 1) s += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return s;
}

function SistemaEquipe() {
  const { profile } = useAuth();
  const equipe = useUsersList();
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [editId, setEditId] = useState(null);
  const [ev, setEv] = useState({});
  const [novo, setNovo] = useState({ email: "", name: "", role: "atendente", password: "" });
  const [resetId, setResetId] = useState(null);
  const [resetSenha, setResetSenha] = useState("");

  const run = async (fn, msgFalha) => {
    setErro("");
    setOk("");
    try {
      await fn();
      return true;
    } catch (e) {
      setErro(mensagemAmigavel(e, msgFalha || "Não foi possível concluir."));
      return false;
    }
  };

  const criar = () =>
    run(async () => {
      const email = novo.email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Informe um e-mail válido.");
      if (!novo.name.trim()) throw new Error("Informe o nome.");
      if (novo.password.length < 8) throw new Error("A senha temporária precisa de 8+ caracteres.");
      await equipe.createUser({
        email,
        name: novo.name.trim(),
        role: novo.role,
        password: novo.password,
      });
      setOk(
        `Login criado para ${email}. Senha temporária: ${novo.password} — passe para a pessoa; ela troca depois.`,
      );
      setNovo({ email: "", name: "", role: "atendente", password: "" });
    }, "Não foi possível criar o login.");

  const salvar = () =>
    run(async () => {
      await equipe.updateUser(editId, {
        name: (ev.name ?? "").trim() || "—",
        phone: (ev.phone ?? "").trim() || null,
        role: ev.role,
      });
      setEditId(null);
    }, "Não foi possível salvar.");

  const salvarNovaSenha = (u) =>
    run(async () => {
      if (resetSenha.length < 8) throw new Error("A senha precisa de 8+ caracteres.");
      await equipe.resetPassword(u.id, resetSenha);
      setOk(`Senha de ${u.name} redefinida. Nova senha: ${resetSenha} — passe para a pessoa.`);
      setResetId(null);
      setResetSenha("");
    }, "Não foi possível redefinir a senha.");

  const linha = (u) => {
    const euMesmo = u.id === profile?.id;
    if (resetId === u.id) {
      return (
        <tr key={u.id} style={{ background: C.panel2 }}>
          <td className="px-2 py-1.5 text-xs" colSpan={4}>
            Nova senha de <b>{u.name}</b>:
            <div className="flex items-center gap-1 mt-1">
              <TextInput
                value={resetSenha}
                onChange={(e) => setResetSenha(e.target.value)}
                placeholder="senha temporária"
                className="w-40 text-xs"
              />
              <button
                type="button"
                onClick={() => setResetSenha(senhaTemporaria())}
                className="btn-press text-xs px-2 py-2 rounded-md shrink-0"
                style={{ background: C.panel, color: C.ink, border: `1px solid ${C.border}` }}
              >
                gerar
              </button>
            </div>
          </td>
          <td className="px-2 py-1.5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => salvarNovaSenha(u)}
                disabled={equipe.salvando}
                aria-label="salvar nova senha"
              >
                <Save size={13} style={{ color: C.green }} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetId(null);
                  setResetSenha("");
                }}
                aria-label="cancelar"
              >
                <X size={13} style={{ color: C.inkFaint }} />
              </button>
            </div>
          </td>
        </tr>
      );
    }
    if (editId === u.id) {
      return (
        <tr key={u.id} style={{ background: C.panel2 }}>
          <td className="px-2 py-1.5">
            <TextInput
              value={ev.name}
              onChange={(e) => setEv({ ...ev, name: e.target.value })}
              className="text-xs"
            />
          </td>
          <td className="px-2 py-1.5">
            <TextInput
              value={ev.phone}
              onChange={(e) => setEv({ ...ev, phone: e.target.value })}
              placeholder="(98) 9…"
              className="text-xs"
            />
          </td>
          <td className="px-2 py-1.5">
            <Select
              value={ev.role}
              onChange={(e) => setEv({ ...ev, role: e.target.value })}
              className="text-xs"
              disabled={euMesmo}
            >
              {PAPEIS_EQUIPE.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.label}
                </option>
              ))}
            </Select>
          </td>
          <td className="px-2 py-1.5 text-center text-xs" style={{ color: C.inkFaint }}>
            {u.active ? "ativo" : "inativo"}
          </td>
          <td className="px-2 py-1.5">
            <div className="flex gap-2">
              <button type="button" onClick={salvar} aria-label="salvar">
                <Save size={13} style={{ color: C.green }} />
              </button>
              <button type="button" onClick={() => setEditId(null)} aria-label="cancelar">
                <X size={13} style={{ color: C.inkFaint }} />
              </button>
            </div>
          </td>
        </tr>
      );
    }
    return (
      <tr key={u.id} className="row-hover border-t" style={{ borderColor: C.borderSoft }}>
        <td className="px-2 py-1.5">
          {u.name}
          {euMesmo && (
            <span className="ml-1 text-[10px]" style={{ color: C.inkFaint }}>
              (você)
            </span>
          )}
        </td>
        <td className="px-2 py-1.5 text-xs" style={{ color: C.inkSoft }}>
          {u.phone || "—"}
        </td>
        <td className="px-2 py-1.5 text-xs">{papelLabel(u.role)}</td>
        <td className="px-2 py-1.5 text-center">
          <button
            type="button"
            onClick={() =>
              run(() => equipe.setActive(u.id, !u.active), "Não foi possível alterar.")
            }
            disabled={euMesmo || equipe.salvando}
            className="text-xs px-2 py-0.5 rounded-full disabled:opacity-40"
            style={{
              background: u.active ? C.greenSoft : C.panel2,
              color: u.active ? C.green : C.inkFaint,
            }}
          >
            {u.active ? "ativo" : "inativo"}
          </button>
        </td>
        <td className="px-2 py-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={`editar ${u.name}`}
              onClick={() => {
                setEditId(u.id);
                setEv({ name: u.name, phone: u.phone || "", role: u.role });
              }}
            >
              <Pencil size={12} style={{ color: C.inkFaint }} />
            </button>
            <button
              type="button"
              aria-label={`redefinir senha de ${u.name}`}
              onClick={() => {
                setResetId(u.id);
                setResetSenha("");
              }}
            >
              <KeyRound size={12} style={{ color: C.inkFaint }} />
            </button>
            <button
              type="button"
              aria-label={`remover ${u.name}`}
              disabled={euMesmo || equipe.salvando}
              onClick={() => {
                if (window.confirm(`Remover ${u.name} da equipe? O login deixa de funcionar.`)) {
                  run(() => equipe.removeUser(u.id), "Não foi possível remover.");
                }
              }}
              className="disabled:opacity-40"
            >
              <UserX size={13} style={{ color: C.red }} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Users size={16} style={{ color: C.amber }} /> Equipe e logins
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Quem entra no sistema e com qual papel. Desativar bloqueia o acesso sem apagar o histórico.
        O banco não deixa você remover/desativar a si mesmo nem o último admin ativo.
      </p>
      {erro && (
        <div
          className="mb-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          {erro}
        </div>
      )}
      {ok && (
        <div
          className="mb-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.greenSoft, color: C.green }}
        >
          {ok}
        </div>
      )}

      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: C.inkFaint }}>
              <th className="px-2 py-1 font-medium">Nome</th>
              <th className="px-2 py-1 font-medium">Telefone</th>
              <th className="px-2 py-1 font-medium">Papel</th>
              <th className="px-2 py-1 font-medium text-center">Acesso</th>
              <th className="px-2 py-1 font-medium" aria-label="ações" />
            </tr>
          </thead>
          <tbody>{equipe.users.map(linha)}</tbody>
        </table>
        {equipe.users.length === 0 && !equipe.loading && (
          <div className="text-xs px-2 py-3" style={{ color: C.inkFaint }}>
            Nenhum usuário — ou você não é admin.
          </div>
        )}
      </div>

      <div className="pt-3 border-t" style={{ borderColor: C.borderSoft }}>
        <div
          className="text-xs font-semibold mb-2 flex items-center gap-1.5"
          style={{ color: C.inkSoft }}
        >
          <UserCog size={13} /> Criar um login novo
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <TextInput
            type="email"
            value={novo.email}
            onChange={(e) => setNovo({ ...novo, email: e.target.value })}
            placeholder="e-mail"
            className="w-52"
          />
          <TextInput
            value={novo.name}
            onChange={(e) => setNovo({ ...novo, name: e.target.value })}
            placeholder="nome"
            className="w-40"
          />
          <Select
            value={novo.role}
            onChange={(e) => setNovo({ ...novo, role: e.target.value })}
            className="w-36"
          >
            {PAPEIS_EQUIPE.map((p) => (
              <option key={p.v} value={p.v}>
                {p.label}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-1">
            <TextInput
              value={novo.password}
              onChange={(e) => setNovo({ ...novo, password: e.target.value })}
              placeholder="senha temporária"
              className="w-40"
            />
            <button
              type="button"
              onClick={() => setNovo({ ...novo, password: senhaTemporaria() })}
              className="btn-press text-xs px-2 py-2 rounded-md shrink-0"
              style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
            >
              gerar
            </button>
          </div>
          <button
            type="button"
            onClick={criar}
            disabled={equipe.salvando}
            className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-md disabled:opacity-40"
            style={{ background: C.amber, color: C.onBrand, fontWeight: 600 }}
          >
            <Plus size={13} /> Criar login
          </button>
        </div>
        <p className="text-[11px] mt-2" style={{ color: C.inkFaint }}>
          A pessoa entra com esse e-mail e a senha temporária (já confirmado, sem e-mail de
          ativação) e troca a senha depois no primeiro acesso.
        </p>
      </div>
    </Card>
  );
}

// Preferência de movimento (por dispositivo). "Automático" respeita o
// ajuste de "reduzir animações" do sistema; "Ligado" força os heros a
// animar mesmo assim. Ver src/lib/motion.js.
// Erros recentes do app (database/36) — o admin vê o que os usuários
// viram, com detalhe técnico. Alimentado por logTecnico() em lib/erros.js.
function SistemaErros() {
  const { erros, loading, error, recarregar, resolver, resolvendo } = useErrorLog();
  return (
    <Card className="anim-fadeUp">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle size={16} style={{ color: C.amber }} /> Erros recentes do app
        </div>
        <button
          type="button"
          onClick={recarregar}
          className="btn-press text-[11px] px-2 py-1 rounded-md"
          style={{ background: C.panel2, color: C.inkSoft }}
        >
          <RefreshCw size={12} className="inline mr-1" />
          Atualizar
        </button>
      </div>
      {error && (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          {mensagemAmigavel(error, "Não foi possível carregar o log.")}
        </div>
      )}
      {!error && loading && erros.length === 0 && (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          carregando…
        </div>
      )}
      {!error && !loading && erros.length === 0 && (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          Nenhum erro registrado nos últimos 30 dias. 🎉
        </div>
      )}
      {erros.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left" style={{ color: C.inkFaint }}>
                <th className="py-1 pr-3 font-medium">Quando</th>
                <th className="py-1 pr-3 font-medium">Código</th>
                <th className="py-1 font-medium">Mensagem</th>
                <th className="py-1 pr-1 font-medium" aria-label="ações" />
              </tr>
            </thead>
            <tbody>
              {erros.map((e) => (
                <tr key={e.id} className="border-t" style={{ borderColor: C.borderSoft }}>
                  <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: C.inkSoft }}>
                    {fmtDataHora(e.at)}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap" style={{ color: C.inkFaint }}>
                    {e.code || "—"}
                  </td>
                  <td
                    className="py-1.5"
                    style={{ color: C.ink, overflowWrap: "anywhere" }}
                    title={e.context ? JSON.stringify(e.context) : ""}
                  >
                    {e.message}
                  </td>
                  <td className="py-1.5 pl-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => resolver(e.id)}
                      disabled={resolvendo}
                      aria-label={`Resolver: ${e.message}`}
                      className="btn-press flex items-center gap-1 text-[11px] px-2 py-1 rounded-md disabled:opacity-40"
                      style={{ background: C.greenSoft, color: C.green }}
                    >
                      <Check size={11} /> Resolver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function MovimentoControl() {
  const [pref, setPref] = useState(getMotionPref());
  useEffect(() => watchSystemMotion(), []);
  const efetivo = resolveMotion(pref);
  const mudar = (v) => {
    setPref(v);
    setMotionPref(v);
  };
  const OPCOES = [
    { v: "auto", label: "Automático", desc: "segue o sistema" },
    { v: "on", label: "Ligado", desc: "sempre anima" },
    { v: "off", label: "Desligado", desc: "sem movimento" },
  ];
  return (
    <Card>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Sparkles size={16} style={{ color: C.amber }} /> Movimento e animações
      </div>
      <p className="text-xs mb-1" style={{ color: C.inkSoft }}>
        Heros, estrada e ônibus animados. No <b>Automático</b> o app respeita o ajuste de{" "}
        <i>reduzir animações</i> do seu computador — se estiver ligado lá, as decorações ficam
        paradas. Escolha <b>Ligado</b> para animar mesmo assim.
      </p>
      {pref === "auto" && efetivo === "off" && (
        <p className="text-xs mb-2" style={{ color: C.warn }}>
          Seu sistema está pedindo menos movimento agora — por isso está tudo parado. Coloque em{" "}
          <b>Ligado</b> para reativar só neste dispositivo.
        </p>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        {OPCOES.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => mudar(o.v)}
            className="btn-press text-xs px-3 py-2 rounded-lg font-medium"
            style={{
              background: pref === o.v ? C.brand : C.panel2,
              color: pref === o.v ? C.onBrand : C.ink,
              border: `1px solid ${pref === o.v ? C.brand : C.border}`,
            }}
          >
            {o.label} <span style={{ opacity: 0.65 }}>· {o.desc}</span>
          </button>
        ))}
      </div>
      <div className="text-[11px] mt-2" style={{ color: C.inkFaint }}>
        Vale só neste dispositivo · agora: <b>{efetivo === "on" ? "animando" : "parado"}</b>
      </div>
    </Card>
  );
}

export default function SistemaTab({
  reservas,
  capacidade,
  cfg,
  modoAtendimento,
  onSetModo,
  onNavigate,
}) {
  const [diag, setDiag] = useState(null);
  const [rodando, setRodando] = useState(false);
  const [novoPontoNome, setNovoPontoNome] = useState("");
  const [erro, setErro] = useState("");
  const catchErr = (p, msg) => p?.catch?.((e) => setErro(mensagemAmigavel(e, msg)));
  // Diagnóstico só-leitura: o banco já impede overbooking (trigger de
  // capacidade) e quantidade inválida (check). Aqui só listamos.
  const rodarDiagnostico = () => {
    setRodando(true);
    setTimeout(() => {
      const { issues, fixed } = runDiagnostics(reservas, capacidade, cfg.trips);
      setDiag({ issues, fixed, quando: new Date().toLocaleString("pt-BR") });
      setRodando(false);
    }, 400);
  };
  // Diagnóstico no servidor (issue #9) — mesmas checagens do
  // domain/diagnostics.js, mas no banco: roda de 6/6h por pg_cron e também
  // sob demanda aqui. Só reporta/alerta (a sincronia de quantity já é
  // garantida pela trigger trg_sync_quantity).
  const serverDiag = useDiagnostics();
  const [diagServidor, setDiagServidor] = useState(null);
  const rodarDiagnosticoServidor = async () => {
    setErro("");
    try {
      const resumo = await serverDiag.rodar();
      setDiagServidor({ ...resumo, quando: new Date().toLocaleString("pt-BR") });
      emit(EVENTS.DIAGNOSTICO_EXECUTADO, {
        origem: "sistema_tab",
        novos_alertas: resumo.novos_alertas,
        por_tipo: resumo.por_tipo,
      });
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível rodar o diagnóstico no servidor."));
    }
  };
  // Backup completo — gerado pelo servidor (database/17-backup-completo.sql),
  // nunca a partir do que já está carregado na tela. Um cron diário também
  // gera sozinho; aqui só disparamos sob demanda e oferecemos os formatos.
  const backup = useBackup();
  const [ultimoBackup, setUltimoBackup] = useState(null);
  const [formatoEmProcesso, setFormatoEmProcesso] = useState(null);
  const gerarBackupAgora = async () => {
    setErro("");
    try {
      setUltimoBackup(await backup.gerarAgora());
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível gerar o backup."));
    }
  };
  const abrirBackupDoHistorico = async (id) => {
    setErro("");
    try {
      setUltimoBackup(await backup.buscarPayload(id));
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível abrir esse backup."));
    }
  };
  const exportarBackup = async (formato) => {
    if (!ultimoBackup) return;
    setErro("");
    setFormatoEmProcesso(formato);
    try {
      if (formato === "json") baixarJSON(ultimoBackup);
      else if (formato === "excel") await baixarExcel(ultimoBackup);
      else if (formato === "csv") await baixarCSVZip(ultimoBackup);
      else if (formato === "pdf") abrirRelatorioPDF(ultimoBackup);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível exportar o backup."));
    } finally {
      setFormatoEmProcesso(null);
    }
  };
  const trocarModo = (v) => {
    setErro("");
    onSetModo(v).catch((e) =>
      setErro(mensagemAmigavel(e, "Não foi possível trocar o modo (só admin).")),
    );
  };
  const atualizarPonto = (p, campo, valor) => {
    setErro("");
    catchErr(
      cfg.atualizarPonto(p._dbId, campo, valor),
      "Não foi possível salvar o ponto (só admin).",
    );
  };
  const addPontoOutro = (direcao) => {
    if (!novoPontoNome.trim()) return;
    setErro("");
    catchErr(cfg.addPonto(direcao, novoPontoNome.trim()), "Não foi possível adicionar o ponto.");
    setNovoPontoNome("");
  };
  const removerPonto = (p) => {
    setErro("");
    catchErr(cfg.removerPonto(p._dbId), "Não foi possível remover o ponto.");
  };
  const setSegunda = (patch) => {
    setErro("");
    catchErr(
      cfg.setSegunda({ active: cfg.segundaAtiva, hours: cfg.segundaHoras, ...patch }),
      "Não foi possível salvar o ajuste (só admin).",
    );
  };

  return (
    <div>
      <div className="px-4 md:px-10 pt-5 md:pt-6 pb-4">
        <div
          className="aritur-hero relative overflow-hidden rounded-2xl border p-4 md:p-5 flex items-center justify-between gap-3"
          style={{ borderColor: C.brandDim }}
        >
          <HeroFX />
          <div className="relative flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(0,0,0,.35)" }}
            >
              <ShieldCheck size={19} style={{ color: "#fff" }} />
            </span>
            <div>
              <h1
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.3rem",
                  color: "#fff",
                }}
              >
                Sistema
              </h1>
              <p className="text-xs" style={{ color: "rgba(255,255,255,.78)" }}>
                Fluxo, valores, atendimento, backup e correções automáticas.
              </p>
            </div>
          </div>
          {cfg.saving && (
            <span className="relative text-xs" style={{ color: "rgba(255,255,255,.8)" }}>
              salvando…
            </span>
          )}
        </div>
      </div>
      <div className="px-6 md:px-10 pb-10 space-y-5">
        {erro && (
          <div
            className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} /> {erro}
            </span>
            <button onClick={() => setErro("")}>
              <X size={13} />
            </button>
          </div>
        )}
        <MovimentoControl />

        <SistemaErros />

        <SistemaEquipe />

        <SistemaCidades />

        <Card className="anim-fadeUp">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Settings2 size={16} style={{ color: C.amber }} /> Fluxo de agendamento e valores
          </div>
          <div className="flex items-center gap-3 mb-4 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={cfg.segundaAtiva}
                onChange={(e) => setSegunda({ active: e.target.checked })}
              />{" "}
              Ajuste automático de segunda-feira
            </label>
            {cfg.segundaAtiva && (
              <span className="flex items-center gap-1.5">
                antecipar{" "}
                <TextInput
                  type="number"
                  min={1}
                  max={4}
                  defaultValue={cfg.segundaHoras}
                  onBlur={(e) => setSegunda({ hours: Number.parseInt(e.target.value, 10) || 1 })}
                  style={{ width: 56 }}
                  className="py-1"
                />{" "}
                hora(s)
              </span>
            )}
          </div>
          {["ida", "volta"].map((dir) => (
            <div key={dir} className="mb-4">
              <div className="text-xs font-semibold mb-2" style={{ color: C.inkSoft }}>
                {cfg.trips[dir].nome}
              </div>
              <div className="space-y-2">
                {cfg.trips[dir].pontos.map((p) => (
                  <div
                    key={p.id}
                    className="grid grid-cols-[1fr_90px_90px_auto] gap-2 items-center rounded-lg px-2 py-2"
                    style={{ background: C.panel2 }}
                  >
                    <TextInput
                      defaultValue={p.nome}
                      onBlur={(e) =>
                        e.target.value !== p.nome && atualizarPonto(p, "nome", e.target.value)
                      }
                      className="py-1 text-xs"
                    />
                    <TextInput
                      type="time"
                      defaultValue={p.horaBase}
                      onBlur={(e) =>
                        e.target.value !== p.horaBase &&
                        atualizarPonto(p, "horaBase", e.target.value)
                      }
                      className="py-1 text-xs"
                    />
                    {p.campo === "bairro" ? (
                      <span className="text-[10px] text-center" style={{ color: C.inkFaint }}>
                        por bairro
                      </span>
                    ) : (
                      <TextInput
                        type="number"
                        defaultValue={p.valor}
                        onBlur={(e) =>
                          Number(e.target.value) !== p.valor &&
                          atualizarPonto(p, "valor", e.target.value)
                        }
                        className="py-1 text-xs"
                      />
                    )}
                    {p.core ? (
                      <span className="text-[10px] text-center" style={{ color: C.inkFaint }}>
                        fixo
                      </span>
                    ) : (
                      <button onClick={() => removerPonto(p)}>
                        <Trash2 size={13} style={{ color: C.red }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <TextInput
                  placeholder={`Novo ponto de ${cfg.trips[dir].nome.toLowerCase()}…`}
                  value={novoPontoNome}
                  onChange={(e) => setNovoPontoNome(e.target.value)}
                  className="text-xs py-1.5"
                />
                <button
                  onClick={() => addPontoOutro(dir)}
                  className="btn-press text-xs px-3 py-1.5 rounded-lg shrink-0"
                  style={{ background: C.amber, color: C.onBrand }}
                >
                  Adicionar
                </button>
              </div>
            </div>
          ))}
          <div className="text-xs mt-1" style={{ color: C.inkFaint }}>
            Editar um ponto: altere e clique fora do campo. "Buscar em Casa" usa a tabela de bairros
            abaixo; os demais usam o valor fixo aqui. Vale para todos os sócios.
          </div>
        </Card>

        <SistemaBairros />

        <SistemaBaldes />

        <Card>
          <div className="text-sm font-semibold mb-3">Quem está atendendo agora</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              {
                v: "ia",
                icon: Bot,
                label: "IA automática",
                desc: "O bot conduz o roteiro completo e confirma sozinho.",
              },
              {
                v: "manual",
                icon: UserCog,
                label: "Manual (você/equipe)",
                desc: "A IA para de confirmar sozinha; a equipe assume as conversas.",
              },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => trocarModo(o.v)}
                className="btn-press border rounded-lg px-4 py-3 text-left"
                style={{
                  borderColor: modoAtendimento === o.v ? C.amber : C.border,
                  background: modoAtendimento === o.v ? C.amberSoft : C.panel2,
                }}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <o.icon
                    size={15}
                    style={{ color: modoAtendimento === o.v ? C.amber : C.inkSoft }}
                  />
                  {o.label}
                </div>
                <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
                  {o.desc}
                </div>
              </button>
            ))}
          </div>
          <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
            Vale para todos os sócios em tempo real.
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck size={16} style={{ color: C.green }} /> Diagnóstico e correção automática
            </div>
            <button
              onClick={rodarDiagnostico}
              disabled={rodando}
              className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: C.amber, color: C.onBrand }}
            >
              <RefreshCw size={12} className={rodando ? "animate-spin" : ""} />{" "}
              {rodando ? "Verificando…" : "Rodar diagnóstico agora"}
            </button>
          </div>
          <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
            Checagem só-leitura. O banco já impede overbooking (trava de capacidade) e quantidade
            inválida — isto aqui é uma segunda conferência manual.
          </p>
          {diag && (
            <div className="anim-slideDown space-y-2">
              <div className="text-xs" style={{ color: C.inkFaint }}>
                Última verificação: {diag.quando}
              </div>
              {diag.fixed.length === 0 && diag.issues.length === 0 && (
                <div className="text-xs flex items-center gap-1.5" style={{ color: C.green }}>
                  <Check size={13} /> Nenhum problema encontrado.
                </div>
              )}
              {diag.issues.map((f, i) => (
                <div
                  key={i}
                  className="text-xs rounded-md px-2 py-1.5 flex items-center gap-1.5"
                  style={{ background: C.redSoft, color: C.red }}
                >
                  <AlertTriangle size={12} /> {f}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t" style={{ borderColor: C.borderSoft }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold" style={{ color: C.inkSoft }}>
                Job no servidor
              </div>
              <button
                type="button"
                onClick={rodarDiagnosticoServidor}
                disabled={serverDiag.rodando}
                className="btn-press flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
              >
                <RefreshCw size={12} className={serverDiag.rodando ? "animate-spin" : ""} />{" "}
                {serverDiag.rodando ? "Rodando…" : "Rodar no servidor agora"}
              </button>
            </div>
            <p className="text-xs mb-2" style={{ color: C.inkFaint }}>
              Roda sozinho de 6 em 6h. Overbooking, ponto removido, telefone ausente, reserva sem
              viagem e pagamento em aberto viram alerta interno (sem duplicar nas 24h).
            </p>
            {diagServidor && (
              <div className="anim-slideDown text-xs mb-2" style={{ color: C.inkSoft }}>
                Última execução: {diagServidor.quando} — {diagServidor.novos_alertas} novo(s)
                alerta(s).
              </div>
            )}
            <div className="space-y-1.5">
              {serverDiag.achados.length === 0 && !serverDiag.loading && (
                <div className="text-xs flex items-center gap-1.5" style={{ color: C.green }}>
                  <Check size={13} /> Servidor não encontrou pendências.
                </div>
              )}
              {serverDiag.achados.map((a, i) => (
                <div
                  key={`${a.kind}-${a.reservation_id ?? a.trip_id ?? i}`}
                  className="text-xs rounded-md px-2 py-1.5 flex items-center justify-between gap-1.5"
                  style={{ background: C.warnSoft, color: C.warn }}
                >
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle size={12} /> {DIAG_KIND_LABEL[a.kind] || a.kind}
                  </span>
                  {a.trip_date && onNavigate && (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate({ tab: "agenda", deepLink: { kind: "data", data: a.trip_date } })
                      }
                      className="btn-press shrink-0 text-[11px] px-2 py-1 rounded-md font-medium"
                      style={{
                        background: C.panel,
                        color: C.warn,
                        border: `1px solid ${C.warn}55`,
                      }}
                    >
                      Ver reserva
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Download size={15} style={{ color: C.blue }} /> Backup completo
          </div>
          <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
            Gerado pelo servidor com <b>todas</b> as tabelas — clientes, reservas, viagens,
            veículos, motoristas, combustível, manutenções, financeiro, configurações, usuários e
            logs — nunca só o que está carregado na tela. Um backup automático roda sozinho todo dia
            às 3h (São Luís) e fica guardado por 30 dias.
          </p>
          <button
            type="button"
            onClick={gerarBackupAgora}
            disabled={backup.gerando}
            className="btn-press flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg"
            style={{
              background: backup.gerando ? C.border : C.panel2,
              color: C.ink,
              border: `1px solid ${C.border}`,
            }}
          >
            <Download size={14} /> {backup.gerando ? "Gerando…" : "Gerar backup completo agora"}
          </button>

          {ultimoBackup && (
            <div className="mt-3 anim-slideDown">
              <div className="text-xs mb-1.5" style={{ color: C.inkFaint }}>
                Pronto — gerado em {fmtDataHora(ultimoBackup.gerado_em)}. Baixar como:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "json", label: "JSON" },
                  { id: "excel", label: "Excel (.xlsx)" },
                  { id: "csv", label: "CSV (.zip)" },
                  { id: "pdf", label: "PDF (relatório)" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => exportarBackup(f.id)}
                    disabled={formatoEmProcesso === f.id}
                    className="btn-press text-xs px-2.5 py-1.5 rounded-md"
                    style={{
                      background: C.amberSoft,
                      color: C.amber,
                      opacity: formatoEmProcesso === f.id ? 0.6 : 1,
                    }}
                  >
                    {formatoEmProcesso === f.id ? "…" : f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {backup.historico.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold mb-1.5" style={{ color: C.inkSoft }}>
                Histórico de backups
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {backup.historico.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-2 text-xs rounded-md px-2.5 py-1.5"
                    style={{ background: C.panel2 }}
                  >
                    <span style={{ color: C.inkSoft }}>
                      {fmtDataHora(h.created_at)} ·{" "}
                      {h.origem === "automatico" ? "automático" : "manual"} ·{" "}
                      {(h.tamanho_bytes / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => abrirBackupDoHistorico(h.id)}
                      className="btn-press shrink-0"
                      style={{ color: C.blue }}
                    >
                      Abrir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card style={{ borderColor: C.blueSoft }}>
          <div className="text-sm font-semibold mb-2">Acesso compartilhado entre sócios</div>
          <p className="text-xs" style={{ color: C.inkSoft }}>
            Todos que entram com sua conta enxergam os mesmos dados, atualizados em tempo real
            (Supabase Realtime). É o mesmo banco onde o bot do WhatsApp vai escrever e ler as
            reservas.
          </p>
        </Card>
      </div>
    </div>
  );
}
