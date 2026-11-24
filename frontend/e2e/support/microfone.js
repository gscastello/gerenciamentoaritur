// e2e/support/microfone.js
//
// Microfone falso (issue #516): grava um pedaço qualquer; o texto vem da transcrição do servidor
// (Edge Function `assistente`, modo transcrever). Sem AudioContext: não há volume para medir.

export const MICROFONE_FALSO = () => {
  window.MediaRecorder = class {
    static isTypeSupported() {
      return true;
    }
    constructor() {
      this.state = "inactive";
      this.mimeType = "audio/mp4";
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["x".repeat(400)], { type: "audio/mp4" }) });
      this.onstop?.();
    }
  };
  window.AudioContext = undefined;
  window.webkitAudioContext = undefined;
  window.__MICROFONES_DESLIGADOS__ = 0;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => ({
        getTracks: () => [
          {
            stop() {
              window.__MICROFONES_DESLIGADOS__ += 1;
            },
          },
        ],
      }),
    },
  });
};
