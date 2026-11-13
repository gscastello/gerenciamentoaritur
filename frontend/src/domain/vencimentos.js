// src/domain/vencimentos.js
//
// Calendário de vencimentos (issues #366 e #369): situação de cada conta ou
// documento, ordem da lista e o que é preciso para cadastrar. Regra pura.

export const CATEGORIAS_DE_VENCIMENTO = [
  { id: "imposto", label: "Imposto" },
  { id: "veiculo", label: "Veículo (IPVA, licenciamento, vistoria)" },
  { id: "seguro", label: "Seguro" },
  { id: "licenca", label: "Licença (ANTT, autorização, alvará)" },
  { id: "parcela", label: "Parcela / financiamento" },
  { id: "motorista", label: "Motorista" },
  { id: "outro", label: "Outro" },
];

export const RECORRENCIAS = [
  { id: "nenhuma", label: "Uma vez" },
  { id: "mensal", label: "Todo mês" },
  { id: "anual", label: "Todo ano" },
];

const dia = (iso) => Date.parse(`${iso}T12:00:00Z`);

/** Situação: quitado | vencido | prazo (dentro do aviso) | ok; e quantos dias faltam. */
export function situacaoDoVencimento(v, hoje) {
  if (v?.quitado_em) return { tipo: "quitado", dias: null };
  const dias = Math.round((dia(v.vence_em) - dia(hoje)) / 86400000);
  if (dias < 0) return { tipo: "vencido", dias };
  if (dias <= (v.avisar_dias ?? 15)) return { tipo: "prazo", dias };
  return { tipo: "ok", dias };
}

export function textoDaSituacao(s) {
  if (s.tipo === "quitado") return "Quitado";
  if (s.tipo === "vencido") return s.dias === -1 ? "Venceu ontem" : `Venceu há ${-s.dias} dias`;
  if (s.dias === 0) return "Vence hoje";
  if (s.dias === 1) return "Vence amanhã";
  return `Vence em ${s.dias} dias`;
}

const PESO = { vencido: 0, prazo: 1, ok: 2, quitado: 3 };

/** Vencidos primeiro, depois os do prazo, depois o resto; dentro de cada um, por data. */
export function ordenarVencimentos(lista, hoje) {
  return [...(lista ?? [])].sort((a, b) => {
    const pa = PESO[situacaoDoVencimento(a, hoje).tipo];
    const pb = PESO[situacaoDoVencimento(b, hoje).tipo];
    return pa - pb || String(a.vence_em).localeCompare(String(b.vence_em));
  });
}

/** Confere o cadastro: { ok, dados } ou { ok:false, erro }. */
export function vencimentoDoForm(f) {
  const titulo = String(f?.titulo ?? "").trim();
  if (titulo.length < 2) return { ok: false, erro: "Dê um nome (ex.: IPVA do ônibus)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f?.venceEm ?? "")))
    return { ok: false, erro: "Informe a data de vencimento." };
  const valorTxt = String(f?.valor ?? "").trim();
  let valor = null;
  if (valorTxt) {
    valor = Number(
      valorTxt.includes(",") ? valorTxt.replace(/\./g, "").replace(",", ".") : valorTxt,
    );
    if (!Number.isFinite(valor) || valor < 0) return { ok: false, erro: "Valor inválido." };
  }
  const avisar = Number(f?.avisarDias ?? 15);
  if (!Number.isInteger(avisar) || avisar < 0 || avisar > 120)
    return { ok: false, erro: "Avisar de 0 a 120 dias antes." };
  return {
    ok: true,
    dados: {
      titulo,
      categoria: CATEGORIAS_DE_VENCIMENTO.some((c) => c.id === f.categoria) ? f.categoria : "outro",
      vehicle_id: f.vehicleId || null,
      vence_em: f.venceEm,
      valor,
      recorrencia: RECORRENCIAS.some((r) => r.id === f.recorrencia) ? f.recorrencia : "nenhuma",
      avisar_dias: avisar,
      notas: String(f?.notas ?? "").trim() || null,
    },
  };
}
