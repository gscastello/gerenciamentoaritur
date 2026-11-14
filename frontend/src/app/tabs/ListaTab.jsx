import {
  AlertTriangle,
  Check,
  ClipboardList,
  ListOrdered,
  MapPin,
  MessageCircle,
  Package,
  PhoneCall,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { resumoDaEncomenda } from "../../domain/agendaLinha.js";
import { ordenarBusca } from "../../domain/buscaEmCasa.js";
import { rotuloPagamento } from "../../domain/format.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import {
  BUSCA_MODOS,
  BotaoAgendar,
  BuscaChip,
  C,
  Card,
  ErrorBanner,
  Header,
  OCUPA_VAGA,
  Pill,
  SeloCidadeIntermediaria,
  StatusPill,
  SubTabs,
  TextInput,
  diaSemana,
  digitos,
  enderecoEmbarque,
  fmtBRL,
  linhaReserva,
  todayStr,
  useCidadeIntermediaria,
  useDeepLinkData,
} from "../tabShared.jsx";
import ListaDesembarqueAnotada from "./ListaDesembarqueAnotada.jsx";
import OrdemDaListaEditor from "./OrdemDaListaEditor.jsx";

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
  // a Rota é a da VOLTA (issue #411): quem buscamos em Pirapemas e Cantanhede para iniciar a viagem
  const daVolta = doDia.filter((r) => r.direcao === "volta");
  const pendentes = daVolta.filter((r) => r.status === "pendente");
  const ativos = daVolta.filter((r) => OCUPA_VAGA.includes(r.status));
  // Encomendas agendadas pro dia — não entram em `doDia` (não são
  // "passageiro", nunca contam como pax), mas aparecem nas seções do ponto de
  // embarque, com a mesma linha das passagens: quem tá na rua precisa ver o
  // que tem pra pegar/entregar em cada parada.
  const encomendasDoDia = reservas.filter(
    (r) => r.tipo === "encomenda" && r.data === data && r.status !== "cancelada",
  );
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
      if (reservas.find((x) => x.id === id)?.tipo === "encomenda") {
        await R.editReservationFull(id, {
          status: acao === "embarcado" ? "embarcado" : "confirmada",
        });
        return;
      }
      if (acao === "embarcado") await R.markPassengers(id, "embarcado");
      else if (acao === "nao_compareceu") await R.markPassengers(id, "nao_compareceu");
      else await R.markPassengers(id, "confirmado").then(() => R.confirmReservation(id));
    } catch (e) {
      setErro(mensagemAmigavel(e, "Não foi possível atualizar o passageiro."));
    }
  };
  const salvarOrdem = (ids) => R.reorderPickup(ids);
  // inclui quem já foi marcado "não compareceu" (some da contagem de pax,
  // mas o motorista ainda vê e pode reverter).
  const naRota = [
    ...doDia.filter((r) => OCUPA_VAGA.includes(r.status) || r.status === "nao_compareceu"),
    ...encomendasDoDia,
  ];
  // A ordem salva em "Organizar" (buscaSeq) vale para todas as seções; sem ela,
  // cada seção segue a ordem de sempre.
  const comOrdemSalva = (itens) =>
    itens.some((r) => r.buscaSeq != null) ? ordenarBusca(itens) : itens;
  const cantanhedeItens = comOrdemSalva(
    naRota.filter((r) => r.direcao === "volta" && r.pontoId === "cantanhede"),
  );
  const pirapemasItens = naRota.filter((r) => r.direcao === "volta" && r.pontoId === "pirapemas");
  const outrasVolta = naRota.filter(
    (r) => r.direcao === "volta" && r.pontoId !== "cantanhede" && r.pontoId !== "pirapemas",
  );

  return (
    <div>
      <Header
        title="Rota"
        subtitle="Volta: quem buscamos em casa em Pirapemas e Cantanhede, na ordem da rota."
      />
      <div className="px-4 md:px-10 pb-10 space-y-4 stagger">
        {erro && <ErrorBanner onDismiss={() => setErro("")}>{erro}</ErrorBanner>}
        {/* o dia e o resumo na mesma linha (issue #399: o campo de data ficava solto no topo) */}
        <div className="flex items-center justify-between gap-3">
          <p
            className="text-[13px] min-w-0"
            style={{ color: C.inkSoft }}
            data-testid="resumo-da-lista"
          >
            <b className="capitalize" style={{ color: C.ink }}>
              {data === todayStr() ? "Hoje" : diaSemana(data)}
            </b>{" "}
            · {ativos.reduce((s, r) => s + r.quantidade, 0)} passageiros ·{" "}
            {ativos.filter((r) => r.status === "embarcado").reduce((s, r) => s + r.quantidade, 0)}{" "}
            embarcados
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <TextInput
              type="date"
              aria-label="Dia da lista"
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
        </div>
        <SubTabs
          value={subview}
          onChange={setSubview}
          options={[
            { id: "embarque", label: "Embarque", Icon: ClipboardList },
            { id: "desembarque", label: "Desembarque", Icon: MapPin },
          ]}
        />
        {/* desembarque: só a lista anotada à mão, como bloco de notas (issue #411) */}
        {subview === "desembarque" && <ListaDesembarqueAnotada data={data} />}
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
                      {[linhaReserva(r, trips), r.nome, r.desembarque].filter(Boolean).join(" · ")}
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <ListaSecao
              onOrdenar={salvarOrdem}
              titulo="CANTANHEDE"
              itens={cantanhedeItens}
              trips={trips}
              marcar={marcar}
              onAbrir={setResumo}
            />
            <ListaSecao
              onOrdenar={salvarOrdem}
              titulo="PIRAPEMAS"
              itens={comOrdemSalva([...pirapemasItens, ...outrasVolta])}
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

function ListaSecao({ titulo, itens, trips, marcar, buscar, onAbrir, onOrdenar }) {
  const [organizando, setOrganizando] = useState(false);
  const paxAtivos = itens
    .filter((r) => OCUPA_VAGA.includes(r.status) && r.tipo !== "encomenda")
    .reduce((s, r) => s + r.quantidade, 0);
  const qtdEncomendas = itens.filter((r) => r.tipo === "encomenda").length;
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
    <section className="border-t pt-3" style={{ borderColor: C.border }}>
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <h3 className="text-[12px] font-bold tracking-wide" style={{ color: C.inkSoft }}>
          {titulo}
        </h3>
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
          {onOrdenar && itens.length > 1 && !organizando && (
            <button
              type="button"
              onClick={() => setOrganizando(true)}
              className="btn-press flex items-center gap-1 text-[11px] font-semibold px-2.5 min-h-[36px] rounded-lg"
              style={{ background: C.panel2, color: C.ink, border: `1px solid ${C.border}` }}
            >
              <ListOrdered size={12} /> ORGANIZAR
            </button>
          )}
          {/* encomenda conta junto das passagens, no mesmo contador (issue #399) */}
          <Pill>
            {paxAtivos} pax
            {qtdEncomendas > 0 &&
              ` · ${qtdEncomendas} ${qtdEncomendas === 1 ? "encomenda" : "encomendas"}`}
          </Pill>
        </div>
      </div>
      {organizando ? (
        <OrdemDaListaEditor
          itens={itens}
          trips={trips}
          onSalvar={onOrdenar}
          onFechar={() => setOrganizando(false)}
        />
      ) : itens.length === 0 ? (
        <div className="text-xs py-2" style={{ color: C.inkFaint }}>
          Ninguém neste ponto.
        </div>
      ) : (
        <div>
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
    </section>
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
  const ehEnc = r.tipo === "encomenda";
  const endereco = enderecoEmbarque(r, trips) || "endereço não informado";
  const cidadeIntermediaria = useCidadeIntermediaria(r);
  // crítica de design (issue #393): uma linha por passageiro, sem cartão dentro do cartão;
  // Ligar e WhatsApp em ícones de 44 px; o resto em "ver reserva completa"
  const icone = "btn-press w-11 h-11 rounded-xl flex items-center justify-center shrink-0";
  return (
    <div
      className="row-hover grid items-start gap-1 py-1.5 border-b"
      style={{
        gridTemplateColumns: `${marcar ? "44px " : ""}minmax(0,1fr) auto`,
        borderColor: C.panel2,
        background: cidadeIntermediaria ? C.rotaSoft : "transparent",
        opacity: faltou ? 0.5 : 1,
      }}
    >
      {marcar && (
        <button
          type="button"
          onClick={() => marcar(r.id, embarcado ? "reverter" : "embarcado")}
          aria-label={
            ehEnc
              ? embarcado
                ? "Desmarcar entrega"
                : "Marcar entrega"
              : embarcado
                ? "Desmarcar embarque"
                : "Marcar embarque"
          }
          aria-pressed={embarcado}
          className="check-fast w-11 h-11 flex items-center justify-center"
        >
          <span
            className="w-5 h-5 rounded-md border-[1.5px] flex items-center justify-center"
            style={{
              borderColor: embarcado ? C.ink : C.inkFaint,
              background: embarcado ? C.ink : "transparent",
            }}
          >
            {embarcado && <Check size={13} style={{ color: C.bg }} strokeWidth={3} />}
          </span>
        </button>
      )}
      <div className="min-w-0 py-1.5">
        {/* tocar no endereço abre a reserva completa (auditoria, issue #397): a seta saiu e o
            texto ganhou a largura dela */}
        <button
          type="button"
          onClick={() => onAbrir?.(r)}
          disabled={!onAbrir}
          aria-label={`Ver reserva completa de ${r.nome || r.telefone || "passageiro"}`}
          className="toque-at block w-full text-left"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-bold shrink-0" style={{ color: C.ink }}>
              {ehEnc ? (
                <>
                  <Package size={13} className="inline mr-0.5" aria-hidden="true" />
                  ENC
                </>
              ) : (
                `${r.quantidade}P`
              )}
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
          <div
            className="text-[12px] mt-0.5"
            style={{ color: C.inkSoft, overflowWrap: "anywhere" }}
          >
            {ehEnc ? "contato: " : ""}
            {r.nome || (ehEnc ? r.telefone : "") || "—"}
          </div>
        </button>
        {cidadeIntermediaria && <SeloCidadeIntermediaria cidade={cidadeIntermediaria} />}
        {ehEnc && (
          <div
            className="text-[11px] mt-0.5"
            style={{ color: C.inkFaint, overflowWrap: "anywhere" }}
          >
            {resumoDaEncomenda(r)}
          </div>
        )}
        <div
          className="mt-0.5 flex items-center gap-2 flex-wrap text-xs"
          style={{ color: C.inkFaint }}
        >
          {tel && <span>{r.telefone}</span>}
          {buscar && <BuscaChip r={r} onCycle={buscar} />}
        </div>
      </div>
      <div className="flex items-center">
        {tel && (
          <a
            href={`tel:${tel}`}
            aria-label={`Ligar para ${r.telefone}`}
            className={icone}
            style={{ color: C.inkSoft }}
          >
            <PhoneCall size={18} />
          </a>
        )}
        {tel && (
          <a
            href={`https://wa.me/55${tel}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`WhatsApp de ${r.nome || r.telefone}`}
            className={icone}
            style={{ color: C.inkSoft }}
          >
            <MessageCircle size={18} />
          </a>
        )}
      </div>
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
  const ehEnc = r.tipo === "encomenda";
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
              <span>{ehEnc ? "ENC" : `${r.quantidade}P`}</span> · {ehEnc ? "contato: " : ""}
              {r.nome || (ehEnc ? r.telefone : "") || "—"}
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
          {linha(ehEnc ? "Buscar em" : "Embarque", endereco)}
          {ehEnc ? linha("Item", r.extra?.encItem) : null}
          {ehEnc
            ? linha("Entrega", r.desembarque || "a definir")
            : linha("Desembarque", r.desembarque)}
          {ehEnc
            ? linha(
                "Quem entrega",
                [r.extra?.encRemetenteNome, r.extra?.encRemetenteTelefone]
                  .filter(Boolean)
                  .join(" "),
              )
            : null}
          {ehEnc
            ? linha(
                "Quem recebe",
                [r.extra?.encDestinatarioNome, r.extra?.encDestinatarioTelefone]
                  .filter(Boolean)
                  .join(" "),
              )
            : linha(
                "Pagamento",
                `${rotuloPagamento(r.pagamento)} · ${r.pago ? "pago" : `a receber ${fmtBRL(r.valorTotal)}`}`,
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
              <Check size={15} />{" "}
              {ehEnc
                ? embarcado
                  ? "Entregue ✓"
                  : "Marcar entregue"
                : embarcado
                  ? "Embarcou ✓"
                  : "Marcar embarque"}
            </button>
            {!ehEnc && (
              <button
                type="button"
                onClick={() => marcar(r.id, faltou ? "reverter" : "nao_compareceu")}
                className="btn-press flex items-center justify-center gap-1.5 text-[13px] py-2.5 rounded-lg"
                style={{ background: C.panel2, color: faltou ? C.ink : C.inkSoft }}
              >
                {faltou ? "Desfazer “não veio”" : "Não veio"}
              </button>
            )}
          </div>
        )}

        {mover && alvos && !ehEnc && (
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
