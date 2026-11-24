// src/domain/botCasos.js
//
// Casos do bot que mudaram depois do "Agendado ☑️" (issue #508, database/133): regras puras
// para mostrar ao dono o que a marca lançou, o que ficou depois da mensagem do cliente e o
// motivo. Quem decide qual vale é o dono (`rpc_conferir_caso_bot`), nunca a conta.

const ddmm = (d) =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)
    ? `${d.slice(8, 10)}/${d.slice(5, 7)}`
    : "dia ?";

/** "Ida 24/11 · rodoviaria · 3P · Cohatrac" */
export function rotuloDaViagemDoCaso(v) {
  if (!v) return "—";
  const sentido = v.direction === "volta" ? "Volta" : v.direction === "ida" ? "Ida" : "?";
  const partes = [`${sentido} ${ddmm(v.trip_date)}`, v.route_point_code || "sem ponto"];
  partes.push(`${Number(v.quantity) || 1}P`);
  if (v.pickup_neighborhood) partes.push(v.pickup_neighborhood);
  if (v.type === "encomenda") partes.push("encomenda");
  return partes.join(" · ");
}

/**
 * Uma linha por reserva que mudou: o da marca (de) e o de agora (para), com os campos.
 * Ignora o que veio torto do banco em vez de quebrar a tela.
 */
export function mudancasDoCaso(caso) {
  const lista = Array.isArray(caso?.mudou_depois?.mudancas) ? caso.mudou_depois.mudancas : [];
  return lista
    .filter((m) => m && typeof m === "object")
    .map((m) => ({
      reserva: m.reservation_id ?? "",
      em: m.em ?? null,
      campos: Array.isArray(m.campos) ? m.campos : [],
      daMarca: rotuloDaViagemDoCaso(m.de),
      deAgora: rotuloDaViagemDoCaso(m.para),
    }));
}

/** Mensagens do cliente depois da marca (até a mudança), só as com texto. */
export function mensagensDoCaso(caso) {
  const lista = Array.isArray(caso?.mudou_depois?.mensagens) ? caso.mudou_depois.mensagens : [];
  return lista.filter((m) => m && String(m.texto ?? "").trim() !== "");
}

/** Diferenças da última avaliação, sem o aviso fixo de "conferir" (a tela já diz). */
export function diferencasDoCaso(caso, aviso = "mudou depois da marca: conferir") {
  const d = caso?.avaliacao?.diferencas;
  return Array.isArray(d) ? d.filter((t) => typeof t === "string" && t !== aviso) : [];
}

/** Chave do que a avaliação compara (igual a `fn_chave_do_esperado` do banco): dia, sentido, ponto, quantidade, bairro. */
export function chaveDoEsperado(esperado) {
  if (!Array.isArray(esperado)) return "";
  return esperado
    .filter((e) => e && typeof e === "object")
    .map((e) =>
      [
        e.trip_date ?? "",
        e.direction ?? "",
        e.route_point_code ?? "",
        String(Number.parseInt(e.quantity, 10) || 1),
        String(e.pickup_neighborhood ?? "").toLowerCase(),
      ].join("|"),
    )
    .sort()
    .join(";");
}

/**
 * Sugestão do bot para o caso (issues #504 e #508): o que ele acha que vale, com as notas. `vale` é
 * "marca" ou "agora" quando a sugestão é igual a um dos dois botões; "outro" quando mistura (um campo
 * do da marca, outro do de agora). Incerta = sem prova no texto do cliente: não sugere nada.
 */
export function sugestaoDoCaso(caso) {
  const md = caso?.mudou_depois;
  const s = md?.sugestao;
  if (!s || typeof s !== "object" || !Array.isArray(s.esperado)) return null;
  const notas = Array.isArray(s.notas)
    ? s.notas.filter((n) => typeof n === "string" && n.trim())
    : [];
  if (s.incerto !== false) return { vale: null, incerto: true, notas };
  const chave = chaveDoEsperado(s.esperado);
  const vale =
    chave === chaveDoEsperado(md.esperado_da_marca)
      ? "marca"
      : chave === chaveDoEsperado(md.esperado_de_agora)
        ? "agora"
        : "outro";
  return { vale, incerto: false, notas };
}

/** "O bot acertou 7 de 9 conferências (78%)." — ou null sem conferência ainda. */
export function textoDoPlacar(placar) {
  const certo = Number(placar?.concordou) || 0;
  const total = certo + (Number(placar?.discordou) || 0);
  if (!total) return null;
  return `A sugestão do bot bateu com a sua em ${certo} de ${total} conferência(s) (${Math.round((certo / total) * 100)}%).`;
}
