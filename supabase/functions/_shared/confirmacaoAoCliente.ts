// supabase/functions/_shared/confirmacaoAoCliente.ts
//
// Confirmação ao cliente da reserva lançada pelo "Agendado ☑️" (issue #310) — regra
// PURA, sem rede. O cliente é quem mais sabe o que pediu: o bot devolve um resumo
// curto (sentido, dia, embarque, desembarque, quantidade) e pede para avisar se algo
// estiver diferente. Se faltou o endereço ou o dia da volta, pede na mesma mensagem.
// Nunca cita valor (preço é da tabela e a equipe confirma) e nunca usa o nome do
// perfil do WhatsApp: só o do cadastro.

export type ReservaParaConfirmar = {
  tipo: "passagem" | "encomenda";
  direcao: "ida" | "volta";
  /** AAAA-MM-DD */
  data: string;
  pontoCodigo: string | null;
  pontoNome: string | null;
  bairro: string | null;
  detalhe: string | null;
  desembarque: string | null;
  quantidade: number;
  /** o que ficou para confirmar (extra_data.a_confirmar) */
  aConfirmar: string[];
  /** nome do passageiro quando a vaga é de OUTRA pessoa (marcada por quem conversa) */
  passageiro?: string | null;
};

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const somar = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "de hoje, quarta (11/11)", "de amanhã, quinta (12/11)", "de sexta (14/11)". */
export function rotuloDoDia(data: string, hoje: string): string {
  const semana = SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()];
  const ddmm = `${data.slice(8, 10)}/${data.slice(5, 7)}`;
  if (data === hoje) return `de hoje, ${semana} (${ddmm})`;
  if (data === somar(hoje, 1)) return `de amanhã, ${semana} (${ddmm})`;
  return `de ${semana} (${ddmm})`;
}

/** Tira as marcas internas do app ("Endereço a confirmar", "· confirmar com o cliente…"). */
function limpar(t: string | null | undefined): string {
  return String(t ?? "")
    .replace(/endereço a confirmar|bairro a confirmar/gi, "")
    .replace(/·?\s*confirmar com o cliente se a volta é no mesmo dia/gi, "")
    .replace(/\s*\(\s*\)/g, "") // "Avenida São Luís Rei de França ()" (issue #401)
    .replace(/\s*[·,;-]\s*$/g, "")
    .replace(/^\s*[·,;-]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function embarque(r: ReservaParaConfirmar): string {
  const detalhe = limpar(r.detalhe);
  if (r.direcao === "volta") {
    const cidade = r.pontoNome ?? r.pontoCodigo ?? "";
    return detalhe ? `${cidade} (${detalhe})` : cidade;
  }
  if (r.pontoCodigo === "busca") {
    const onde = [r.bairro, detalhe].filter(Boolean).join(", ");
    return onde ? `busca em casa (${onde})` : "busca em casa";
  }
  const nome = r.pontoNome ?? r.pontoCodigo ?? "";
  return detalhe && !nome.toLowerCase().includes(detalhe.toLowerCase()) ? `${nome} (${detalhe})` : nome;
}

function linha(r: ReservaParaConfirmar, hoje: string): string {
  const sentido = r.direcao === "ida" ? "Ida" : "Volta";
  const dia = rotuloDoDia(r.data, hoje);
  const quem = r.passageiro ? `${r.passageiro}: ` : "";
  const desce = limpar(r.desembarque);
  if (r.tipo === "encomenda") {
    return `📦 ${quem}Encomenda na ${sentido} ${dia}${desce ? `, para ${desce}` : ""}`;
  }
  const qtd = `${r.quantidade} ${r.quantidade === 1 ? "passagem" : "passagens"}`;
  const de = embarque(r);
  return `🚐 ${quem}${sentido} ${dia}: ${de ? `sai de ${de}` : "embarque a confirmar"}${desce ? ` e desce em ${desce}` : ""} · ${qtd}`;
}

/** Só a primeira palavra do nome do cadastro ("Auristelia Coutinho" → "Auristelia"). */
export function primeiroNome(nome: string | null | undefined): string | null {
  const p = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  return p.length >= 2 ? p : null;
}

/**
 * A mensagem para o cliente, ou null se não há nada a confirmar. `nome` é o do
 * CADASTRO (nunca o do perfil do WhatsApp).
 */
export function mensagemDeConfirmacao(
  reservas: ReservaParaConfirmar[],
  ctx: { hoje: string; nome?: string | null; atualizacao?: boolean },
): string | null {
  if (!reservas.length) return null;
  const ordenadas = [...reservas].sort((a, b) =>
    a.data === b.data ? (a.direcao === b.direcao ? 0 : a.direcao === "ida" ? -1 : 1) : a.data < b.data ? -1 : 1
  );
  const nome = primeiroNome(ctx.nome);
  const so = ordenadas.length === 1;
  const encomenda = ordenadas.every((r) => r.tipo === "encomenda");
  const abertura = ctx.atualizacao
    // o revisor corrigiu algo (issue #339): o cliente vê como ficou
    ? `${nome ? `${nome}, a` : "A"}tualizei sua${so ? "" : "s"} reserva${so ? "" : "s"}. Ficou assim:`
    : encomenda
    ? `Prontinho${nome ? `, ${nome}` : ""}! ✅ ${so ? "Sua encomenda está registrada" : "Suas encomendas estão registradas"}:`
    : `Prontinho${nome ? `, ${nome}` : ""}! ✅ ${so ? "Sua vaga está reservada" : "Suas vagas estão reservadas"}:`;

  const pedidos: string[] = [];
  const faltaEndereco = ordenadas.some((r) => r.tipo === "passagem" && r.aConfirmar.includes("endereco"));
  const faltaDiaDaVolta = ordenadas.some((r) => r.direcao === "volta" && r.aConfirmar.includes("dia_da_volta"));
  if (faltaEndereco) pedidos.push("📍 Me manda, por favor, o endereço onde a van te pega.");
  if (faltaDiaDaVolta) pedidos.push("📅 A volta é no mesmo dia? Se for outro dia, me avisa qual.");
  if (ordenadas.some((r) => r.tipo === "encomenda")) pedidos.push("A equipe confirma com você o valor da encomenda.");

  return [
    abertura,
    "",
    ...ordenadas.map((r) => linha(r, ctx.hoje)),
    ...(pedidos.length ? ["", ...pedidos] : []),
    "",
    "Se algo estiver diferente, é só me responder aqui. 😊",
  ].join("\n");
}
