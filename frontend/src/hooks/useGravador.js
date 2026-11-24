// src/hooks/useGravador.js
//
// Grava a fala pelo microfone (issue #516). O reconhecimento de voz do navegador não funciona direito
// no iPhone (nem no app instalado), então o app grava o áudio e o servidor transcreve. Para sozinho
// quando a pessoa termina de falar, avisa quando não ouve nada e nunca deixa o microfone aberto.

import { useCallback, useEffect, useRef, useState } from "react";

const MAXIMO_MS = 60_000;
const SILENCIO_MS = 1_800;
const SEM_FALA_MS = 7_000;
const LIMIAR = 0.018; // volume (RMS) acima disso é fala
const TIPOS = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

export function gravacaoDisponivel() {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function tipoSuportado() {
  return TIPOS.find((t) => window.MediaRecorder.isTypeSupported?.(t)) ?? "";
}

const MENSAGEM = {
  NotAllowedError: "Permita o microfone para o app nos ajustes do celular e toque de novo.",
  SecurityError: "Permita o microfone para o app nos ajustes do celular e toque de novo.",
  NotFoundError: "Nenhum microfone encontrado.",
  NotReadableError: "Outro app está usando o microfone. Feche e toque de novo.",
};

function base64De(blob) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] ?? "");
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(blob);
  });
}

/**
 * @param {{ onAudio: (a: { base64: string, tipo: string, segundos: number }) => void, onErro?: (m: string) => void }} p
 */
export function useGravador({ onAudio, onErro }) {
  const [gravando, setGravando] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [nivel, setNivel] = useState(0);
  const [ms, setMs] = useState(0);
  const ref = useRef(null);
  const fns = useRef({ onAudio, onErro });
  fns.current = { onAudio, onErro };

  const desligar = useCallback(() => {
    const g = ref.current;
    ref.current = null;
    if (!g) return;
    clearInterval(g.relogio);
    for (const t of g.stream?.getTracks?.() ?? []) t.stop();
    g.audio?.close?.().catch?.(() => {});
    setGravando(false);
    setPreparando(false);
    setNivel(0);
    setMs(0);
  }, []);

  // sair da tela no meio da fala não deixa o microfone aberto
  useEffect(
    () => () => {
      if (ref.current) ref.current.descartar = true;
      desligar();
    },
    [desligar],
  );

  const parar = useCallback((descartar = false) => {
    const g = ref.current;
    if (!g) return;
    g.descartar = g.descartar || descartar;
    if (g.gravador?.state === "recording") g.gravador.stop();
  }, []);

  const iniciar = useCallback(async () => {
    if (ref.current) return;
    if (!gravacaoDisponivel()) {
      fns.current.onErro?.("Este aparelho não deixa gravar pelo app.");
      return;
    }
    const g = { pedacos: [], descartar: false, inicio: 0, ultimaFala: 0, falou: false };
    ref.current = g;
    setPreparando(true);
    try {
      // dentro do toque: o iPhone só libera o áudio assim
      const Contexto = window.AudioContext || window.webkitAudioContext;
      g.audio = Contexto ? new Contexto() : null;
      g.audio?.resume?.();
      g.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (ref.current !== g) {
        for (const t of g.stream.getTracks()) t.stop();
        return;
      }
      const tipo = tipoSuportado();
      g.gravador = new window.MediaRecorder(g.stream, tipo ? { mimeType: tipo } : undefined);
      g.gravador.ondataavailable = (e) => e.data?.size && g.pedacos.push(e.data);
      g.gravador.onstop = async () => {
        const segundos = Math.max(1, Math.round((Date.now() - g.inicio) / 1000));
        const usado = g.gravador.mimeType || tipo || "audio/webm";
        const { descartar, falou, pedacos, motivo } = g;
        desligar();
        if (descartar) return;
        if (motivo === "sem_fala" || (!falou && g.analisador)) {
          fns.current.onErro?.("Não ouvi nada. Toque no microfone e fale mais perto do celular.");
          return;
        }
        const blob = new Blob(pedacos, { type: usado });
        fns.current.onAudio({ base64: await base64De(blob), tipo: usado.split(";")[0], segundos });
      };
      if (g.audio) {
        g.analisador = g.audio.createAnalyser();
        g.analisador.fftSize = 1024;
        g.audio.createMediaStreamSource(g.stream).connect(g.analisador);
        g.amostra = new Float32Array(g.analisador.fftSize);
      }
      g.inicio = Date.now();
      g.gravador.start(250);
      setPreparando(false);
      setGravando(true);
      g.relogio = setInterval(() => {
        const agora = Date.now();
        setMs(agora - g.inicio);
        if (g.analisador) {
          g.analisador.getFloatTimeDomainData(g.amostra);
          let soma = 0;
          for (const v of g.amostra) soma += v * v;
          const rms = Math.sqrt(soma / g.amostra.length);
          setNivel(Math.min(1, rms * 9));
          if (rms > LIMIAR) {
            g.falou = true;
            g.ultimaFala = agora;
          }
          if (g.falou && agora - g.ultimaFala > SILENCIO_MS) return parar();
          if (!g.falou && agora - g.inicio > SEM_FALA_MS) {
            g.motivo = "sem_fala";
            return parar();
          }
        }
        if (agora - g.inicio > MAXIMO_MS) parar();
      }, 80);
    } catch (e) {
      desligar();
      fns.current.onErro?.(MENSAGEM[e?.name] ?? "Não foi possível ligar o microfone.");
    }
  }, [desligar, parar]);

  return { gravando, preparando, nivel, ms, iniciar, parar, cancelar: () => parar(true) };
}
