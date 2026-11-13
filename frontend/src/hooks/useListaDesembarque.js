// src/hooks/useListaDesembarque.js
//
// Lista de desembarque anotada na viagem (issue #383). Funciona sem internet:
// cada mudança vai primeiro para o aparelho (copiaOffline, só com "Permanecer
// conectado"; sair da conta apaga) e depois para o banco. Ao abrir, ao voltar a
// conexão e quando outro aparelho muda a lista, junta a cópia local com a do banco
// (domain/listaDesembarque.js — a mesma regra da RPC).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  linhasVisiveis,
  mesclarListas,
  mudarLinha,
  novaLinha,
  resumoDaLista,
  temPendente,
} from "../domain/listaDesembarque.js";
import { lerCopia, salvarCopia } from "../lib/copiaOffline.js";
import { listaDesembarqueService } from "../services/listaDesembarqueService";
import { useRealtimeTable } from "./useRealtimeTable";

const novoId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** estado: "carregando" | "salvo" | "enviando" | "pendente" (anotado só no aparelho) | "sem_internet" (cópia do aparelho, nada a enviar) */
export function useListaDesembarque(data, direcao) {
  const chave = `desembarque:${data}:${direcao}`;
  const [lista, setLista] = useState(() => lerCopia(chave)?.dados?.lista ?? []);
  const [estado, setEstado] = useState("carregando");
  const listaRef = useRef(lista);
  const enviandoRef = useRef(false);
  const deNovoRef = useRef(false);
  const chaveRef = useRef(chave);

  const aplicar = useCallback(
    (nova, pendente) => {
      listaRef.current = nova;
      setLista(nova);
      salvarCopia(chave, { lista: nova, pendente });
    },
    [chave],
  );

  const enviar = useCallback(async () => {
    if (enviandoRef.current) {
      deNovoRef.current = true;
      return;
    }
    enviandoRef.current = true;
    const minhaChave = chave;
    setEstado("enviando");
    try {
      do {
        deNovoRef.current = false;
        const final = await listaDesembarqueService.salvar(data, direcao, listaRef.current);
        if (chaveRef.current !== minhaChave) return;
        const junta = mesclarListas(listaRef.current, final);
        const pendente = temPendente(junta, final);
        aplicar(junta, pendente);
        if (pendente) deNovoRef.current = true;
      } while (deNovoRef.current);
      setEstado("salvo");
    } catch {
      if (chaveRef.current === minhaChave) setEstado("pendente");
    } finally {
      enviandoRef.current = false;
    }
  }, [chave, data, direcao, aplicar]);

  const carregar = useCallback(async () => {
    const minhaChave = chave;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setEstado(lerCopia(minhaChave)?.dados?.pendente ? "pendente" : "sem_internet");
      return;
    }
    try {
      const remota = await listaDesembarqueService.ler(data, direcao);
      if (chaveRef.current !== minhaChave) return;
      const junta = mesclarListas(listaRef.current, remota);
      const pendente = temPendente(junta, remota);
      aplicar(junta, pendente);
      if (pendente) await enviar();
      else setEstado("salvo");
    } catch {
      if (chaveRef.current !== minhaChave) return;
      setEstado(lerCopia(minhaChave)?.dados?.pendente ? "pendente" : "sem_internet");
    }
  }, [chave, data, direcao, aplicar, enviar]);

  // trocou o dia ou o sentido: abre a cópia do aparelho e busca no banco
  useEffect(() => {
    chaveRef.current = chave;
    const local = lerCopia(chave)?.dados?.lista ?? [];
    listaRef.current = local;
    setLista(local);
    setEstado("carregando");
    carregar();
  }, [chave, carregar]);

  useEffect(() => {
    const voltou = () => carregar();
    window.addEventListener("online", voltou);
    return () => window.removeEventListener("online", voltou);
  }, [carregar]);

  useRealtimeTable("listas_desembarque", (payload) => {
    const linha = payload?.new;
    if (!linha || (linha.trip_date === data && linha.direction === direcao)) carregar();
  });

  const mudar = useCallback(
    (nova) => {
      aplicar(nova, true);
      enviar();
    },
    [aplicar, enviar],
  );

  return {
    linhas: linhasVisiveis(lista),
    /** com as apagadas, para a tela animar a saída */
    todas: lista,
    resumo: resumoDaLista(lista),
    estado,
    adicionar: (texto) => {
      const l = novaLinha(texto, { id: novoId(), agora: Date.now() });
      if (!l) return false;
      mudar([...listaRef.current, l]);
      return true;
    },
    alternar: (id) => {
      const atual = listaRef.current.find((l) => l.id === id);
      if (atual) mudar(mudarLinha(listaRef.current, id, { feito: !atual.feito }, Date.now()));
    },
    editar: (id, texto) => mudar(mudarLinha(listaRef.current, id, { texto }, Date.now())),
    apagar: (id) => mudar(mudarLinha(listaRef.current, id, { apagada: true }, Date.now())),
  };
}
