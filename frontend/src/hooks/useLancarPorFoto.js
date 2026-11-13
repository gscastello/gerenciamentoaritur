// src/hooks/useLancarPorFoto.js
//
// Lançar por foto (issues #362 e #369): reduz a foto, pede a leitura à IA e,
// depois que a pessoa confere, grava no destino certo — despesa, abastecimento
// ou manutenção (esses dois geram a despesa sozinhos, pelos gatilhos do banco).
// As telas abertas atualizam pelo Realtime de sempre.

import { useCallback, useState } from "react";
import { lancamentoDoForm } from "../domain/lancamentoPorFoto.js";
import { reduzirFoto } from "../lib/imagem.js";
import { documentosService } from "../services/documentosService";
import { financeService } from "../services/financeService";
import { operationService } from "../services/operationService";

export function useLancarPorFoto() {
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [leitura, setLeitura] = useState(null); // { id, leitura }

  const ler = useCallback(async (arquivo, tipo) => {
    setLendo(true);
    try {
      const foto = await reduzirFoto(arquivo);
      const r = await documentosService.ler({ ...foto, tipo });
      setLeitura(r);
      return r;
    } finally {
      setLendo(false);
    }
  }, []);

  /** Grava o formulário conferido. Lança { message } se faltar algo. */
  const lancar = useCallback(
    async (form) => {
      const l = lancamentoDoForm(form);
      if (!l.ok) throw new Error(l.erro);
      setSalvando(true);
      try {
        let ids = {};
        if (l.destino === "abastecimento") {
          const r = await operationService.addFuelRecord(l.dados);
          ids = { fuelRecordId: r?.id };
        } else if (l.destino === "manutencao") {
          const r = await operationService.addMaintenance(l.dados);
          ids = { maintenanceId: r?.id };
        } else {
          const r = await financeService.addManualEntry(l.dados);
          ids = { financialEntryId: r?.id };
        }
        if (leitura?.id) {
          // a ligação com a foto é melhor esforço: o lançamento já está feito
          await documentosService.marcar(leitura.id, { status: "lancado", ...ids }).catch(() => {});
        }
        setLeitura(null);
        return l.destino;
      } finally {
        setSalvando(false);
      }
    },
    [leitura],
  );

  const descartar = useCallback(async () => {
    const id = leitura?.id;
    setLeitura(null);
    if (id) await documentosService.marcar(id, { status: "descartado" }).catch(() => {});
  }, [leitura]);

  return { lendo, salvando, leitura, ler, lancar, descartar };
}
