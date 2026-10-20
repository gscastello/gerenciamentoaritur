// supabase/functions/_shared/confusaoLocal.ts
//
// Passageiros se confundem entre EMBARQUE e DESEMBARQUE. Exemplo real: o
// passageiro está em Pirapemas indo para São Luís (Volta); o bot pede o
// endereço para buscá-lo e ele responde "retorno" — mas Retorno é um local
// de desembarque em São Luís. Aqui a regra de detecção e as mensagens de
// correção, sem I/O e sem env vars (testável).
//
// Conceito: numa mesma direção, os locais de EMBARQUE (route_points) e os de
// DESEMBARQUE (dropoff_areas) são conjuntos diferentes. Se a resposta é
// (só) o nome de um local do OUTRO lado, é provável que o passageiro tenha
// confundido — o bot explica e repete a pergunta em vez de gravar errado.
//
// Detecção conservadora: só dispara quando a resposta é essencialmente o
// nome do local ("retorno", "no retorno", "rodoviária de São Luís"). Um
// endereço de verdade ("Rua da Rodoviária, 12") não dispara.

export type Lugar = { codigo: string; nome: string };
export type Lado = "embarque" | "desembarque";
export type Direcao = "ida" | "volta";

/** Códigos genéricos (não são um lugar específico): nunca contam como confusão. */
const CODIGOS_GENERICOS = new Set(["casa", "outro", "busca"]);

/** Apelidos usuais além do nome cadastrado. */
const APELIDOS: Record<string, string[]> = {
  rodoviaria: ["rodoviaria"],
  retorno: ["retorno"],
  postocarone: ["posto carone", "posto do carone", "carone"],
  br: ["br", "br 135", "br135", "beira da br"],
};

const PALAVRAS_DE_LIGACAO = new Set([
  "no", "na", "nos", "nas", "o", "a", "os", "as", "em", "de", "do", "da", "dos", "das",
  "pra", "para", "pro", "ponto", "local", "quero", "vou", "ficar", "descer", "saio", "sair",
  "aqui", "la", "ali", "ai", "e", "eh", "sera", "mesmo",
]);

export function normalizarLugar(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\bsao luis\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function essencia(texto: string): string {
  return normalizarLugar(texto)
    .split(" ")
    .filter((p) => p && !PALAVRAS_DE_LIGACAO.has(p))
    .join(" ");
}

function apelidosDe(l: Lugar): string[] {
  // mesma "essência" do texto do cliente (sem palavras de ligação)
  const base = [essencia(l.nome), essencia(l.codigo.replace(/_/g, " "))];
  const extras = (APELIDOS[l.codigo] ?? []).map(essencia);
  return [...new Set([...base, ...extras].filter(Boolean))];
}

/** O texto, tirando palavras de ligação, é exatamente o nome de algum destes locais? */
export function lugarCitado(texto: string, lugares: Lugar[]): Lugar | null {
  const e = essencia(texto);
  if (!e) return null;
  return (
    lugares
      .filter((l) => !CODIGOS_GENERICOS.has(l.codigo))
      .find((l) => apelidosDe(l).includes(e)) ?? null
  );
}

export type Confusao = { lugar: Lugar };

/**
 * `proprios` = locais do lado que a pergunta pede; `outros` = locais do outro
 * lado. Confusão = a resposta cita um local de `outros` e NÃO de `proprios`.
 */
export function detectarConfusao(opts: {
  texto: string;
  proprios: Lugar[];
  outros: Lugar[];
}): Confusao | null {
  if (lugarCitado(opts.texto, opts.proprios)) return null;
  const lugar = lugarCitado(opts.texto, opts.outros);
  return lugar ? { lugar } : null;
}

/** Cidade/região de cada lado da viagem, para a mensagem de correção. */
export function regiaoDoLado(direcao: Direcao, lado: Lado): string {
  const saoLuis = "São Luís";
  const interior = "Cantanhede, Pirapemas ou região";
  if (direcao === "ida") return lado === "embarque" ? saoLuis : interior;
  return lado === "embarque" ? interior : saoLuis;
}

/**
 * Texto para o cliente: explica a troca e repete a pergunta pendente.
 * `pergunta` é a pergunta do passo atual (ex.: "Qual o endereço onde vamos te buscar?").
 */
export function mensagemLadoErrado(opts: {
  lado: Lado;
  lugar: Lugar;
  direcao: Direcao;
  pergunta: string;
}): string {
  const { lado, lugar, direcao, pergunta } = opts;
  const outroLado: Lado = lado === "embarque" ? "desembarque" : "embarque";
  return (
    `Só para confirmar: *${lugar.nome}* é um local de *${outroLado}*, ` +
    `e agora eu preciso do local de *${lado}* ` +
    `(${lado === "embarque" ? "de onde você vai sair" : "onde você vai ficar"}, ` +
    `em ${regiaoDoLado(direcao, lado)}). ${pergunta}`
  );
}
