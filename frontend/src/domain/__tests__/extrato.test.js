import { describe, expect, it } from "vitest";
import {
  categoriaSugerida,
  chavesDasLinhas,
  conciliar,
  dataDoExtrato,
  lancamentoDoMovimento,
  lerCsv,
  lerExtrato,
  lerOfx,
  numeroDoExtrato,
} from "../extrato.js";

// Conferência do extrato do banco (issue #364).

describe("números e datas do banco", () => {
  it("valor no formato brasileiro, americano, com R$, parênteses e D/C", () => {
    expect(numeroDoExtrato("1.234,56")).toBe(1234.56);
    expect(numeroDoExtrato("-50,00")).toBe(-50);
    expect(numeroDoExtrato("R$ -1.000,00")).toBe(-1000);
    expect(numeroDoExtrato("-R$ 80,00")).toBe(-80);
    expect(numeroDoExtrato("1234.5")).toBe(1234.5);
    expect(numeroDoExtrato("1,234.56")).toBe(1234.56);
    expect(numeroDoExtrato("1.000")).toBe(1000);
    expect(numeroDoExtrato("(70,00)")).toBe(-70);
    expect(numeroDoExtrato("70,00 D")).toBe(-70);
    expect(numeroDoExtrato("70,00 C")).toBe(70);
    expect(numeroDoExtrato("+15")).toBe(15);
    expect(numeroDoExtrato("")).toBeNaN();
    expect(numeroDoExtrato("abc")).toBeNaN();
  });
  it("datas dd/mm/aaaa, aaaa-mm-dd e OFX", () => {
    expect(dataDoExtrato("05/11/2026")).toBe("2026-11-05");
    expect(dataDoExtrato("05/11/26")).toBe("2026-11-05");
    expect(dataDoExtrato("05-11-2026 14:30")).toBe("2026-11-05");
    expect(dataDoExtrato("2026-11-05T10:00:00")).toBe("2026-11-05");
    expect(dataDoExtrato("20261105120000[-3:BRT]")).toBe("2026-11-05");
    expect(dataDoExtrato("31/02/2026")).toBeNull();
    expect(dataDoExtrato("ontem")).toBeNull();
  });
});

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>InfinitePay</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>542<ACCTID>12345678</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105100000[-3:BRT]<TRNAMT>70.00<FITID>A1<MEMO>Pix recebido Fulano
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-350,00<FITID>A2<NAME>POSTO CARONE
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>0<FITID>A3<MEMO>zero
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("ler o arquivo", () => {
  it("OFX: movimentos, conta e id do banco", () => {
    const r = lerOfx(OFX);
    expect(r.conta).toBe("InfinitePay …5678");
    expect(r.linhas).toEqual([
      { data: "2026-11-05", valor: 70, descricao: "Pix recebido Fulano", documento: "A1" },
      { data: "2026-11-06", valor: -350, descricao: "POSTO CARONE", documento: "A2" },
    ]);
    expect(lerExtrato("nov.ofx", OFX).formato).toBe("ofx");
  });
  it("CSV com ; e valor com sinal", () => {
    const csv =
      "Extrato da conta\nData;Descrição;Valor;Saldo\n05/11/2026;Pix recebido;70,00;1.070,00\n06/11/2026;Posto Carone;-350,00;720,00\n06/11/2026;Saldo do dia;0;720,00";
    const r = lerExtrato("InfinitePay novembro.csv", csv);
    expect(r).toMatchObject({ formato: "csv", conta: "InfinitePay novembro", erro: null });
    expect(r.linhas).toEqual([
      { data: "2026-11-05", valor: 70, descricao: "Pix recebido", documento: null },
      { data: "2026-11-06", valor: -350, descricao: "Posto Carone", documento: null },
    ]);
  });
  it("CSV com , aspas e o sinal pela coluna de tipo", () => {
    const csv = `"Data","Tipo","Descrição","Valor","ID da transação"\n"2026-11-05","Pix recebido","Maria","70.00","x1"\n"2026-11-06","Pix enviado","Oficina do Zé, peças","1,200.00","x2"`;
    expect(lerCsv(csv).linhas).toEqual([
      { data: "2026-11-05", valor: 70, descricao: "Pix recebido — Maria", documento: "x1" },
      {
        data: "2026-11-06",
        valor: -1200,
        descricao: "Pix enviado — Oficina do Zé, peças",
        documento: "x2",
      },
    ]);
  });
  it("CSV com colunas de entrada e saída", () => {
    const csv =
      "Data\tHistórico\tCrédito\tDébito\n05/11/2026\tPix\t70,00\t\n06/11/2026\tTarifa\t\t5,90";
    expect(lerCsv(csv).linhas.map((l) => l.valor)).toEqual([70, -5.9]);
  });
  it("arquivo sem as colunas ou vazio dá erro claro", () => {
    expect(lerCsv("a;b\n1;2").erro).toMatch(/colunas de data e valor/);
    expect(lerExtrato("x.csv", "Data;Valor\n").erro).toMatch(/Nenhum movimento/);
    expect(lerExtrato("", "Data;Valor\n05/11/2026;10").conta).toBe("Banco");
  });
});

describe("chaves para não guardar duas vezes", () => {
  it("id do banco quando existe; senão data+valor+descrição+ordem", () => {
    const l = [
      { data: "2026-11-05", valor: 70, descricao: "Pix Recebido", documento: "A1" },
      { data: "2026-11-05", valor: 70, descricao: "Pix recebido", documento: null },
      { data: "2026-11-05", valor: 70, descricao: "Pix recébido", documento: null },
    ];
    expect(chavesDasLinhas("IP", l)).toEqual([
      "IP|A1",
      "IP|2026-11-05|70.00|pix recebido|1",
      "IP|2026-11-05|70.00|pix recebido|2",
    ]);
  });
});

const L = (id, data, valor, extra = {}) => ({ id, data, valor, descricao: id, ...extra });
const E = (id, entry_date, type, amount, category = "outro") => ({
  id,
  entry_date,
  type,
  amount,
  category,
});

describe("conciliar", () => {
  it("bate pelo valor e até 3 dias, escolhendo o mais perto", () => {
    const r = conciliar({
      linhas: [L("m1", "2026-11-06", -350)],
      lancamentos: [
        E("e-longe", "2026-11-03", "despesa", 350),
        E("e-perto", "2026-11-07", "despesa", 350),
        E("e-receita", "2026-11-06", "receita", 350),
      ],
    });
    expect(r.linhas[0]).toMatchObject({ situacao: "bate", par: { id: "e-perto" } });
  });
  it("fora da folga ou com outro valor falta lançar", () => {
    const r = conciliar({
      linhas: [L("m1", "2026-11-10", -350), L("m2", "2026-11-06", -351)],
      lancamentos: [E("e1", "2026-11-06", "despesa", 350)],
    });
    expect(r.linhas.map((l) => l.situacao)).toEqual(["falta_lancar", "falta_lancar"]);
    expect(r.resumo.falta).toBe(2);
    expect(r.semPar.map((x) => x.id)).toEqual(["e1"]);
  });
  it("lançado pelo extrato e ignorado não entram na busca", () => {
    const r = conciliar({
      linhas: [
        L("m1", "2026-11-06", -350, { financial_entry_id: "e1" }),
        L("m2", "2026-11-06", -350, { ignorada: true }),
      ],
      lancamentos: [E("e1", "2026-11-06", "despesa", 350)],
    });
    expect(r.linhas[0]).toMatchObject({ situacao: "bate", peloExtrato: true, par: { id: "e1" } });
    expect(r.linhas[1].situacao).toBe("ignorada");
    expect(r.resumo).toMatchObject({ bate: 1, ignoradas: 1, falta: 0 });
  });
  it("Pix pago de reserva bate com o pagamento", () => {
    const r = conciliar({
      linhas: [L("m1", "2026-11-05", 70)],
      lancamentos: [],
      pagamentos: [{ id: "p1", amount: 70, paid_at: "2026-11-05T13:00:00Z", method: "pix" }],
    });
    expect(r.linhas[0]).toMatchObject({ situacao: "bate_pagamento", pagamento: { id: "p1" } });
  });
  it("Pix de passageiros cabe na receita lançada como total do dia: não lançar de novo", () => {
    const r = conciliar({
      linhas: [L("m1", "2026-11-05", 70), L("m2", "2026-11-05", 80), L("m3", "2026-11-06", 70)],
      lancamentos: [
        E("dia5", "2026-11-05", "receita", 1500, "passagem"),
        E("dia6", "2026-11-06", "receita", 50, "passagem"),
      ],
    });
    expect(r.linhas.map((l) => l.situacao)).toEqual([
      "no_total_do_dia",
      "no_total_do_dia",
      "falta_lancar", // 70 não cabe nos 50 do dia 6
    ]);
    expect(r.linhas[0].receitaDoDia).toBe(1500);
    expect(r.semPar).toEqual([]); // receita de passagem não é "sem par" (tem dinheiro)
  });
  it("lançamento repetido do mesmo movimento é em dobro", () => {
    const r = conciliar({
      linhas: [L("m1", "2026-11-06", -350), L("m2", "2026-11-20", -10)],
      lancamentos: [
        E("e1", "2026-11-06", "despesa", 350),
        E("e2", "2026-11-07", "despesa", 350),
        E("e3", "2026-11-08", "despesa", 99),
        E("fora", "2026-12-01", "despesa", 1),
      ],
    });
    expect(r.emDobro.map((x) => x.id)).toEqual(["e2"]);
    expect(r.semPar.map((x) => x.id)).toEqual(["e3"]); // dentro do período do extrato
    expect(r.periodo).toEqual({ de: "2026-11-06", ate: "2026-11-20" });
    expect(r.resumo).toMatchObject({ emDobro: 1, semPar: 1, entradas: 0, saidas: 360 });
  });
  it("extrato vazio", () => {
    const r = conciliar({ linhas: [], lancamentos: [E("e1", "2026-11-06", "despesa", 1)] });
    expect(r).toMatchObject({ periodo: null, linhas: [], emDobro: [], semPar: [] });
  });
});

describe("lançar o que falta", () => {
  it("movimento vira lançamento com o tipo pelo sinal", () => {
    expect(
      lancamentoDoMovimento(
        { data: "2026-11-06", valor: -350.456, descricao: "POSTO" },
        "combustivel",
      ),
    ).toEqual({
      entryDate: "2026-11-06",
      type: "despesa",
      category: "combustivel",
      amount: 350.46,
      description: "POSTO (extrato)",
    });
    expect(
      lancamentoDoMovimento({ data: "2026-11-06", valor: 70, descricao: "" }, ""),
    ).toMatchObject({
      type: "receita",
      category: "outro",
      description: "Movimento do extrato (extrato)",
    });
  });
  it("categoria sugerida pela descrição do banco", () => {
    expect(categoriaSugerida({ valor: -350, descricao: "POSTO CARONE LTDA" })).toBe("combustivel");
    expect(categoriaSugerida({ valor: -90, descricao: "Oficina Mecânica" })).toBe("manutencao");
    expect(categoriaSugerida({ valor: -30, descricao: "Restaurante" })).toBe("alimentacao");
    expect(categoriaSugerida({ valor: -25, descricao: "UBER *TRIP" })).toBe("taxi");
    expect(categoriaSugerida({ valor: -5.9, descricao: "Tarifa Pix" })).toBe(
      "despesa_administrativa",
    );
    expect(categoriaSugerida({ valor: -100, descricao: "Pix 98999123456" })).toBe("outro");
    expect(categoriaSugerida({ valor: 70, descricao: "Pix recebido" })).toBe("passagem");
    expect(categoriaSugerida({ valor: 70, descricao: "Estorno" })).toBe("outro");
  });
});
