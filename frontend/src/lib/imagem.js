// src/lib/imagem.js
//
// Reduz a foto no próprio aparelho antes de mandar para a leitura (issue #362):
// foto de celular tem 3–8 MB; 1600 px no maior lado em JPEG já lê a nota inteira
// e cabe folgado no envio, mesmo no 3G da estrada.

const LADO_MAXIMO = 1600;
const QUALIDADE = 0.82;

function carregar(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir a foto."));
    };
    img.src = url;
  });
}

/** Arquivo de imagem → { imagem (base64, sem prefixo), mediaType }. */
export async function reduzirFoto(arquivo) {
  if (!arquivo?.type?.startsWith("image/")) throw new Error("Escolha uma foto da nota.");
  const img = await carregar(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * escala);
  canvas.height = Math.round(img.naturalHeight * escala);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", QUALIDADE);
  return { imagem: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
}
