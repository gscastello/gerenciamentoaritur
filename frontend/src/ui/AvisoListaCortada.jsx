// src/ui/AvisoListaCortada.jsx
//
// Faixa "Lista incompleta" (issue #444): aparece quando a guarda do cliente do Supabase
// (lib/guardaDeListas.js) vê uma leitura que veio cortada em 1.000 linhas. É o erro da #442
// (reservas novas sumiram da Agenda) deixando de ser calado: a equipe vê na hora e o erro fica
// no registro (aba Sistema) com o nome da lista.

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { logTecnico } from "../lib/erros.js";
import { EVENTO_LISTA_CORTADA } from "../lib/guardaDeListas.js";
import { Presence, fadeSlideDown } from "./motion/index.js";

export function AvisoListaCortada({ cor, fundo, texto }) {
  const [tabelas, setTabelas] = useState([]);
  const vistas = useRef(new Set());
  useEffect(() => {
    const ouvir = (e) => {
      const tabela = String(e.detail?.tabela ?? "?");
      if (vistas.current.has(tabela)) return;
      vistas.current.add(tabela);
      const erro = new Error(`Lista cortada em 1.000 linhas: ${tabela}`);
      erro.code = "LISTA_CORTADA";
      logTecnico(erro, { origem: "guardaDeListas", tabela });
      setTabelas([...vistas.current]);
    };
    window.addEventListener(EVENTO_LISTA_CORTADA, ouvir);
    return () => window.removeEventListener(EVENTO_LISTA_CORTADA, ouvir);
  }, []);
  return (
    <Presence when={tabelas.length > 0} {...fadeSlideDown}>
      <div
        role="alert"
        className="mx-4 md:mx-10 mt-4 rounded-lg border px-3 py-2.5 flex items-start gap-2 text-xs"
        style={{ borderColor: cor, background: fundo, color: texto }}
        data-testid="aviso-lista-cortada"
      >
        <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: cor }} />
        <span>
          <strong style={{ color: cor }}>Lista incompleta.</strong> Uma lista passou de 1.000 itens
          e o app pode não estar mostrando tudo ({tabelas.join(", ")}). Avise o Gustavo agora e
          confira as reservas mais novas pela busca.
        </span>
      </div>
    </Presence>
  );
}
