// supabase/functions/_shared/documentoPuro.ts
//
// Leitura de nota/recibo por foto (issues #362 e #369). Módulo PURO: o que se
// pede ao modelo e a conferência do que ele devolveu. A IA só LÊ: nada é lançado
// sem a pessoa conferir e confirmar no app, e o que não passa na conferência
// (valor absurdo, data impossível, categoria que não existe) volta vazio para a
// pessoa preencher, em vez de um chute.

export type TipoDeDocumento = "despesa" | "abastecimento" | "manutencao" | "outro";

export type Leitura = {
  tipo: TipoDeDocumento;
  legivel: boolean;
  data: string | null; // YYYY-MM-DD
  valor: number | null; // total pago, em reais
  fornecedor: string | null;
  descricao: string | null;
  categoria: string | null; // slug de expense_categories (despesa)
  litros: number | null;
  preco_litro: number | null;
  odometro_km: number | null;
  placa: string | null;
  tipo_manutencao: string | null; // um dos maintenance_types
  observacao: string | null;
};

export type ContextoDaLeitura = {
  hoje: string; // YYYY-MM-DD em São Luís
  categorias: { slug: string; label: string }[];
  tiposDeManutencao: string[];
  tipoEsperado?: TipoDeDocumento | null;
};

const TIPOS: TipoDeDocumento[] = ["despesa", "abastecimento", "manutencao", "outro"];

export const FERRAMENTA_DE_LEITURA = {
  name: "registrar_leitura",
  description: "Registra o que está escrito na nota, cupom ou recibo da foto.",
  input_schema: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: TIPOS, description: "abastecimento = combustível; manutencao = oficina, peça, pneu, óleo; despesa = o resto." },
      legivel: { type: "boolean", description: "false se a foto não é de nota/recibo ou não dá para ler o valor." },
      data: { type: "string", description: "Data da compra no formato AAAA-MM-DD. Vazio se não aparece." },
      valor: { type: "number", description: "VALOR TOTAL pago, em reais (ex.: 350.5). Vazio se não aparece." },
      fornecedor: { type: "string", description: "Nome do posto, loja ou oficina." },
      descricao: { type: "string", description: "O que foi comprado, em poucas palavras (ex.: 'Diesel S10', 'Troca de óleo e filtro')." },
      categoria: { type: "string", description: "Slug da categoria de despesa da lista." },
      litros: { type: "number", description: "Só abastecimento: litros." },
      preco_litro: { type: "number", description: "Só abastecimento: preço por litro." },
      odometro_km: { type: "number", description: "Quilometragem do veículo, se estiver escrita na nota." },
      placa: { type: "string", description: "Placa do veículo, se estiver escrita." },
      tipo_manutencao: { type: "string", description: "Só manutenção: um dos tipos da lista." },
      observacao: { type: "string", description: "Algo que a pessoa precisa conferir (ex.: 'valor meio apagado')." },
    },
    required: ["tipo", "legivel"],
  },
} as const;

export function instrucoesDeLeitura(ctx: ContextoDaLeitura): string {
  const cats = ctx.categorias.map((c) => `- ${c.slug}: ${c.label}`).join("\n");
  const esperado = ctx.tipoEsperado ? `\nA pessoa abriu a tela de ${ctx.tipoEsperado}: é o mais provável, mas siga o que a nota mostra.` : "";
  return `Você lê fotos de notas fiscais, cupons e recibos de uma empresa de transporte de passageiros (van entre São Luís, Pirapemas e Cantanhede, no Maranhão) e registra o que está escrito, chamando registrar_leitura.

Regras:
- Só o que está ESCRITO na foto. Não invente nem estime: campo que não aparece fica vazio.
- valor = o TOTAL pago (não o subtotal, não o troco, não o valor recebido).
- Números brasileiros: "1.234,56" é 1234.56.
- data no formato AAAA-MM-DD. Hoje é ${ctx.hoje}.
- Se a foto não é de nota/recibo, ou não dá para ler o valor, legivel=false.
- categoria: um dos slugs abaixo (combustível → combustivel; oficina/peça → manutencao).
${cats}
- tipo_manutencao (só manutenção), um destes: ${ctx.tiposDeManutencao.join(", ")}.${esperado}`;
}

const texto = (v: unknown, max = 120): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** "1.234,56" | "350,5" | 350.5 → número; vazio/inválido → null. */
export function numeroBr(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[R$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const dentro = (n: number | null, min: number, max: number) => (n != null && n > min && n < max ? n : null);
const centavos = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);

function dataValida(v: unknown, hoje: string): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T12:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return null;
  const h = Date.parse(`${hoje}T12:00:00Z`);
  const dias = (t - h) / 86400000;
  return dias > 1 || dias < -400 ? null : s; // nada do futuro nem de mais de um ano atrás
}

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Confere e limpa a leitura bruta do modelo. */
export function normalizarLeitura(bruta: Record<string, unknown> | null | undefined, ctx: ContextoDaLeitura): Leitura {
  const b = bruta ?? {};
  const litros = dentro(numeroBr(b.litros), 0, 2000);
  const valor = centavos(dentro(numeroBr(b.valor), 0, 100000));
  let precoLitro = dentro(numeroBr(b.preco_litro), 0, 50);
  if (precoLitro == null && litros && valor) precoLitro = Math.round((valor / litros) * 1000) / 1000;

  let tipo: TipoDeDocumento = TIPOS.includes(b.tipo as TipoDeDocumento) ? (b.tipo as TipoDeDocumento) : "despesa";
  const slugs = new Set(ctx.categorias.map((c) => c.slug));
  let categoria = typeof b.categoria === "string" && slugs.has(b.categoria) ? b.categoria : null;
  if (litros && (categoria === "combustivel" || tipo === "abastecimento")) tipo = "abastecimento";
  if (tipo === "abastecimento") categoria = slugs.has("combustivel") ? "combustivel" : categoria;
  if (tipo === "manutencao" && !categoria && slugs.has("manutencao")) categoria = "manutencao";
  if (!categoria && slugs.has("outro")) categoria = "outro";

  const pedido = semAcento(String(b.tipo_manutencao ?? ""));
  const tipoManutencao = tipo === "manutencao"
    ? (ctx.tiposDeManutencao.find((t) => semAcento(t) === pedido) ??
      (ctx.tiposDeManutencao.includes("Outro") ? "Outro" : null))
    : null;

  const placa = texto(b.placa, 10)?.toUpperCase().replace(/[^A-Z0-9-]/g, "") || null;
  return {
    tipo,
    legivel: b.legivel !== false && valor != null,
    data: dataValida(b.data, ctx.hoje),
    valor,
    fornecedor: texto(b.fornecedor),
    descricao: texto(b.descricao),
    categoria,
    litros: litros == null ? null : Math.round(litros * 1000) / 1000,
    preco_litro: precoLitro,
    odometro_km: dentro(numeroBr(b.odometro_km), 0, 3_000_000),
    placa,
    tipo_manutencao: tipoManutencao,
    observacao: texto(b.observacao, 200),
  };
}

/** Tipos de imagem que a API aceita. */
export const TIPOS_DE_IMAGEM = ["image/jpeg", "image/png", "image/webp"] as const;

/** Confere o pedido do app: imagem em base64 de até ~5 MB e um tipo aceito. */
export function imagemValida(b: { imagem?: unknown; media_type?: unknown }): { ok: true; dados: string; tipo: string } | { ok: false; erro: string } {
  const tipo = String(b.media_type ?? "image/jpeg");
  if (!(TIPOS_DE_IMAGEM as readonly string[]).includes(tipo)) return { ok: false, erro: "Envie uma foto (JPG, PNG ou WEBP)." };
  const dados = String(b.imagem ?? "").replace(/^data:[^,]+,/, "");
  if (dados.length < 100) return { ok: false, erro: "Foto vazia." };
  if (dados.length > 7_000_000) return { ok: false, erro: "Foto grande demais." };
  if (!/^[A-Za-z0-9+/=]+$/.test(dados)) return { ok: false, erro: "Foto inválida." };
  return { ok: true, dados, tipo };
}
