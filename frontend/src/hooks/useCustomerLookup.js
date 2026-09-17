// src/hooks/useCustomerLookup.js
//
// Busca o nome de um cliente já cadastrado pelo telefone — usado na
// anotação rápida da Agenda (domain/anotacaoRapida.js). rpc_create_reservation
// reusa o cliente pelo telefone quando já existe, mas exige ALGUM nome
// não-vazio no parâmetro; sem essa busca, reutilizar o telefone de um
// cliente já cadastrado trocaria o nome dele por um texto genérico.

import { useCallback } from "react";
import { customersService } from "../services/customersService";

export function useCustomerLookup() {
  return useCallback(async (telefoneDigitos) => {
    try {
      const cliente = await customersService.getByPhone(telefoneDigitos);
      return cliente?.name || null;
    } catch {
      return null;
    }
  }, []);
}
