import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAssistente } from "../../hooks/useAssistente.js";

/* Assistente em qualquer tela (issue #516). Dois contextos de propósito: quem só ABRE (o app inteiro)
   não redesenha a cada mensagem da conversa. */
const AbrirContexto = createContext({ abrir: () => {}, fechar: () => {} });
const ConversaContexto = createContext(null);

export function AssistenteProvider({ children }) {
  const conversa = useAssistente();
  const [aberto, setAberto] = useState(false);
  // pedido que chegou de outra tela (ex.: uma pendência): o painel envia ao abrir
  const [pedido, setPedido] = useState(null);

  const abrir = useCallback((novo = null) => {
    if (novo?.texto) setPedido({ ...novo, at: Date.now() });
    setAberto(true);
  }, []);
  const fechar = useCallback(() => setAberto(false), []);
  const pedidoEnviado = useCallback(() => setPedido(null), []);

  const acoes = useMemo(() => ({ abrir, fechar }), [abrir, fechar]);
  return (
    <AbrirContexto.Provider value={acoes}>
      <ConversaContexto.Provider value={{ ...conversa, aberto, pedido, pedidoEnviado }}>
        {children}
      </ConversaContexto.Provider>
    </AbrirContexto.Provider>
  );
}

export const useAbrirAssistente = () => useContext(AbrirContexto);
export const useConversaDoAssistente = () => useContext(ConversaContexto);
