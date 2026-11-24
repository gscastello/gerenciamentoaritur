// src/hooks/useAssistente.js
//
// Estado da conversa com o assistente da equipe (issue #288). A conversa fica
// na sessão do navegador (troca de aba não apaga); cada proposta tem seu
// estado: "proposta" → "gravando" → "feita" | "erro" | "descartada".

import { useCallback, useEffect, useRef, useState } from "react";
import { assistenteService } from "../services/assistenteService";
import { useAsyncAction } from "./useAsyncAction";

const CHAVE = "assistente.conversa.v1";
let proximoId = 1;
const novoId = () => `m${Date.now().toString(36)}${proximoId++}`;

function lerSessao() {
  try {
    const bruto = window.sessionStorage.getItem(CHAVE);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravarSessao(lista) {
  try {
    window.sessionStorage.setItem(CHAVE, JSON.stringify(lista.slice(-60)));
  } catch {
    /* sessão cheia ou bloqueada: a conversa só não sobrevive à troca de aba */
  }
}

/** Texto que vai para o modelo: a fala e, nas respostas, o que foi proposto e o que aconteceu. */
function paraOModelo(m) {
  if (m.papel === "usuario")
    return { papel: "usuario", texto: [m.texto, m.contexto].filter(Boolean).join("\n") };
  const propostas = (m.acoes ?? [])
    .map(
      (a) =>
        `[proposta ${a.estado ?? "proposta"}: ${a.descricao}${a.resultado ? ` — ${a.resultado}` : ""}]`,
    )
    .join("\n");
  return { papel: "assistente", texto: [m.texto, propostas].filter(Boolean).join("\n") };
}

export function useAssistente() {
  const [mensagens, setMensagens] = useState(lerSessao);
  const conversa = useAsyncAction(assistenteService.conversar);
  const ref = useRef(mensagens);
  ref.current = mensagens;

  useEffect(() => gravarSessao(mensagens), [mensagens]);

  const enviar = useCallback(
    async (
      texto,
      { contexto = null, pendencia = null, novaConversa = false, repetir = false } = {},
    ) => {
      const fala = String(texto ?? "").trim();
      if ((!fala && !repetir) || conversa.loading) return null;
      const minha = { id: novoId(), papel: "usuario", texto: fala };
      if (contexto) minha.contexto = contexto;
      if (pendencia) minha.pendencia = pendencia;
      const antes = novaConversa ? [] : ref.current;
      const historico = repetir ? antes : [...antes, minha];
      setMensagens(historico);
      ref.current = historico;
      try {
        const r = await conversa.run(historico.map(paraOModelo));
        setMensagens((prev) => [
          ...prev,
          {
            id: novoId(),
            papel: "assistente",
            texto: r.texto,
            acoes: (r.acoes ?? []).map((a) => ({ ...a, estado: "proposta" })),
            correcoes: r.correcoes ?? [],
          },
        ]);
        return r;
      } catch {
        // o erro fica em conversa.error; a fala continua na tela para tentar de novo
        return null;
      }
    },
    [conversa],
  );

  const mudarAcao = useCallback((acaoId, patch) => {
    setMensagens((prev) =>
      prev.map((m) =>
        m.acoes?.some((a) => a.id === acaoId)
          ? { ...m, acoes: m.acoes.map((a) => (a.id === acaoId ? { ...a, ...patch } : a)) }
          : m,
      ),
    );
  }, []);

  const confirmar = useCallback(
    async (acao) => {
      mudarAcao(acao.id, { estado: "gravando", resultado: null });
      try {
        const resultado = await assistenteService.executar(acao);
        mudarAcao(acao.id, { estado: "feita", resultado });
      } catch (err) {
        mudarAcao(acao.id, {
          estado: "erro",
          resultado: err?.message ?? "Não foi possível gravar.",
        });
      }
    },
    [mudarAcao],
  );

  const descartar = useCallback(
    (acao) => mudarAcao(acao.id, { estado: "descartada" }),
    [mudarAcao],
  );

  const limpar = useCallback(() => setMensagens([]), []);

  /** Registrou por engano: some do cartão e sai da fila do Claude. */
  const descartarCorrecao = useCallback(async (id) => {
    await assistenteService.descartarCorrecao(id);
    setMensagens((prev) =>
      prev.map((m) =>
        m.correcoes?.some((c) => c.id === id)
          ? { ...m, correcoes: m.correcoes.map((c) => (c.id === id ? { ...c, fora: true } : c)) }
          : m,
      ),
    );
  }, []);

  return {
    mensagens,
    enviar,
    descartarCorrecao,
    confirmar,
    descartar,
    limpar,
    pensando: conversa.loading,
    erro: conversa.error,
  };
}
