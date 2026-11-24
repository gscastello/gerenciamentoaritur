// src/hooks/useVoz.js
//
// Fala → texto (issue #516): junta o gravador do aparelho com a transcrição do servidor. E texto → fala
// (leitura da resposta em voz alta), quando a pessoa liga.

import { useCallback, useEffect, useState } from "react";
import { logTecnico } from "../lib/erros.js";
import { assistenteService } from "../services/assistenteService";
import { useGravador } from "./useGravador.js";

/** @param {{ onTexto: (t: string) => void, onErro?: (m: string) => void }} p */
export function useVoz({ onTexto, onErro }) {
  const [transcrevendo, setTranscrevendo] = useState(false);
  const gravador = useGravador({
    onErro,
    onAudio: async (audio) => {
      setTranscrevendo(true);
      try {
        onTexto(await assistenteService.transcrever(audio));
      } catch (e) {
        logTecnico(e, { origem: "useVoz.transcrever" });
        onErro?.(
          e?.retryable
            ? "Sem conexão para entender a fala. Tente de novo."
            : e?.message || "Não entendi. Fale de novo.",
        );
      } finally {
        setTranscrevendo(false);
      }
    },
  });
  return { ...gravador, transcrevendo };
}

const CHAVE = "assistente.falar.v1";

function lerPreferencia() {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    return false;
  }
}

/** Ler as respostas em voz alta: preferência deste aparelho. */
export function useLeituraEmVoz() {
  const disponivel = typeof window !== "undefined" && "speechSynthesis" in window;
  const [ligada, setLigada] = useState(() => disponivel && lerPreferencia());
  const calar = useCallback(() => disponivel && window.speechSynthesis.cancel(), [disponivel]);
  useEffect(() => calar, [calar]);

  const alternar = useCallback(() => {
    setLigada((antes) => {
      const nova = !antes;
      try {
        localStorage.setItem(CHAVE, nova ? "1" : "0");
      } catch {
        /* sem armazenamento: vale só agora */
      }
      if (!nova) window.speechSynthesis?.cancel();
      return nova;
    });
  }, []);

  const falar = useCallback(
    (texto) => {
      if (!disponivel || !texto) return;
      window.speechSynthesis.cancel();
      const fala = new SpeechSynthesisUtterance(texto);
      fala.lang = "pt-BR";
      fala.rate = 1.05;
      const voz = window.speechSynthesis.getVoices().find((v) => /pt[-_]BR/i.test(v.lang));
      if (voz) fala.voice = voz;
      window.speechSynthesis.speak(fala);
    },
    [disponivel],
  );

  return { disponivel, ligada, alternar, falar, calar };
}
