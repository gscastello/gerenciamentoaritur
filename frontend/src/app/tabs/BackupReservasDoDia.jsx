import { Download, Eye, EyeOff, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { csvDoBackup, linhasDoBackup, resumoDoBackup } from "../../domain/backupDia.js";
import { useReservationBackups } from "../../hooks/useReservationBackups.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { C, Card, fmtDate, fmtHora } from "../tabShared.jsx";

function baixarArquivo(conteudo, tipo, nome) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Sistema → Backup diário das reservas (issue #208). O servidor guarda, todo dia
 * às 23h55 (São Luís), uma cópia de todas as reservas daquele dia de viagem —
 * inclusive canceladas e apagadas. Aqui dá para ver e baixar cada dia.
 */
export default function BackupReservasDoDia() {
  const b = useReservationBackups();
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(null);
  const [retrato, setRetrato] = useState({});
  const [ocupado, setOcupado] = useState(null);

  const executar = async (fn, msg) => {
    setErro("");
    try {
      await fn();
    } catch (e) {
      setErro(mensagemAmigavel(e, msg));
    }
  };

  const carregar = async (id) => {
    if (retrato[id]) return retrato[id];
    const dados = await b.buscarRetrato(id);
    setRetrato((atual) => ({ ...atual, [id]: dados }));
    return dados;
  };

  const ver = (dia) =>
    executar(async () => {
      if (aberto === dia.id) {
        setAberto(null);
        return;
      }
      await carregar(dia.id);
      setAberto(dia.id);
    }, "Não foi possível abrir o backup.");

  const baixar = (dia, formato) =>
    executar(async () => {
      setOcupado(`${dia.id}:${formato}`);
      try {
        const dados = await carregar(dia.id);
        if (formato === "json") {
          baixarArquivo(
            JSON.stringify(dados, null, 2),
            "application/json",
            `reservas-${dia.backup_date}.json`,
          );
        } else {
          baixarArquivo(
            csvDoBackup(linhasDoBackup(dados)),
            "text/csv;charset=utf-8",
            `reservas-${dia.backup_date}.csv`,
          );
        }
      } finally {
        setOcupado(null);
      }
    }, "Não foi possível baixar o backup.");

  return (
    <Card>
      <div className="text-sm font-semibold mb-2 flex items-center gap-2">
        <FileSpreadsheet size={15} style={{ color: C.blue }} /> Backup diário das reservas
      </div>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Todo dia às <b>23h55</b> (São Luís) o sistema guarda uma cópia de{" "}
        <b>todas as reservas daquele dia</b> — inclusive canceladas e apagadas, com cliente,
        passageiros e pagamentos — por mais de um ano. Baixe em <b>CSV</b> (abre no Excel) ou{" "}
        <b>JSON</b> (completo).
      </p>
      <button
        type="button"
        onClick={() => executar(() => b.fazerAgora(), "Não foi possível fazer o backup.")}
        disabled={b.fazendo}
        className="btn-press flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg"
        style={{
          background: b.fazendo ? C.border : C.panel2,
          color: C.ink,
          border: `1px solid ${C.border}`,
        }}
      >
        <Download size={14} /> {b.fazendo ? "Fazendo…" : "Fazer backup de hoje agora"}
      </button>

      {(erro || b.error) && (
        <div
          className="mt-3 text-xs rounded-lg px-3 py-2"
          style={{ background: C.redSoft, color: C.red }}
        >
          {erro || mensagemAmigavel(b.error, "Não foi possível carregar os backups.")}
        </div>
      )}

      {b.dias.length === 0 && !b.loading && (
        <div className="mt-3 text-xs" style={{ color: C.inkFaint }}>
          Ainda não há backups diários.
        </div>
      )}

      <div className="mt-3 space-y-1.5 max-h-96 overflow-y-auto">
        {b.dias.map((d) => {
          const linhas = aberto === d.id ? linhasDoBackup(retrato[d.id]) : [];
          return (
            <div key={d.id} className="rounded-md px-2.5 py-2" style={{ background: C.panel2 }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: C.ink }}>
                    {fmtDate(d.backup_date)}
                  </div>
                  <div className="text-[11px]" style={{ color: C.inkSoft }}>
                    {resumoDoBackup(d)} · {d.origem === "automatico" ? "automático" : "manual"}{" "}
                    {fmtHora(d.taken_at)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => ver(d)}
                    aria-label={`${aberto === d.id ? "Ocultar" : "Ver"} backup de ${fmtDate(d.backup_date)}`}
                    className="btn-press flex items-center gap-1 px-2 py-1 rounded-md"
                    style={{
                      background: C.panel,
                      color: C.inkSoft,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    {aberto === d.id ? <EyeOff size={12} /> : <Eye size={12} />}
                    {aberto === d.id ? "Ocultar" : "Ver"}
                  </button>
                  <button
                    type="button"
                    onClick={() => baixar(d, "csv")}
                    disabled={ocupado === `${d.id}:csv`}
                    aria-label={`Baixar CSV de ${fmtDate(d.backup_date)}`}
                    className="btn-press px-2 py-1 rounded-md"
                    style={{ background: C.amberSoft, color: C.amber }}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => baixar(d, "json")}
                    disabled={ocupado === `${d.id}:json`}
                    aria-label={`Baixar JSON de ${fmtDate(d.backup_date)}`}
                    className="btn-press px-2 py-1 rounded-md"
                    style={{
                      background: C.panel,
                      color: C.inkSoft,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    JSON
                  </button>
                </div>
              </div>

              {aberto === d.id && (
                <ul className="mt-2 space-y-1">
                  {linhas.length === 0 && (
                    <li className="text-[11px]" style={{ color: C.inkFaint }}>
                      Nenhuma reserva neste dia.
                    </li>
                  )}
                  {linhas.map((l, i) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: lista só de leitura do retrato, sem reordenar
                      key={i}
                      className="text-[12px] rounded px-2 py-1"
                      style={{
                        background: C.panel,
                        color: l.status === "cancelada" ? C.inkFaint : C.ink,
                        textDecoration: l.status === "cancelada" ? "line-through" : "none",
                        overflowWrap: "anywhere",
                      }}
                    >
                      <b>{l.sentido}</b> · {l.ponto} · {l.quantidade}P
                      {l.endereco ? ` · ${l.endereco}` : ""} · {l.nome || "—"} · {l.telefone}
                      {l.status === "cancelada" ? " · cancelada" : ""}
                      {l.apagada ? " · apagada" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
