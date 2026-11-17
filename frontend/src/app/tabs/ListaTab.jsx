import {
  AlertTriangle,
  Building2,
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

  const totalQtd = ativos.reduce((s, r) => s + r.quantidade, 0);
  const embarcadosQtd = ativos
    .filter((r) => r.status === "embarcado")
    .reduce((s, r) => s + r.quantidade, 0);
  // a próxima parada: o primeiro da rota (Cantanhede, depois Pirapemas) que ainda não embarcou
  const naOrdem = [...cantanhedeItens, ...comOrdemSalva([...pirapemasItens, ...outrasVolta])];
  const proximaId = naOrdem.find(
    (r) => OCUPA_VAGA.includes(r.status) && r.status !== "embarcado" && r.tipo !== "encomenda",
  )?.id;

  return (
    <div>
      <Header
        title="Rota"
        subtitle={
          subview === "desembarque"
            ? "Anote onde cada passageiro desce, organize na ordem da entrega e copie."
            : "Volta: quem buscamos em casa em Pirapemas e Cantanhede, na ordem da rota."
        }
      />
      <div className="px-4 md:px-10 pb-10 space-y-4 stagger">
        {erro && <ErrorBanner onDismiss={() => setErro("")}>{erro}</ErrorBanner>}
        {/* o dia e o resumo na mesma linha (issue #399: o campo de data ficava solto no topo) */}
        <div className="flex items-center justify-between gap-3">
          {/* v18 (issue #446): quantos já embarcaram em destaque — dá para conferir de relance */}
          <div className="min-w-0" data-testid="resumo-da-lista">
            {subview !== "desembarque" && (
              <div className="flex items-baseline gap-1.5">
                <b
                  className="tabular-nums"
                  style={{ fontSize: 28, lineHeight: 1, letterSpacing: "-.035em", color: C.ink }}
                >
                  {embarcadosQtd}
                </b>
                <span className="text-[13.5px]" style={{ color: C.inkSoft }}>
                  de {totalQtd} embarcados
                </span>
              </div>
            )}
            <p className="text-[12.5px] mt-1" style={{ color: C.inkSoft }}>
              <span className="capitalize">{data === todayStr() ? "Hoje" : diaSemana(data)}</span>
              {subview !== "desembarque" && `, ${totalQtd} passageiros`}
            </p>
          </div>
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
        {subview !== "desembarque" && totalQtd > 0 && (
          <BarraDeEmbarque total={totalQtd} embarcados={embarcadosQtd} />
        )}
        <SubTabs
          value={subview}
          onChange={setSubview}
          options={[
            { id: "embarque", label: "Embarque", Icon: ClipboardList },
            { id: "desembarque", label: "Desembarque", Icon: MapPin },
          ]}
        />
        {/* só a lista anotada na viagem, com Organizar e Copiar (issue #440); o desembarque da Ida por
            cidade (issue #428) saiu a pedido do dono */}
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
              titulo="Cantanhede"
              itens={cantanhedeItens}
              proximaId={proximaId}
              trips={trips}
              marcar={marcar}
              onAbrir={setResumo}
            />
            <ListaSecao
              onOrdenar={salvarOrdem}
              titulo="Pirapemas"
              itens={comOrdemSalva([...pirapemasItens, ...outrasVolta])}
              proximaId={proximaId}
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

function ListaSecao({
  titulo,
  itens,
  trips,
  marcar,
  buscar,
  onAbrir,
  onOrdenar,
  proximaId = null,
  vazio = "Ninguém neste ponto.",
}) {
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
    <section className="pt-1">
      {/* faixa da cidade (v18, issue #446): o mesmo desenho das categorias da Agenda */}
      <div
        className="grid items-center gap-x-2.5 rounded-[13px] pl-1.5 pr-1.5 min-h-[50px] mb-1"
        style={{
          gridTemplateColumns: "30px minmax(0,1fr) auto",
          background: C.panel,
          boxShadow: `inset 0 0 0 1px ${C.panel2}`,
        }}
      >
        <span
          aria-hidden="true"
          className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center"
          style={{ background: C.border, color: C.ink }}
        >
          <Building2 size={17} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 py-1.5">
          <h3
            className="text-[15.5px] font-bold truncate"
            style={{ color: C.ink, letterSpacing: "-.015em", lineHeight: 1.2 }}
          >
            {titulo}
          </h3>
          <span className="block text-[12.5px] tabular-nums" style={{ color: C.inkSoft }}>
            {/* encomenda conta junto das passagens (issue #399) */}
            {[
              paxAtivos > 0 || qtdEncomendas === 0
                ? `${paxAtivos} ${paxAtivos === 1 ? "passagem" : "passagens"}`
                : null,
              qtdEncomendas > 0
                ? `${qtdEncomendas} ${qtdEncomendas === 1 ? "encomenda" : "encomendas"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {tally &&
            Object.entries(tally).map(([k, n]) => {
              const m = BUSCA_MODOS[k];
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: C.panel2, color: C.ink }}
                >
                  <m.Icon size={11} /> {m.label} {n}
                </span>
              );
            })}
          {onOrdenar && itens.length > 1 && !organizando && (
            <button
              type="button"
              onClick={() => setOrganizando(true)}
              className="btn-press flex items-center gap-1.5 text-[13px] font-semibold px-2 min-h-[40px] rounded-lg"
              style={{ color: C.ink }}
            >
              <ListOrdered size={15} /> Organizar
            </button>
          )}
        </span>
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
          {vazio}
        </div>
      ) : (
        <div>
          {itens.map((r, i) => (
            <LinhaEmbarque
              key={r.id}
              r={r}
              ordem={i + 1}
              proxima={r.id === proximaId}
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

// Um pedaço por passageiro: enche conforme embarcam (v18, issue #446). Com muita gente, vira uma
// barra só, para os pedaços não ficarem finos demais.
function BarraDeEmbarque({ total, embarcados }) {
  const pedacos = total <= 40;
  return (
    <div
      role="img"
      aria-label={`${embarcados} de ${total} embarcados`}
      className="h-1.5 rounded-full overflow-hidden"
      style={
        pedacos
          ? { display: "grid", gridTemplateColumns: `repeat(${total}, minmax(0,1fr))`, gap: 3 }
          : { background: C.border }
      }
    >
      {pedacos ? (
        Array.from({ length: total }, (_, i) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: os pedaços são posições fixas
            key={i}
            className="block rounded-full"
            style={{
              background: i < embarcados ? C.ink : C.border,
              transition: "background-color var(--motion-base) var(--ease-out-quart)",
            }}
          />
        ))
      ) : (
        <i
          className="block h-full rounded-full"
          style={{ width: `${(embarcados / total) * 100}%`, background: C.ink }}
        />
      )}
    </div>
  );
}

// Linha de passageiro na Lista do Dia — é o que o MOTORISTA olha. Só o
// essencial: caixa de embarque (1 toque, otimista), nº de passagens,
// endereço completo e contato. Tudo o resto (status, pagamento, mover,
// cancelar, "não veio", desembarque) fica no botão "ver reserva
// completa" à direita.
function LinhaEmbarque({ r, ordem, proxima = false, trips, marcar, buscar, onAbrir }) {
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
      className="row-hover relative grid items-center gap-1 py-1.5 rounded-2xl"
      style={{
        gridTemplateColumns: `${marcar ? "44px " : ""}minmax(0,1fr) auto`,
        background: cidadeIntermediaria ? C.rotaSoft : proxima ? C.panel : "transparent",
        opacity: faltou ? 0.5 : 1,
      }}
    >
      {/* a linha da rota: acende no trecho de quem já embarcou (v18) */}
      {marcar && (
        <span
          aria-hidden="true"
          className="absolute top-0 bottom-0 w-px"
          style={{
            left: 21.5,
            background: embarcado ? C.ink : C.border,
            transition: "background-color var(--motion-base) var(--ease-out-quart)",
          }}
        />
      )}
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
          className="check-fast relative z-[1] w-11 h-11 flex items-center justify-center"
        >
          {/* o número da casa na ordem da rota; ao marcar, vira o visto */}
          <span
            className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center text-[11.5px] font-semibold tabular-nums"
            style={{
              background: embarcado ? C.ink : C.bg,
              boxShadow: embarcado ? "none" : `inset 0 0 0 1.75px ${C.contorno}`,
              color: C.inkSoft,
            }}
          >
            {embarcado ? <Check size={15} style={{ color: C.bg }} strokeWidth={3} /> : ordem}
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
          {proxima && (
            <span className="block text-[12px] font-semibold" style={{ color: C.brandText }}>
              próxima parada
            </span>
          )}
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
            className={`${icone}${proxima ? " !rounded-full" : ""}`}
            style={proxima ? { background: C.ink, color: C.bg } : { color: C.inkSoft }}
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
