import { describe, expect, it } from "vitest";
import { csvDoBackup, linhasDoBackup, resumoDoBackup } from "../backupDia.js";

const SNAPSHOT = {
  versao: 1,
  dia: "2026-10-23",
  reservas: [
    {
      reserva: {
        quantity: 2,
        status: "confirmada",
        type: "passagem",
        payment_method: "pix",
        total_price: "160.00",
        pickup_neighborhood: "Cohatrac",
        street: "Rua 7",
        dropoff_location: "Pirapemas",
        deleted_at: null,
      },
      cliente: { nome: "Maria Silva", telefone: "98987654321", telefone2: "98981110000" },
      viagem: { direcao: "ida" },
      ponto: { codigo: "busca", nome: "Buscar em Casa" },
    },
    {
      reserva: {
        quantity: 1,
        status: "cancelada",
        type: "passagem",
        deleted_at: "2026-10-23T10:00",
      },
      cliente: { nome: 'João "Zé" Souza; Jr', telefone: "98911112222" },
      viagem: { direcao: "volta" },
      ponto: { nome: "Pirapemas" },
    },
  ],
};

describe("linhasDoBackup", () => {
  it("uma linha por reserva, com os campos legíveis", () => {
    const linhas = linhasDoBackup(SNAPSHOT);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      sentido: "Ida",
      ponto: "Buscar em Casa",
      quantidade: 2,
      endereco: "Cohatrac · Rua 7",
      desembarque: "Pirapemas",
      nome: "Maria Silva",
      telefone: "98987654321",
      telefone2: "98981110000",
      status: "confirmada",
      pagamento: "pix",
      valor: "160.00",
      apagada: "",
    });
    expect(linhas[1]).toMatchObject({ sentido: "Volta", status: "cancelada", apagada: "sim" });
  });

  it("retrato vazio ou ausente não quebra", () => {
    expect(linhasDoBackup({ reservas: [] })).toEqual([]);
    expect(linhasDoBackup(undefined)).toEqual([]);
    expect(linhasDoBackup({ reservas: [{}] })[0].quantidade).toBe(0);
  });
});

describe("csvDoBackup", () => {
  it("BOM, separador ';', cabeçalho em português e quebra de linha do Excel", () => {
    const csv = csvDoBackup(linhasDoBackup(SNAPSHOT));
    expect(csv.startsWith("﻿Sentido;Ponto de embarque;Passagens;Endereço;")).toBe(true);
    const linhas = csv.split("\r\n");
    expect(
      linhas[1].startsWith("Ida;Buscar em Casa;2;Cohatrac · Rua 7;Pirapemas;Maria Silva;"),
    ).toBe(true);
    expect(linhas.at(-1)).toBe("");
  });

  it("aspas, ponto e vírgula e quebra de linha no texto não quebram as colunas", () => {
    const csv = csvDoBackup(linhasDoBackup(SNAPSHOT));
    expect(csv).toContain('"João ""Zé"" Souza; Jr"');
  });
});

describe("resumoDoBackup", () => {
  it("conta reservas, canceladas e passagens", () => {
    expect(resumoDoBackup({ reservas_total: 12, reservas_canceladas: 2, passagens: 14 })).toBe(
      "12 reservas (2 canceladas) · 14 passagens",
    );
    expect(resumoDoBackup({ reservas_total: 3, reservas_canceladas: 0, passagens: 3 })).toBe(
      "3 reservas · 3 passagens",
    );
  });
});
