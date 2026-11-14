// src/app/tabs/LancarPorFoto.jsx
//
// "Lançar por foto" (issues #362 e #369): fotografe a nota, a IA lê valor, data,
// fornecedor e categoria (e litros/placa no diesel), e a pessoa confere antes de
// lançar. Usado no Financeiro (despesa) e na Operação (abastecimento/manutenção).

import { Camera, Check, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { todayStr } from "../../domain/format.js";
import { DESTINOS, formDaLeitura } from "../../domain/lancamentoPorFoto.js";
import { useLancarPorFoto } from "../../hooks/useLancarPorFoto.js";
import { useMaintenanceTypes } from "../../hooks/useMaintenanceTypes.js";
import { useVehicles } from "../../hooks/useVehicles.js";
import { mensagemAmigavel } from "../../lib/erros.js";
import { Presence, ProgressBar, fadeScale } from "../../ui/motion/index.js";
import { C, ErrorBanner, Field, Select, TextInput, useCategorias } from "../tabShared.jsx";

const ROTULO_LANCADO = {
  despesa: "Despesa lançada.",
  abastecimento: "Abastecimento lançado (a despesa entra sozinha no Financeiro).",
  manutencao: "Manutenção lançada (a despesa entra sozinha no Financeiro).",
};

/** `destino`: o mais provável nesta tela ("despesa" no Financeiro, "abastecimento" na Operação). */
export function LancarPorFoto({ destino = "despesa" }) {
  const foto = useLancarPorFoto();
  const { vehicles } = useVehicles();
  const tiposManut = useMaintenanceTypes();
  const cats = useCategorias();
  const inputRef = useRef(null);
  const idInput = useId();
  const [form, setForm] = useState(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const escolher = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // a mesma foto pode ser escolhida de novo
    if (!arquivo) return;
    setErro("");
    setAviso("");
    try {
      const r = await foto.ler(arquivo, destino);
      const inicial = formDaLeitura(r.leitura, { hoje: todayStr(), veiculos: vehicles });
      setForm(inicial);
      if (!r.leitura?.legivel) setAviso("Não deu para ler tudo: confira e complete os campos.");
      else if (r.leitura?.observacao) setAviso(`Conferir: ${r.leitura.observacao}`);
    } catch (err) {
      setErro(mensagemAmigavel(err, "Não consegui ler a foto. Tente de novo ou lance à mão."));
    }
  };

  const lancar = async () => {
    setErro("");
    try {
      const destinoFeito = await foto.lancar(form);
      setForm(null);
      setAviso(ROTULO_LANCADO[destinoFeito] ?? "Lançado.");
    } catch (err) {
      setErro(mensagemAmigavel(err, "Não foi possível lançar."));
    }
  };

  const descartar = async () => {
    setForm(null);
    setAviso("");
    await foto.descartar();
  };

  const campo = (nome) => ({
    value: form?.[nome] ?? "",
    onChange: (e) => setForm((f) => ({ ...f, [nome]: e.target.value })),
  });

  return (
    <div className="mb-3">
      <input
        ref={inputRef}
        id={idInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={escolher}
        data-testid="foto-da-nota"
      />
      {!form && (
        <button
          type="button"
          id="lancar-por-foto"
          onClick={() => inputRef.current?.click()}
          disabled={foto.lendo}
          className="btn-press w-full flex items-center justify-center gap-2 text-sm px-3 py-2.5 rounded-lg font-semibold disabled:opacity-60"
          style={{ background: C.panel2, color: C.ink, border: `1px dashed ${C.inkFaint}` }}
        >
          <Camera size={16} /> {foto.lendo ? "Lendo a nota…" : "Lançar por foto da nota"}
        </button>
      )}
      {foto.lendo && (
        <div className="mt-2">
          <ProgressBar label="Lendo a nota" />
        </div>
      )}
      {erro && (
        <ErrorBanner className="mt-2" onDismiss={() => setErro("")}>
          {erro}
        </ErrorBanner>
      )}
      {aviso && !erro && (
        <output className="block text-xs mt-2" style={{ color: form ? C.brandText : C.green }}>
          {aviso}
        </output>
      )}
      <Presence when={!!form} duration={200} {...fadeScale}>
        {form && (
          <div
            className="mt-2 rounded-xl p-3 space-y-2"
            style={{ background: C.panel2, border: `1px solid ${C.border}` }}
            data-testid="conferir-nota"
          >
            <div className="text-sm font-semibold">Confira e lance</div>
            <div className="flex flex-wrap gap-1.5">
              {DESTINOS.map((d) => {
                const ativo = form.destino === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, destino: d.id }))}
                    aria-pressed={ativo}
                    className="btn-press text-xs px-3 py-1.5 rounded-full font-medium"
                    style={{
                      background: ativo ? C.amber : C.panel,
                      color: ativo ? C.onBrand : C.inkSoft,
                      border: `1px solid ${ativo ? C.amber : C.border}`,
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Data">
                <TextInput type="date" {...campo("data")} />
              </Field>
              <Field label="Valor (R$)">
                <TextInput inputMode="decimal" {...campo("valor")} />
              </Field>
            </div>
            {form.destino === "despesa" && (
              <Field label="Categoria">
                <Select {...campo("categoria")}>
                  {cats.despesa.concat(cats.gestao).map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {form.destino !== "despesa" && (
              <Field label="Veículo">
                <Select {...campo("veiculoId")}>
                  <option value="">Escolha…</option>
                  {(vehicles ?? []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} {v.plate ? `· ${v.plate}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {form.destino === "abastecimento" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Litros">
                  <TextInput inputMode="decimal" {...campo("litros")} />
                </Field>
                <Field label="Km rodados desde o último">
                  <TextInput inputMode="numeric" {...campo("kmRodados")} />
                </Field>
              </div>
            )}
            {form.destino === "manutencao" && (
              <>
                <Field label="Tipo">
                  <Select {...campo("tipoManutencao")}>
                    <option value="">Escolha…</option>
                    {(tiposManut.tipos ?? []).map((t) => (
                      <option key={t.id} value={t.label}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Hodômetro (km)">
                    <TextInput inputMode="numeric" {...campo("odometro")} />
                  </Field>
                  <Field label="Repete a cada (km)">
                    <TextInput inputMode="numeric" {...campo("intervaloKm")} />
                  </Field>
                </div>
              </>
            )}
            <Field label="Descrição">
              <TextInput {...campo("descricao")} />
            </Field>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={lancar}
                disabled={foto.salvando}
                className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold disabled:opacity-50"
                style={{ background: C.amber, color: C.onBrand }}
              >
                <Check size={14} /> {foto.salvando ? "Lançando…" : "Lançar"}
              </button>
              <button
                type="button"
                onClick={descartar}
                disabled={foto.salvando}
                className="btn-press flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
                style={{ background: C.panel, color: C.inkSoft }}
              >
                <X size={14} /> Descartar
              </button>
            </div>
          </div>
        )}
      </Presence>
    </div>
  );
}
