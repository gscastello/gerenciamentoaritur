// src/ui/BotaoDitado.jsx
//
// Microfone da anotação rápida (issue #258). Usa o reconhecimento de voz do
// próprio navegador (Chrome/Android/Edge — sem custo, sem enviar áudio para o
// nosso servidor). Navegador sem suporte não mostra o botão. O texto ditado vai
// para o campo para a pessoa conferir: nada é salvo sozinho.

import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MENSAGENS_DE_ERRO = {
  "not-allowed": "Permita o uso do microfone no navegador para ditar.",
  "service-not-allowed": "Permita o uso do microfone no navegador para ditar.",
  "no-speech": "Não ouvi nada. Toque no microfone e fale de novo.",
  "audio-capture": "Nenhum microfone encontrado.",
  network: "Sem internet para reconhecer a voz.",
};

function reconhecedorDoNavegador() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * @param {{ onTexto: (fala: string) => void, onErro?: (msg: string) => void,
 *   rotulo?: string, cores: { ativo: string, ativoTexto: string, fundo: string, texto: string } }} props
 */
export function BotaoDitado({ onTexto, onErro, rotulo = "Ditar anotação", cores }) {
  const [ouvindo, setOuvindo] = useState(false);
  const atual = useRef(null);
  const Reconhecedor = reconhecedorDoNavegador();

  // sair da tela no meio do ditado não deixa o microfone aberto
  useEffect(() => () => atual.current?.abort?.(), []);

  if (!Reconhecedor) return null;

  const alternar = () => {
    if (ouvindo) {
      atual.current?.stop?.();
      return;
    }
    const r = new Reconhecedor();
    r.lang = "pt-BR";
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const fala = Array.from(e.results)
        .map((res) => res[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (fala) onTexto(fala);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted")
        onErro?.(MENSAGENS_DE_ERRO[e.error] || "Não entendi. Tente de novo.");
    };
    r.onend = () => setOuvindo(false);
    atual.current = r;
    setOuvindo(true);
    try {
      r.start();
    } catch {
      setOuvindo(false);
      onErro?.("Não foi possível ligar o microfone.");
    }
  };

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={ouvindo ? "Parar de ouvir" : rotulo}
      aria-pressed={ouvindo}
      title={ouvindo ? "Ouvindo… toque para parar" : rotulo}
      className="btn-press shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
      style={{
        background: ouvindo ? cores.ativo : cores.fundo,
        color: ouvindo ? cores.ativoTexto : cores.texto,
      }}
    >
      {ouvindo ? <MicOff size={13} /> : <Mic size={13} />}
    </button>
  );
}
