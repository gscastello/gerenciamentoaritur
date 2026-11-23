// A folha de estilo da letra no <head> segura o script do app até o Google responder: com a internet
// ruim (ou o Google fora do ar) a tela não abria. Pedida depois que o app já está de pé, ela só troca
// a letra quando chega (display=swap) — issue #494.
const INTER =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";

export function carregarFonte(doc = document) {
  if (doc.querySelector("link[data-fonte]")) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = INTER;
  link.dataset.fonte = "inter";
  doc.head.appendChild(link);
}
