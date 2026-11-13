// src/lib/textoDoArquivo.js
//
// Texto de um arquivo enviado pela pessoa. Extrato de banco (OFX/CSV) costuma vir
// em Windows-1252 (acentos quebram se lido como UTF-8): tenta UTF-8 estrito e,
// se não for, lê como Windows-1252.

export async function textoDoArquivo(arquivo) {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
