// src/pwa/PWAUpdatePrompt.jsx
//
// Aviso discreto de "nova versão" do app. O service worker
// (vite-plugin-pwa, registerType:"prompt") baixa a atualização sozinho
// em segundo plano, mas só troca de versão quando a pessoa manda —
// trocar sozinho recarregaria a página no meio de uma anotação/edição
// em andamento. Fica fora da árvore de autenticação (main.jsx) — vale
// pra tela de login também.
//
// O navegador só procura versão nova quando a página é aberta; o app instalado fica aberto por
// dias no celular e nunca procurava (issue #444): uma correção crítica demorava a chegar. Agora
// procura de hora em hora e toda vez que o app volta para a frente, e o aviso dispensado volta a
// aparecer quando o app volta para a frente — versão velha não fica rodando calada.

import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";

const PROCURAR_VERSAO_A_CADA_MS = 60 * 60 * 1000;

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      if (!registro) return;
      const procurar = () => {
        if (navigator.onLine === false) return;
        registro.update().catch(() => {});
      };
      setInterval(procurar, PROCURAR_VERSAO_A_CADA_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") procurar();
      });
    },
    onRegisterError(error) {
      console.error("[pwa] falha ao registrar o service worker:", error);
    },
  });

  // dispensou o aviso e a versão nova continua esperando: volta a avisar ao voltar para o app
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      navigator.serviceWorker
        ?.getRegistration?.()
        .then((r) => r?.waiting && setNeedRefresh(true))
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [setNeedRefresh]);

  if (!needRefresh) return null;

  return (
    <output
      style={{
        position: "fixed",
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#111214",
        color: "#F2F3F5",
        border: "1px solid #292A2E",
        borderRadius: 12,
        padding: "10px 10px 10px 14px",
        fontSize: 13,
        fontFamily: "'Inter', system-ui, sans-serif",
        boxShadow: "0 8px 24px rgba(0,0,0,.45)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span>Nova versão do app disponível.</span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        style={{
          background: "#E4121F",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "6px 12px",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Atualizar
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dispensar aviso de atualização"
        style={{
          background: "transparent",
          border: "none",
          color: "#9CA0A8",
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
          padding: 4,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </output>
  );
}
