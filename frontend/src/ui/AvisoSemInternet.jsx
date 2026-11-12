// src/ui/AvisoSemInternet.jsx
//
// Faixa "Sem internet" (issue #355): aparece quando o aparelho perde a rede ou
// quando a tela está mostrando a cópia guardada da última leitura. Diz de
// quando é a cópia e lembra que agendar/mudar precisa de internet.

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Presence, fadeSlideDown } from "./motion/index.js";

function useOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const fmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** `desde` = hora (ms) da cópia guardada que está na tela, ou null. */
export function AvisoSemInternet({ desde, cor, fundo, texto }) {
  const online = useOnline();
  const visivel = !!desde || !online;
  const quando = desde ? fmt.format(new Date(desde)).replace(",", " às") : null;
  return (
    <Presence when={visivel} {...fadeSlideDown}>
      <div
        role="status"
        className="mx-4 md:mx-10 mt-4 rounded-lg border px-3 py-2.5 flex items-start gap-2 text-xs"
        style={{ borderColor: cor, background: fundo, color: texto }}
        data-testid="aviso-sem-internet"
      >
        <WifiOff size={14} className="shrink-0 mt-0.5" style={{ color: cor }} />
        <span>
          <strong style={{ color: cor }}>Sem internet.</strong>{" "}
          {quando ? `Mostrando a Agenda salva em ${quando}. ` : ""}
          Para agendar ou mudar uma reserva, precisa de internet.
        </span>
      </div>
    </Presence>
  );
}
