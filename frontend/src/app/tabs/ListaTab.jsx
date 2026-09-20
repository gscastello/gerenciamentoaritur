import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  MapPin,
  MessageCircle,
  Package,
  PhoneCall,
  X,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { mensagemAmigavel } from "../../lib/erros.js";
import {
  BUSCA_MODOS,
  BUSCA_PROXIMO,
  BotaoAgendar,
  BuscaChip,
  C,
  Card,
  DirecaoDivisor,
  Header,
  HeroFX,
  IDA_PRIORIDADE,
  OCUPA_VAGA,
  Pill,
  StatusPill,
  SubTabs,
  TextInput,
  detalheDesembarque,
  diaSemana,
  digitos,
  enderecoEmbarque,
  fmtBRL,
  fmtDate,
  inferirBaldeDesembarque,
  linhaReserva,
  todayStr,
  useDeepLinkData,
  useDropoff,
} from "../tabShared.jsx";

export default function ListaTab({ reservas, R, trips, deepLink, onAgendar }) {
  const [data, setData] = useState(todayStr());
  useDeepLinkData(deepLink, setData);
  const [erro, setErro] = useState("");
  const [subview, setSubview] = useState("embarque");
  const [resumo, setResumo] = useState(null);
  const doDia = reservas.filter(
    (r) =>
      r.data === data &&
      !["frete", "encomenda"].includes(r.tipo) &&
      r.status !== "cancelada" &&
      r.status !== "espera",
  );
  const pendentes = doDia.filter((r) => r.status === "pendente");
  const ativos = doDia.filter((r) => OCUPA_VAGA.includes(r.status));
  // Encomendas agendadas pro dia — não entram em `doDia` (não são
  // "passageiro"). Visível em qualquer sub-aba: quem tá na rua precisa
  // ver o que tem pra pegar/entregar independente de Embarque/Desembarque.
  const encomendasDoDia = reservas.filter(
    (r) => r.tipo === "encomenda" && r.data === data && r.status !== "cancelada",
  );
  const entregarEncomenda = async (id) => {
    setErro("");
    try {
      await R.editReservationFull(id, { status: "embarcado" });
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível marcar como entregue."));
    }
  };
  const alvos = useMemo(
    () => [
      ...trips.ida.pontos.map((p) => ({
        key: `ida__${p.id}`,
        direcao: "ida",
        pontoId: p.id,
        nome: p.nome,
      })),
      ...trips.volta.pontos.map((p) => ({
        key: `volta__${p.id}`,
        direcao: "volta",
        pontoId: p.id,
        nome: p.nome,
      })),
    ],
    [trips],
  );
  const mover = async (id, chaveAlvo) => {
    const alvo = alvos.find((a) => a.key === chaveAlvo);
    if (!alvo) return;
    setErro("");
    try {
      await R.moveReservation(id, {
        tripDate: data,
        direction: alvo.direcao,
        routePointCode: alvo.pontoId,
      });
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível realocar."));
    }
  };
  const remove = async (id) => {
    setErro("");
    try {
      await R.cancelReservation(id);
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível remover."));
    }
  };
  // Ações do motorista direto na lista de embarque.
  const marcar = async (id, acao) => {
    setErro("");
    try {
      if (acao === "embarcado") await R.markPassengers(id, "embarcado");
      else if (acao === "nao_compareceu") await R.markPassengers(id, "nao_compareceu");
      else await R.markPassengers(id, "confirmado").then(() => R.confirmReservation(id));
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível atualizar o passageiro."));
    }
  };
  // Quem busca em casa: cicla Táxi → Nós → Motorista → Táxi (issue #96).
  const ciclarBusca = async (id, atual) => {
    setErro("");
    try {
      await R.setPickupTransport(id, BUSCA_PROXIMO[atual ?? "taxi"] ?? "proprio");
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível mudar quem busca."));
    }
  };
  // inclui quem já foi marcado "não compareceu" (some da contagem de pax,
  // mas o motorista ainda vê e pode reverter).
  const naRota = doDia.filter(
    (r) => OCUPA_VAGA.includes(r.status) || r.status === "nao_compareceu",
  );
  const buscaItens = naRota.filter((r) => r.direcao === "ida" && r.pontoId === "busca");
  const agrupadosIda = naRota
    .filter((r) => r.direcao === "ida" && r.pontoId !== "busca")
    .sort((a, b) => (IDA_PRIORIDADE[a.pontoId] ?? 3) - (IDA_PRIORIDADE[b.pontoId] ?? 3));
  const cantanhedeItens = naRota.filter((r) => r.direcao === "volta" && r.pontoId === "cantanhede");
  const pirapemasItens = naRota.filter((r) => r.direcao === "volta" && r.pontoId === "pirapemas");
  const outrasVolta = naRota.filter(
    (r) => r.direcao === "volta" && r.pontoId !== "cantanhede" && r.pontoId !== "pirapemas",
  );

  return (
    <div>
      <Header
        title="Lista do Dia"
        subtitle='Anotações por local — busca em casa no formato "NP - BAIRRO - TELEFONE".'
        right={
          <div className="flex items-center gap-2">
            <TextInput
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-auto"
            />
            {onAgendar && (
              <span className="hidden sm:block">
                <BotaoAgendar onClick={onAgendar} />
              </span>
            )}
          </div>
        }
      />
      <div className="px-6 md:px-10 pb-10 space-y-6 stagger">
        {erro && (
          <div
            className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: C.redSoft, color: C.red }}
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} /> {erro}
            </span>
            <button onClick={() => setErro("")}>
              <XIcon size={13} />
            </button>
          </div>
        )}
        <div
          className="aritur-hero relative overflow-hidden rounded-2xl border p-4 md:p-5"
          style={{ borderColor: C.brandDim }}
        >
          <HeroFX />
          <div className="relative flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div
                className="capitalize"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.3rem",
                  color: "#fff",
                }}
              >
                {data === todayStr() ? "Hoje" : diaSemana(data)}
              </div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,.75)" }}>
                {fmtDate(data)} · lista de embarque
              </div>
            </div>
            <div className="flex gap-5">
              <div>
                <div
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,.6)" }}
                >
                  Passageiros
                </div>
                <div
                  className="font-bold"
                  style={{
                    color: "#fff",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "1.15rem",
                  }}
                >
                  {ativos.reduce((s, r) => s + r.quantidade, 0)}
                </div>
              </div>
              <div>
                <div
                  className="text-[10px] uppercase tracking-wide"
                  style={{ color: "rgba(255,255,255,.6)" }}
                >
                  Embarcados
                </div>
                <div
                  className="font-bold"
                  style={{
                    color: "#fff",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "1.15rem",
                  }}
                >
                  {ativos
                    .filter((r) => r.status === "embarcado")
                    .reduce((s, r) => s + r.quantidade, 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
        {encomendasDoDia.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Package size={16} style={{ color: C.inkSoft }} />
              <div className="text-sm font-semibold" style={{ color: C.ink }}>
                Encomendas do dia{" "}
                <span style={{ color: C.inkFaint }}>({encomendasDoDia.length})</span>
              </div>
            </div>
            <div className="space-y-2">
              {encomendasDoDia.map((r) => {
                const ponto = trips[r.direcao]?.pontos.find((p) => p.id === r.pontoId);
                const entregue = r.status === "embarcado";
                return (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
                    style={{ background: C.panel2, opacity: entregue ? 0.6 : 1 }}
                  >
                    <div className="text-xs">
                      <span className="font-semibold">{r.direcao === "ida" ? "Ida" : "Volta"}</span>{" "}
                      · {r.extra?.encItem || "encomenda"} · {ponto?.nome || "?"} →{" "}
                      {r.desembarque || "?"}
                      <br />
                      <span style={{ color: C.inkFaint }}>
                        entrega: {r.extra?.encRemetenteNome || "—"} (
                        {r.extra?.encRemetenteTelefone || "—"}) · recebe: {r.nome} ({r.telefone})
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {r.telefone && (
                        <button
                          onClick={() =>
                            window.open(`https://wa.me/55${digitos(r.telefone)}`, "_blank")
                          }
                          className="btn-press flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                          style={{ background: C.panel, color: C.inkSoft }}
                        >
                          <MessageCircle size={12} /> WhatsApp
                        </button>
                      )}
                      {!entregue && (
                        <button
                          onClick={() => entregarEncomenda(r.id)}
                          className="btn-press flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                          style={{ background: C.greenSoft, color: C.green }}
                        >
                          <Check size={12} /> Entregue
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
        <SubTabs
          value={subview}
          onChange={setSubview}
          options={[
            { id: "embarque", label: "Embarque", Icon: ClipboardList },
            { id: "desembarque", label: "Desembarque (rota)", Icon: MapPin },
          ]}
        />
        {subview === "desembarque" && <DesembarqueView reservas={reservas} R={R} data={data} />}
        {subview === "embarque" && (
          <>
            {pendentes.length > 0 && (
              <Card style={{ borderColor: C.purple }}>
                <div
                  className="text-xs font-semibold mb-2 flex items-center gap-1.5"
                  style={{ color: C.purple }}
                >
                  <AlertTriangle size={13} /> Pendentes (fora da rota padrão)
                </div>
                <div className="space-y-1.5">
                  {pendentes.map((r) => (
                    <div
                      key={r.id}
                      className="text-xs rounded-md px-2 py-1.5"
                      style={{ background: C.purpleSoft }}
                    >
                      {linhaReserva(r, trips)} — {r.desembarque}
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <DirecaoDivisor label="IDA" cor={C.inkSoft} />
            <ListaSecao
              titulo="BUSCAR EM CASA"
              itens={buscaItens}
              trips={trips}
              marcar={marcar}
              buscar={ciclarBusca}
              onAbrir={setResumo}
            />
            <ListaSecao
              titulo="RODOVIÁRIA / RETORNO / POSTO CARONE / BR / OUTROS"
              itens={agrupadosIda}
              trips={trips}
              marcar={marcar}
              onAbrir={setResumo}
            />
            <DirecaoDivisor label="VOLTA" cor={C.inkSoft} />
            <ListaSecao
              titulo="CANTANHEDE"
              itens={cantanhedeItens}
              trips={trips}
              marcar={marcar}
              onAbrir={setResumo}
            />
            <ListaSecao
              titulo="PIRAPEMAS"
              itens={[...pirapemasItens, ...outrasVolta]}
              trips={trips}
              marcar={marcar}
              onAbrir={setResumo}
            />
          </>
        )}
      </div>
      {resumo && (
        <ReservaResumoModal
          r={reservas.find((x) => x.id === resumo.id) ?? resumo}
          trips={trips}
          alvos={alvos}
          onClose={() => setResumo(null)}
          marcar={marcar}
          mover={mover}
          remove={remove}
        />
      )}
    </div>
  );
}

/* --- Desembarque: rota de entrega do motorista, editável (issue: rota) --- */
function DesembarqueView({ reservas, R, data }) {
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const dropoff = useDropoff();

  const doDia = useMemo(
    () =>
      reservas.filter(
        (r) =>
          r.data === data &&
          !["frete", "encomenda"].includes(r.tipo) &&
          OCUPA_VAGA.includes(r.status),
      ),
    [reservas, data],
  );

  const acao = async (p) => {
    setErro("");
    setSalvando(true);
    try {
      await p;
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  };
  const mudarBalde = (r, area) => acao(R.setDropoff(r.id, { area, detail: detalheDesembarque(r) }));
  const mudarDetalhe = (r, detalhe) => {
    if ((detalhe || "") === (detalheDesembarque(r) || "")) return;
    acao(R.setDropoff(r.id, { area: inferirBaldeDesembarque(r), detail: detalhe }));
  };
  const reordenar = (idsNaOrdem) => acao(R.reorderDropoff(idsNaOrdem));

  const temAlguem = doDia.length > 0;

  return (
    <div className="space-y-6">
      <div className="text-xs" style={{ color: C.inkFaint }}>
        Ordem de entrega por local, editável. Base: o desembarque que o cliente informou no
        agendamento — ajuste o balde e a ordem para montar a rota.
        {salvando && " · salvando…"}
      </div>
      {erro && (
        <div
          className="flex items-center justify-between gap-2 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> {erro}
          </span>
          <button type="button" onClick={() => setErro("")}>
            <XIcon size={13} />
          </button>
        </div>
      )}
      {!temAlguem && (
        <div className="text-sm" style={{ color: C.inkFaint }}>
          Nenhum passageiro confirmado nesse dia.
        </div>
      )}
      {temAlguem &&
        ["ida", "volta"].map((direcao) => {
          const itens = doDia.filter((r) => r.direcao === direcao);
          if (itens.length === 0) return null;
          return (
            <div key={direcao} className="space-y-3">
              <div className="text-center">
                <span
                  className="inline-block px-4 py-1 rounded-full text-sm font-bold tracking-wide"
                  style={{
                    background: direcao === "ida" ? C.amberSoft : C.blueSoft,
                    color: direcao === "ida" ? C.amber : C.blue,
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  {direcao === "ida" ? "IDA — desembarque" : "VOLTA — desembarque"}
                </span>
              </div>
              {dropoff.porDirecao(direcao).map((balde) => {
                const doBalde = itens
                  .filter((r) => inferirBaldeDesembarque(r) === balde.code)
                  .sort(
                    (a, b) =>
                      (a.desembarqueSeq ?? 9999) - (b.desembarqueSeq ?? 9999) ||
                      (a.nome || "").localeCompare(b.nome || ""),
                  );
                return (
                  <DesembarqueBalde
                    key={balde.code}
                    balde={balde}
                    direcao={direcao}
                    itens={doBalde}
                    salvando={salvando}
                    onBalde={mudarBalde}
                    onDetalhe={mudarDetalhe}
                    onReordenar={reordenar}
                  />
                );
              })}
            </div>
          );
        })}
    </div>
  );
}

function DesembarqueBalde({ balde, direcao, itens, salvando, onBalde, onDetalhe, onReordenar }) {
  const dropoff = useDropoff();
  const pax = itens.reduce((s, r) => s + (r.quantidade || 1), 0);
  const mover = (idx, dir) => {
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= itens.length) return;
    const ids = itens.map((r) => r.id);
    [ids[idx], ids[alvo]] = [ids[alvo], ids[idx]];
    onReordenar(ids);
  };
  const placeholder = dropoff.detalhe(direcao, balde.code).label;

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold tracking-wide" style={{ color: C.inkSoft }}>
          {balde.label.toUpperCase()}
        </div>
        <Pill color={C.blue}>{pax} pax</Pill>
      </div>
      {itens.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          — ninguém —
        </div>
      ) : (
        <ol className="list-none space-y-1.5">
          {itens.map((r, idx) => (
            <li key={r.id} className="rounded-md px-2.5 py-2.5" style={{ background: C.panel2 }}>
              <div className="flex items-start gap-2">
                <span
                  className="tabular-nums shrink-0 mt-0.5 text-sm"
                  style={{ color: C.inkFaint, fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {idx + 1}.
                </span>
                <span
                  className="font-bold text-[15px] leading-snug flex-1 min-w-0"
                  style={{ color: C.ink, overflowWrap: "anywhere" }}
                >
                  {r.nome || "—"}
                </span>
                <span className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0 || salvando}
                    onClick={() => mover(idx, -1)}
                    aria-label="Entregar antes"
                    style={{ opacity: idx === 0 ? 0.3 : 1 }}
                  >
                    <ChevronUp size={16} style={{ color: C.inkSoft }} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === itens.length - 1 || salvando}
                    onClick={() => mover(idx, 1)}
                    aria-label="Entregar depois"
                    style={{ opacity: idx === itens.length - 1 ? 0.3 : 1 }}
                  >
                    <ChevronDown size={16} style={{ color: C.inkSoft }} />
                  </button>
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 mt-1.5">
                <input
                  key={`${r.id}:${detalheDesembarque(r)}`}
                  defaultValue={detalheDesembarque(r)}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => onDetalhe(r, e.target.value.trim())}
                  placeholder={placeholder}
                  aria-label="Endereço de desembarque"
                  className="w-full sm:flex-1 min-w-0 text-[13px] rounded px-2.5 py-2 outline-none"
                  style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.ink }}
                />
                <select
                  value={balde.code}
                  onChange={(e) => onBalde(r, e.target.value)}
                  aria-label="Área de desembarque"
                  className="w-full sm:w-auto text-xs rounded px-1 py-2 outline-none shrink-0"
                  style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.inkSoft }}
                >
                  {dropoff.porDirecao(direcao).map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function ListaSecao({ titulo, itens, trips, marcar, buscar, onAbrir }) {
  const paxAtivos = itens
    .filter((r) => OCUPA_VAGA.includes(r.status))
    .reduce((s, r) => s + r.quantidade, 0);
  // Só interessa contar quem NÃO vai de táxi (Gustavo / Maurício).
  const tally = buscar
    ? itens
        .filter((r) => OCUPA_VAGA.includes(r.status) && r.buscaPor && r.buscaPor !== "taxi")
        .reduce((acc, r) => {
          acc[r.buscaPor] = (acc[r.buscaPor] ?? 0) + 1;
          return acc;
        }, {})
    : null;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-xs font-bold tracking-wide" style={{ color: C.inkSoft }}>
          {titulo}
        </div>
        <div className="flex items-center gap-1.5">
          {tally &&
            Object.entries(tally).map(([k, n]) => {
              const m = BUSCA_MODOS[k];
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
                >
                  <m.Icon size={11} /> {m.label} {n}
                </span>
              );
            })}
          <Pill>{paxAtivos} pax</Pill>
        </div>
      </div>
      {itens.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkFaint }}>
          — sem anotações —
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((r) => (
            <LinhaEmbarque
              key={r.id}
              r={r}
              trips={trips}
              marcar={marcar}
              buscar={buscar}
              onAbrir={onAbrir}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// Linha de passageiro na Lista do Dia — é o que o MOTORISTA olha. Só o
// essencial: caixa de embarque (1 toque, otimista), nº de passagens,
// endereço completo e contato. Tudo o resto (status, pagamento, mover,
// cancelar, "não veio", desembarque) fica no botão "ver reserva
// completa" à direita.
function LinhaEmbarque({ r, trips, marcar, buscar, onAbrir }) {
  const tel = digitos(r.telefone);
  const embarcado = r.status === "embarcado";
  const faltou = r.status === "nao_compareceu";
  const endereco = enderecoEmbarque(r, trips) || "endereço não informado";
  return (
    <div
      className="rounded-lg px-3 py-2.5 flex items-start gap-2.5"
      style={{ background: C.panel2, opacity: faltou ? 0.5 : 1 }}
    >
      {marcar && (
        <button
          type="button"
          onClick={() => marcar(r.id, embarcado ? "reverter" : "embarcado")}
          aria-label={embarcado ? "Desmarcar embarque" : "Marcar embarque"}
          className="check-fast shrink-0 mt-0.5 rounded-[4px] border flex items-center justify-center w-4 h-4"
          style={{
            borderColor: embarcado ? C.ink : C.inkFaint,
            background: embarcado ? C.ink : "transparent",
          }}
        >
          {embarcado && <Check size={11} style={{ color: C.panel }} strokeWidth={3} />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className="text-[15px] font-bold shrink-0"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: C.ink }}
          >
            {r.quantidade}P
          </span>
          <span
            className="text-[14px] font-semibold leading-snug"
            style={{
              color: C.ink,
              overflowWrap: "anywhere",
              textDecoration: faltou ? "line-through" : "none",
            }}
          >
            {endereco}
          </span>
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: C.inkFaint, overflowWrap: "anywhere" }}>
          {r.nome || "—"}
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          {tel && (
            <>
              <a
                href={`tel:${tel}`}
                className="btn-press flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-md"
                style={{ background: C.panel, color: C.ink }}
              >
                <PhoneCall size={13} /> {r.telefone}
              </a>
              <a
                href={`https://wa.me/55${tel}`}
                target="_blank"
                rel="noreferrer"
                className="btn-press flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-md"
                style={{ background: C.panel, color: C.inkSoft }}
              >
                <MessageCircle size={13} /> WhatsApp
              </a>
            </>
          )}
          {buscar && <BuscaChip r={r} onCycle={buscar} />}
        </div>
      </div>
      {onAbrir && (
        <button
          type="button"
          onClick={() => onAbrir(r)}
          aria-label="Ver reserva completa"
          className="btn-press shrink-0 self-center w-8 h-8 rounded-md flex items-center justify-center"
          style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.inkSoft }}
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
// "Ver reserva completa" (Lista do Dia) — o resumo + as ações que saíram
// da linha: embarque / não veio, mudar ponto, cancelar. Read-first,
// pensado pro motorista.
function ReservaResumoModal({ r, trips, alvos, onClose, marcar, mover, remove }) {
  const tel = digitos(r.telefone);
  const embarcado = r.status === "embarcado";
  const faltou = r.status === "nao_compareceu";
  const endereco = enderecoEmbarque(r, trips) || "não informado";
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const linha = (rotulo, valor) =>
    valor ? (
      <div className="flex gap-2 text-[13px]">
        <span className="shrink-0 w-28" style={{ color: C.inkFaint }}>
          {rotulo}
        </span>
        <span style={{ color: C.ink, overflowWrap: "anywhere" }}>{valor}</span>
      </div>
    ) : null;
  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center p-3 anim-fadeIn"
      style={{ background: "rgba(0,0,0,.6)", zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="anim-pop w-full max-w-md rounded-2xl border p-4 max-h-[88vh] overflow-y-auto"
        style={{ background: C.panel, borderColor: C.border }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="text-base font-bold" style={{ color: C.ink }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{r.quantidade}P</span> ·{" "}
              {r.nome || "—"}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: C.inkFaint }}>
              <StatusPill status={r.status} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} style={{ color: C.inkSoft }} />
          </button>
        </div>

        <div className="space-y-1.5">
          {linha("Embarque", endereco)}
          {linha("Desembarque", r.desembarque)}
          {linha(
            "Pagamento",
            `${r.pagamento === "pix" ? "Pix" : "Dinheiro"} · ${r.pago ? "pago" : `a receber ${fmtBRL(r.valorTotal)}`}`,
          )}
          {linha("Telefone", r.telefone)}
        </div>

        {tel && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={`tel:${tel}`}
              className="btn-press flex items-center justify-center gap-1.5 text-[13px] py-2.5 rounded-lg"
              style={{ background: C.panel2, color: C.ink }}
            >
              <PhoneCall size={15} /> Ligar
            </a>
            <a
              href={`https://wa.me/55${tel}`}
              target="_blank"
              rel="noreferrer"
              className="btn-press flex items-center justify-center gap-1.5 text-[13px] py-2.5 rounded-lg"
              style={{ background: C.panel2, color: C.ink }}
            >
              <MessageCircle size={15} /> WhatsApp
            </a>
          </div>
        )}

        {marcar && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => marcar(r.id, embarcado ? "reverter" : "embarcado")}
              className="btn-press flex items-center justify-center gap-1.5 text-[13px] py-2.5 rounded-lg font-semibold"
              style={{
                background: embarcado ? C.ink : C.panel2,
                color: embarcado ? C.panel : C.ink,
              }}
            >
              <Check size={15} /> {embarcado ? "Embarcou ✓" : "Marcar embarque"}
            </button>
            <button
              type="button"
              onClick={() => marcar(r.id, faltou ? "reverter" : "nao_compareceu")}
              className="btn-press flex items-center justify-center gap-1.5 text-[13px] py-2.5 rounded-lg"
              style={{ background: C.panel2, color: faltou ? C.ink : C.inkSoft }}
            >
              {faltou ? "Desfazer “não veio”" : "Não veio"}
            </button>
          </div>
        )}

        {mover && alvos && (
          <label className="mt-2 block text-[11px]" style={{ color: C.inkFaint }}>
            Mudar ponto de embarque
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  mover(r.id, e.target.value);
                  onClose();
                }
              }}
              className="mt-1 w-full text-[13px] rounded-lg px-2 py-2 outline-none"
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.ink }}
            >
              <option value="">escolher…</option>
              {alvos.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.direcao === "ida" ? "IDA" : "VOLTA"} · {a.nome}
                </option>
              ))}
            </select>
          </label>
        )}

        {remove && r.status !== "cancelada" && (
          <button
            type="button"
            onClick={() => {
              remove(r.id);
              onClose();
            }}
            className="btn-press mt-3 w-full text-[12px] py-2 rounded-lg"
            style={{ background: C.redSoft, color: C.red }}
          >
            Cancelar esta reserva
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
