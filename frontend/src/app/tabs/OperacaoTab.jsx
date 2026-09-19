import {
  AlertTriangle,
  Bus,
  CheckCircle2,
  Fuel,
  Pencil,
  Plus,
  Route,
  Save,
  TrendingUp,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useFuelRecords, useMaintenance } from "../../hooks/useOperation.js";
import { useDrivers, useVehicles } from "../../hooks/useVehicles.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import {
  C,
  Card,
  Header,
  HeroFX,
  Pill,
  Select,
  StatCard,
  SubTabs,
  TextInput,
  fmtBRL,
  fmtDate,
  mapFuel,
  mapManut,
  todayStr,
} from "../tabShared.jsx";

/* ============================= 6. OPERAÇÃO (combustível + manutenção preventiva) ============================= */

export default function OperacaoTab() {
  const { vehicles, defaultVehicle, setDefault, updateVehicle } = useVehicles();
  const { drivers, addDriver, updateDriver, removeDriver } = useDrivers();
  const veiculoId = defaultVehicle?.id ?? null;
  const fuel = useFuelRecords(veiculoId);
  const manut = useMaintenance(veiculoId);

  const [reg, setReg] = useState({
    data: todayStr(),
    direcao: "ida",
    km: "",
    combustivel: "",
    litros: "",
  });
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState({});
  const [periodo, setPeriodo] = useState("dia");
  const [editandoVeiculo, setEditandoVeiculo] = useState(null);
  const [veiculoForm, setVeiculoForm] = useState({});
  const [editandoMotorista, setEditandoMotorista] = useState(null);
  const [motoristaForm, setMotoristaForm] = useState({});
  const [novaManut, setNovaManut] = useState({
    tipo: "",
    intervaloKm: 5000,
    kmAtual: "",
    custo: "",
    data: todayStr(),
  });
  const [erro, setErro] = useState("");

  const registros = useMemo(() => (fuel.records || []).map(mapFuel), [fuel.records]);
  const manutencoes = useMemo(() => (manut.records || []).map(mapManut), [manut.records]);
  const motoristas = useMemo(
    () => (drivers || []).map((d) => ({ id: d.id, nome: d.name, telefone: d.phone || "" })),
    [drivers],
  );
  const run = async (fn, msg) => {
    setErro("");
    try {
      await fn();
    } catch (e) {
      setErro(mensagemAmigavel(e, msg));
    }
  };

  const salvarVeiculo = (id, campos) =>
    run(
      () => updateVehicle(id, campos).then(() => setEditandoVeiculo(null)),
      "Não foi possível salvar o veículo.",
    );
  const addRegistro = () => {
    if (!reg.km || !veiculoId) return;
    run(async () => {
      await fuel.addRecord({
        vehicleId: veiculoId,
        recordDate: reg.data,
        direction: reg.direcao,
        km: Number.parseFloat(reg.km),
        liters: Number.parseFloat(reg.litros || 0),
        cost: Number.parseFloat(reg.combustivel || 0),
      });
      setReg({ ...reg, km: "", combustivel: "", litros: "" });
    }, "Não foi possível registrar.");
  };
  const removerRegistro = (id) =>
    run(() => fuel.removeRecord(id), "Não foi possível remover o abastecimento.");
  const iniciarEdicaoReg = (r) => {
    setEditId(r.id);
    setEditVal({ ...r });
  };
  const salvarEdicaoReg = () =>
    run(async () => {
      await fuel.updateRecord(editId, {
        record_date: editVal.data,
        direction: editVal.direcao,
        km: Number.parseFloat(editVal.km),
        liters: Number.parseFloat(editVal.litros || 0),
        cost: Number.parseFloat(editVal.combustivel || 0),
      });
      setEditId(null);
    }, "Não foi possível salvar.");
  const salvarMotorista = (id, dados) =>
    run(
      () =>
        updateDriver(id, { name: dados.nome, phone: dados.telefone || null }).then(() =>
          setEditandoMotorista(null),
        ),
      "Não foi possível salvar o motorista.",
    );
  const removerMotorista = (id) =>
    run(() => removeDriver(id), "Não foi possível remover o motorista.");
  const addMotorista = () =>
    run(() => addDriver({ name: "Novo motorista", phone: null }), "Não foi possível adicionar.");
  const addManutencao = () => {
    if (!novaManut.tipo || !veiculoId) return;
    run(async () => {
      await manut.addRecord({
        vehicleId: veiculoId,
        type: novaManut.tipo,
        performedAt: novaManut.data,
        odometerKm: Number.parseFloat(novaManut.kmAtual) || 0,
        intervalKm: Number.parseFloat(novaManut.intervaloKm) || 5000,
        cost: Number.parseFloat(novaManut.custo) || 0,
      });
      setNovaManut({ tipo: "", intervaloKm: 5000, kmAtual: "", custo: "", data: todayStr() });
    }, "Não foi possível registrar a manutenção.");
  };
  const removerManutencao = (id) =>
    run(() => manut.removeRecord(id), "Não foi possível remover a manutenção.");

  const hoje = todayStr();
  const dentroDoPeriodo = (ds) => {
    if (!ds) return false;
    if (periodo === "dia") return ds === hoje;
    if (periodo === "mes") return ds.slice(0, 7) === hoje.slice(0, 7);
    return ds.slice(0, 4) === hoje.slice(0, 4);
  };
  const registrosFiltrados = registros.filter((r) => dentroDoPeriodo(r.data));
  const totalKm = registrosFiltrados.reduce((s, r) => s + r.km, 0);
  const totalCombustivel = registrosFiltrados.reduce((s, r) => s + r.combustivel, 0);
  const totalManutencao = manutencoes
    .filter((m) => dentroDoPeriodo(m.data))
    .reduce((s, m) => s + m.custo, 0);
  const totalLitros = registrosFiltrados.reduce((s, r) => s + r.litros, 0);
  const consumoMedio = totalLitros > 0 ? (totalKm / totalLitros).toFixed(1) : null;
  const custoPorKm = totalKm > 0 ? totalCombustivel / totalKm : 0;
  const mediaHistorica = (antesId) => {
    const anteriores = registros.filter((r) => r.id !== antesId && r.km > 0);
    if (anteriores.length === 0) return null;
    return anteriores.reduce((s, r) => s + r.combustivel / r.km, 0) / anteriores.length;
  };
  const kmAcumuladoDesde = (data) =>
    registros.filter((r) => r.data >= data).reduce((s, r) => s + r.km, 0);

  return (
    <div>
      <Header
        title="Operação"
        subtitle="Veículo, motorista, combustível (consumo/alerta) e manutenção preventiva."
        right={
          fuel.loading || manut.loading ? (
            <span className="text-xs" style={{ color: C.inkFaint }}>
              carregando…
            </span>
          ) : null
        }
      />
      <div className="px-6 md:px-10 pb-10 space-y-5">
        {(erro || fuel.error || manut.error) && (
          <div
            className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} />{" "}
              {erro ||
                "Erro ao carregar dados de operação (só admin/financeiro têm acesso a combustível/manutenção)."}
            </span>
            {erro && (
              <button onClick={() => setErro("")}>
                <X size={13} />
              </button>
            )}
          </div>
        )}
        {defaultVehicle && (
          <div
            className="aritur-hero relative overflow-hidden rounded-2xl border p-4 md:p-5 flex flex-wrap items-center justify-between gap-4"
            style={{ borderColor: C.brandDim }}
          >
            <HeroFX />
            <div className="relative flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(0,0,0,.35)" }}
              >
                <Bus size={20} style={{ color: "#fff" }} />
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: "1.15rem",
                    color: "#fff",
                  }}
                >
                  {defaultVehicle.name}
                </div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,.75)" }}>
                  {defaultVehicle.plate} · {defaultVehicle.capacity} lugares · veículo padrão
                </div>
              </div>
            </div>
          </div>
        )}
        <Card className="anim-fadeUp">
          <div className="text-sm font-semibold mb-3">Veículo em operação</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {vehicles.map((v) => {
              const ativo = v.is_default;
              const editando = editandoVeiculo === v.id;
              return editando ? (
                <div
                  key={v.id}
                  className="border rounded-lg px-3 py-3 anim-pop"
                  style={{ borderColor: C.amber, background: C.panel2 }}
                >
                  <TextInput
                    value={veiculoForm.name ?? ""}
                    onChange={(e) => setVeiculoForm({ ...veiculoForm, name: e.target.value })}
                    className="mb-2"
                    placeholder="Nome"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <TextInput
                      value={veiculoForm.plate ?? ""}
                      onChange={(e) => setVeiculoForm({ ...veiculoForm, plate: e.target.value })}
                      placeholder="Placa"
                    />
                    <TextInput
                      type="number"
                      value={veiculoForm.capacity ?? ""}
                      onChange={(e) => setVeiculoForm({ ...veiculoForm, capacity: e.target.value })}
                      placeholder="Capacidade"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      salvarVeiculo(v.id, {
                        name: veiculoForm.name || v.name,
                        plate: veiculoForm.plate || v.plate,
                        capacity: Number.parseInt(veiculoForm.capacity, 10) || v.capacity,
                      })
                    }
                    className="btn-press mt-2 text-xs px-3 py-1.5 rounded-md"
                    style={{ background: C.amber, color: C.onBrand }}
                  >
                    Salvar
                  </button>
                </div>
              ) : (
                <div
                  key={v.id}
                  className="border rounded-lg px-4 py-3 relative"
                  style={{
                    borderColor: ativo ? C.amber : C.border,
                    background: ativo ? C.amberSoft : C.panel2,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setEditandoVeiculo(v.id);
                      setVeiculoForm({ name: v.name, plate: v.plate, capacity: v.capacity });
                    }}
                    className="btn-press absolute top-2 right-2"
                    title="Editar veículo"
                  >
                    <Pencil size={12} style={{ color: C.inkFaint }} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      run(() => setDefault(v.id), "Não foi possível trocar o veículo padrão.")
                    }
                    className="btn-press w-full text-left flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <Bus size={14} style={{ color: ativo ? C.amber : C.inkSoft }} /> {v.name}{" "}
                        {ativo && <Pill color={C.blue}>padrão</Pill>}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>
                        {v.plate} · {v.capacity} lugares
                      </div>
                    </div>
                    {ativo && <CheckCircle2 size={16} style={{ color: C.amber }} />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="text-xs mt-3" style={{ color: C.inkFaint }}>
            Trocar o veículo padrão só afeta viagens criadas a partir de agora — a capacidade das
            viagens já agendadas é um "retrato" e não muda.
          </div>
        </Card>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs" style={{ color: C.inkSoft }}>
            Ver totais por:
          </span>
          <SubTabs
            value={periodo}
            onChange={setPeriodo}
            options={[
              { id: "dia", label: "Hoje" },
              { id: "mes", label: "Este mês" },
              { id: "ano", label: "Este ano" },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard
            label={`Km (${periodo})`}
            value={totalKm.toLocaleString("pt-BR")}
            icon={Route}
          />
          <StatCard
            label="Combustível"
            value={fmtBRL(totalCombustivel)}
            icon={Fuel}
            accent={C.warn}
          />
          <StatCard
            label="Manutenção"
            value={fmtBRL(totalManutencao)}
            icon={Wrench}
            accent={C.red}
          />
          <StatCard
            label="Consumo médio"
            value={consumoMedio ? `${consumoMedio} km/L` : "—"}
            icon={TrendingUp}
            accent={C.blue}
          />
          <StatCard
            label="Custo por km"
            value={fmtBRL(custoPorKm)}
            icon={Wallet}
            accent={C.green}
          />
        </div>

        <Card>
          <div className="text-sm font-semibold mb-3">Motoristas</div>
          {motoristas.map((m) =>
            editandoMotorista === m.id ? (
              <div
                key={m.id}
                className="flex gap-2 items-center border-b py-2 anim-pop"
                style={{ borderColor: C.borderSoft }}
              >
                <TextInput
                  value={motoristaForm.nome ?? ""}
                  onChange={(e) => setMotoristaForm({ ...motoristaForm, nome: e.target.value })}
                  placeholder="Nome"
                />
                <TextInput
                  value={motoristaForm.telefone ?? ""}
                  onChange={(e) => setMotoristaForm({ ...motoristaForm, telefone: e.target.value })}
                  placeholder="Telefone"
                />
                <button
                  type="button"
                  onClick={() =>
                    salvarMotorista(m.id, {
                      nome: motoristaForm.nome || m.nome,
                      telefone: motoristaForm.telefone,
                    })
                  }
                  className="btn-press"
                >
                  <Save size={14} style={{ color: C.green }} />
                </button>
              </div>
            ) : (
              <div
                key={m.id}
                className="flex justify-between items-center text-sm border-b py-2"
                style={{ borderColor: C.borderSoft }}
              >
                <span>{m.nome}</span>
                <div className="flex items-center gap-2">
                  <span style={{ color: C.inkSoft }}>{m.telefone || "sem telefone"}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditandoMotorista(m.id);
                      setMotoristaForm({ nome: m.nome, telefone: m.telefone });
                    }}
                  >
                    <Pencil size={12} style={{ color: C.inkFaint }} />
                  </button>
                  <button type="button" onClick={() => removerMotorista(m.id)}>
                    <X size={13} style={{ color: C.red }} />
                  </button>
                </div>
              </div>
            ),
          )}
          <button
            type="button"
            onClick={addMotorista}
            className="btn-press mt-3 text-xs flex items-center gap-1"
            style={{ color: C.amber }}
          >
            <Plus size={12} /> Adicionar motorista
          </button>
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-3">Registrar abastecimento / viagem</div>
          <div className="text-xs mb-3" style={{ color: C.inkFaint }}>
            A despesa de combustível entra sozinha no Financeiro do dia.
          </div>
          <div className="grid sm:grid-cols-5 gap-2">
            <TextInput
              type="date"
              value={reg.data}
              onChange={(e) => setReg({ ...reg, data: e.target.value })}
            />
            <Select
              value={reg.direcao}
              onChange={(e) => setReg({ ...reg, direcao: e.target.value })}
            >
              <option value="ida">Ida</option>
              <option value="volta">Volta</option>
            </Select>
            <TextInput
              placeholder="Km rodados"
              type="number"
              value={reg.km}
              onChange={(e) => setReg({ ...reg, km: e.target.value })}
            />
            <TextInput
              placeholder="Litros"
              type="number"
              value={reg.litros}
              onChange={(e) => setReg({ ...reg, litros: e.target.value })}
            />
            <TextInput
              placeholder="Combustível R$"
              type="number"
              value={reg.combustivel}
              onChange={(e) => setReg({ ...reg, combustivel: e.target.value })}
            />
          </div>
          <button
            onClick={addRegistro}
            disabled={!reg.km || !veiculoId}
            className="btn-press mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              background: !reg.km || !veiculoId ? C.border : C.amber,
              color: !reg.km || !veiculoId ? C.inkFaint : C.onBrand,
            }}
          >
            <Plus size={14} /> Registrar
          </button>
          <div className="mt-4 space-y-1.5">
            {registros.slice(0, 20).map((r) => {
              const media = mediaHistorica(r.id);
              const custoAtual = r.km > 0 ? r.combustivel / r.km : 0;
              const alerta = media && custoAtual > media * 1.2;
              return editId === r.id ? (
                <div
                  key={r.id}
                  className="grid sm:grid-cols-5 gap-2 rounded-lg px-2 py-2 anim-pop"
                  style={{ background: C.panel2 }}
                >
                  <TextInput
                    type="date"
                    value={editVal.data}
                    onChange={(e) => setEditVal({ ...editVal, data: e.target.value })}
                    className="text-xs py-1"
                  />
                  <Select
                    value={editVal.direcao}
                    onChange={(e) => setEditVal({ ...editVal, direcao: e.target.value })}
                    className="text-xs py-1"
                  >
                    <option value="ida">Ida</option>
                    <option value="volta">Volta</option>
                  </Select>
                  <TextInput
                    type="number"
                    value={editVal.km}
                    onChange={(e) => setEditVal({ ...editVal, km: e.target.value })}
                    className="text-xs py-1"
                  />
                  <TextInput
                    type="number"
                    value={editVal.litros}
                    onChange={(e) => setEditVal({ ...editVal, litros: e.target.value })}
                    className="text-xs py-1"
                  />
                  <div className="flex gap-2">
                    <TextInput
                      type="number"
                      value={editVal.combustivel}
                      onChange={(e) => setEditVal({ ...editVal, combustivel: e.target.value })}
                      className="text-xs py-1"
                    />
                    <button onClick={salvarEdicaoReg}>
                      <Save size={14} style={{ color: C.green }} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={r.id}
                  className="row-hover flex items-center justify-between text-xs rounded-lg px-2 py-1.5"
                  style={{ background: C.panel2 }}
                >
                  <span>
                    {fmtDate(r.data)} · {r.direcao === "ida" ? "Ida" : "Volta"} · {r.km}km ·{" "}
                    {fmtBRL(r.combustivel)}
                    {r.litros ? ` (${r.litros}L)` : ""}{" "}
                    {alerta && <span style={{ color: C.red }}>⚠ consumo acima do normal</span>}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => iniciarEdicaoReg(r)}>
                      <Pencil size={12} style={{ color: C.inkFaint }} />
                    </button>
                    <button onClick={() => removerRegistro(r.id)}>
                      <X size={12} style={{ color: C.red }} />
                    </button>
                  </div>
                </div>
              );
            })}
            {registros.length === 0 && (
              <div className="text-xs" style={{ color: C.inkFaint }}>
                Nenhum abastecimento registrado.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Wrench size={15} style={{ color: C.amber }} /> Manutenção preventiva
          </div>
          <div className="text-xs mb-3" style={{ color: C.inkFaint }}>
            A despesa da manutenção entra sozinha no Financeiro do dia.
          </div>
          <div className="grid sm:grid-cols-5 gap-2">
            <TextInput
              placeholder="Tipo (ex.: troca de óleo)"
              value={novaManut.tipo}
              onChange={(e) => setNovaManut({ ...novaManut, tipo: e.target.value })}
            />
            <TextInput
              type="date"
              value={novaManut.data}
              onChange={(e) => setNovaManut({ ...novaManut, data: e.target.value })}
            />
            <TextInput
              placeholder="Intervalo (km)"
              type="number"
              value={novaManut.intervaloKm}
              onChange={(e) => setNovaManut({ ...novaManut, intervaloKm: e.target.value })}
            />
            <TextInput
              placeholder="Km na manutenção"
              type="number"
              value={novaManut.kmAtual}
              onChange={(e) => setNovaManut({ ...novaManut, kmAtual: e.target.value })}
            />
            <TextInput
              placeholder="Custo R$"
              type="number"
              value={novaManut.custo}
              onChange={(e) => setNovaManut({ ...novaManut, custo: e.target.value })}
            />
          </div>
          <button
            onClick={addManutencao}
            disabled={!novaManut.tipo || !veiculoId}
            className="btn-press mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              background: !novaManut.tipo || !veiculoId ? C.border : C.amber,
              color: !novaManut.tipo || !veiculoId ? C.inkFaint : C.onBrand,
            }}
          >
            <Plus size={14} /> Registrar manutenção
          </button>
          <div className="mt-4 space-y-1.5">
            {manutencoes.map((m) => {
              const kmDesde = kmAcumuladoDesde(m.data);
              const pct = Math.min(100, Math.round((kmDesde / m.intervaloKm) * 100));
              const vencida = pct >= 100;
              const proxima = pct >= 80 && !vencida;
              return (
                <div key={m.id} className="rounded-lg px-3 py-2" style={{ background: C.panel2 }}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {m.tipo} · última em {fmtDate(m.data)} ({m.kmAtual}km) · a cada{" "}
                      {m.intervaloKm}km · {fmtBRL(m.custo)}
                    </span>
                    <div className="flex items-center gap-2">
                      {vencida ? (
                        <Pill color={C.red} bg={C.redSoft}>
                          🔴 vencida
                        </Pill>
                      ) : proxima ? (
                        <Pill color={C.amber} bg={C.amberSoft}>
                          🟡 em breve
                        </Pill>
                      ) : (
                        <Pill color={C.green} bg={C.greenSoft}>
                          🟢 em dia
                        </Pill>
                      )}
                      <button onClick={() => removerManutencao(m.id)}>
                        <X size={12} style={{ color: C.red }} />
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-1 rounded-full mt-2" style={{ background: C.border }}>
                    <div
                      className="h-1 rounded-full bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: vencida ? C.red : proxima ? C.amber : C.green,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {manutencoes.length === 0 && (
              <div className="text-xs" style={{ color: C.inkFaint }}>
                Nenhuma manutenção preventiva cadastrada.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
