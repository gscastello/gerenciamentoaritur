// src/INTEGRATION-EXAMPLE.jsx
//
// Este arquivo NÃO é para colar inteiro por cima do app — é a prova de
// integração do caminho mais crítico (Reservar + Agenda), mostrando
// exatamente o "antes/depois" para você aplicar o mesmo padrão nas
// demais abas (Financeiro, Operação, Passageiros, Sistema), que seguem
// a mesma receita: trocar `useState` alimentado por loadKey/saveKey por
// um hook de src/hooks, e trocar `setReservas([...])` por uma chamada
// de serviço/hook que grava no Postgres.

// =====================================================================
// ANTES (V2 — window.storage, fonte de verdade no navegador)
// =====================================================================
/*
function AppInner() {
  const [reservas, setReservas] = useState([]);
  useEffect(() => {
    (async () => {
      const r = await loadKey("reservas_v5", []);
      setReservas(r);
    })();
  }, []);
  const persistReservas = useCallback((next) => {
    setReservas(next);
    saveKey("reservas_v5", next); // grava o ARRAY INTEIRO por cima — sem lock, sem transação
  }, []);
  useEffect(() => {
    const t = setInterval(sincronizarAgora, 8000); // polling — até 8s de atraso, e ainda por cima
    return () => clearInterval(t);                  // sujeito à corrida descrita na auditoria (item A1)
  }, []);
  ...
}
*/

// =====================================================================
// DEPOIS (V3 — Postgres é a fonte de verdade; o navegador só espelha)
// =====================================================================

import React, { useState } from "react";
import { useReservations } from "./hooks/useReservations";
import { useTrips } from "./hooks/useTrips";
import { useCurrentUser } from "./hooks/useUsers";

function AppInner() {
  const [dataSelecionada, setDataSelecionada] = useState(() => new Date().toISOString().slice(0, 10));

  // nada de useState([]) + loadKey + saveKey + setInterval — o hook já
  // resolve leitura inicial, loading, error, e fica ouvindo o Postgres
  // via Realtime (useRealtimeTable por baixo dos panos).
  const {
    reservations, pending, loading, error, refetch,
    createReservation, confirmReservation, cancelReservation,
    markPassengers, moveReservation, editReservation, actionState,
  } = useReservations(dataSelecionada);

  const { byDirection, refetch: refetchTrips } = useTrips(dataSelecionada);
  const { profile } = useCurrentUser(); // substitui o <TextInput value={usuario}> de texto livre da V2

  if (loading) return <SkeletonBlock />;
  if (error) return <ErroDeCarregamento erro={error} onRetry={refetch} />;

  // o restante da árvore de componentes (AgendaTab, ListaTab, ...) recebe
  // basicamente as MESMAS props que já recebia — `reservations` no lugar
  // de `reservas`, e as funções de ação no lugar dos antigos setReservas
  // manipulando array local. O JSX visual não muda.
  return (
    <AgendaTab
      reservas={reservations}
      pendentes={pending}
      ocupacao={byDirection}
      onConfirmarPendente={confirmReservation}
      onCancelar={cancelReservation}
      onMarcarEmbarcado={(id) => markPassengers(id, "embarcado")}
      onMarcarNaoCompareceu={(id) => markPassengers(id, "nao_compareceu")}
      onMover={moveReservation}
      onEditar={editReservation}
      actionState={actionState}
      usuario={profile?.name}
    />
  );
}

// =====================================================================
// Fluxo de reserva — ANTES x DEPOIS dentro do ReservarTab
// =====================================================================

/* ANTES (V2):
const confirmar = () => {
  const reserva = { id: uid(), ...form, status: pendente ? "pendente" : "confirmada", ... };
  setReservas([...reservas, reserva]);   // só existe na memória do navegador até o próximo saveKey()
  setDone(reserva);
  setStep(9);
};
*/

// DEPOIS (V3):
function useConfirmarReserva({ createReservation, form, pendente, setDone, setStep, setErroCapacidade }) {
  return async function confirmar() {
    try {
      const resultado = await createReservation({
        tripDate: form.data,
        direction: form.direcao,
        customerName: form.nome,
        customerPhone: form.telefone,
        routePointCode: form.pontoId,
        quantity: parseInt(form.quantidade, 10) || 1,
        unitPrice: form.valorUnit,
        paymentMethod: form.pagamento,
        pickupNeighborhood: form.bairro || null,
        pickupDetail: form.localExato || form.localOutro || null,
        street: form.rua || null,
        referencePoint: form.referencia || null,
        dropoffLocation: form.desembarque,
        pendingReason: pendente ? "Fora da área padrão — aguardando confirmação." : null,
        status: pendente ? "pendente" : "confirmada",
      });
      // resultado.reservation_id / resultado.status vêm do banco — a tela
      // só mostra "confirmado!" depois que o Postgres de fato confirmou.
      setDone(resultado);
      setStep(9);
    } catch (erro) {
      // erro.code === 'CAPACITY_OR_BUSINESS_RULE' -> a trigger recusou
      // porque a viagem lotou ENTRE o momento em que a tela mostrou
      // "3 vagas" e o clique em confirmar (ex.: outro atendente reservou
      // primeiro). É exatamente o cenário de dois atendentes disputando
      // a mesma vaga — o banco decide, não quem clicou mais rápido na UI.
      setErroCapacidade(erro.message);
      // a tela então oferece "Entrar na lista de espera?", que chama
      // createReservation(..., { status: 'espera' }) — isso nunca falha
      // por capacidade, porque reserva em espera não ocupa vaga (ver
      // supabase-rpc-functions.sql, comentário no topo do arquivo).
    }
  };
}
