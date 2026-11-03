import { describe, expect, it } from "vitest";
import {
  dataDeAgendamentoValida,
  erroDoFormularioDeCostume,
  formularioDoCostume,
  inicialDoAgendamento,
  origemDoCostume,
  resumoDoCostume,
  sentidoDestacado,
} from "../enderecoDeCostume.js";

const PONTOS_IDA = [
  { id: "rodoviaria", nome: "Rodoviária" },
  { id: "busca", nome: "Buscar em Casa", campo: "bairro" },
  { id: "postocarone", nome: "Posto Carone" },
];
const TRIPS = {
  ida: { pontos: PONTOS_IDA },
  volta: { pontos: [{ id: "cantanhede", nome: "Cantanhede", campo: "localExato" }] },
};

const BUSCA = {
  fonte: "historico",
  vezes: 3,
  route_point_code: "busca",
  route_point_name: "Buscar em Casa",
  neighborhood: "Prime Calhau",
  detail: "Bloco 3",
  dropoff_location: "Pirapemas",
  dropoff_area: "pirapemas",
};

describe("resumoDoCostume", () => {
  it("junta ponto, bairro, detalhe e desembarque", () => {
    expect(resumoDoCostume(BUSCA, PONTOS_IDA)).toBe(
      "Buscar em Casa · Prime Calhau, Bloco 3 → Pirapemas",
    );
  });
  it("sem desembarque não põe seta; sem bairro e detalhe mostra só o ponto", () => {
    expect(resumoDoCostume({ route_point_code: "postocarone" }, PONTOS_IDA)).toBe("Posto Carone");
    expect(resumoDoCostume({ ...BUSCA, dropoff_location: null }, PONTOS_IDA)).toBe(
      "Buscar em Casa · Prime Calhau, Bloco 3",
    );
  });
  it("usa o nome do banco quando o ponto não está na configuração", () => {
    expect(resumoDoCostume({ route_point_code: "x", route_point_name: "Ponto X" }, [])).toBe(
      "Ponto X",
    );
    expect(resumoDoCostume({ route_point_code: "x" }, [])).toBe("x");
  });
  it("sem costume devolve vazio", () => {
    expect(resumoDoCostume(null, PONTOS_IDA)).toBe("");
    expect(resumoDoCostume(undefined)).toBe("");
  });
});

describe("origemDoCostume", () => {
  it("diz se foi fixado, quantas vezes apareceu ou que é a última viagem", () => {
    expect(origemDoCostume({ fonte: "manual" })).toBe("fixado pela equipe");
    expect(origemDoCostume({ fonte: "historico", vezes: 3 })).toBe("3× no histórico");
    expect(origemDoCostume({ fonte: "historico", vezes: 1 })).toBe("última viagem");
    expect(origemDoCostume({ fonte: "historico" })).toBe("última viagem");
    expect(origemDoCostume(null)).toBe("");
  });
});

describe("sentidoDestacado", () => {
  const tudo = { ida: BUSCA, volta: { route_point_code: "cantanhede" } };
  it("prefere o sentido sugerido quando há costume nele", () => {
    expect(sentidoDestacado("volta", tudo)).toBe("volta");
    expect(sentidoDestacado("ida", tudo)).toBe("ida");
  });
  it("cai para o outro sentido quando o sugerido não tem costume", () => {
    expect(sentidoDestacado("volta", { ida: BUSCA, volta: null })).toBe("ida");
    expect(sentidoDestacado("ida", { ida: null, volta: BUSCA })).toBe("volta");
  });
  it("sem sugestão começa pela ida; sem nenhum costume é null", () => {
    expect(sentidoDestacado(null, tudo)).toBe("ida");
    expect(sentidoDestacado(null, { ida: null, volta: BUSCA })).toBe("volta");
    expect(sentidoDestacado("ida", { ida: null, volta: null })).toBeNull();
    expect(sentidoDestacado("ida", null)).toBeNull();
  });
  it("sentido sugerido desconhecido é ignorado", () => {
    expect(sentidoDestacado("sabado", tudo)).toBe("ida");
  });
});

describe("inicialDoAgendamento", () => {
  const cliente = { nome: "Adriely Luce", telefone: "98987115317", pagamento_padrao: "pix" };

  it("preenche o modal com o costume (busca em casa)", () => {
    const i = inicialDoAgendamento({
      cliente,
      direcao: "ida",
      costume: BUSCA,
      trips: TRIPS,
      data: "2026-11-04",
    });
    expect(i).toMatchObject({
      nome: "Adriely Luce",
      telefone: "98987115317",
      data: "2026-11-04",
      direcao: "ida",
      pontoId: "busca",
      bairro: "Prime Calhau",
      anotacao: "Bloco 3",
      desembarque: "Pirapemas",
      desembarqueArea: "pirapemas",
      pagamento: "pix",
    });
    expect(i.aviso).toBe(
      "Endereço de costume (3× no histórico): Buscar em Casa · Prime Calhau, Bloco 3 → Pirapemas",
    );
  });

  it("ponto que não é por bairro não copia o bairro; pagamento padrão é dinheiro", () => {
    const i = inicialDoAgendamento({
      cliente: { nome: "A", telefone: "1" },
      direcao: "ida",
      costume: { ...BUSCA, route_point_code: "postocarone" },
      trips: TRIPS,
      data: "2026-11-04",
    });
    expect(i.pontoId).toBe("postocarone");
    expect(i.bairro).toBe("");
    expect(i.pagamento).toBe("dinheiro");
  });

  it("ponto que não existe mais: não copia o endereço e avisa", () => {
    const i = inicialDoAgendamento({
      cliente,
      direcao: "ida",
      costume: { ...BUSCA, route_point_code: "extinto" },
      trips: TRIPS,
      data: "2026-11-04",
    });
    expect(i.pontoId).toBe("");
    expect(i.bairro).toBe("");
    expect(i.anotacao).toBe("");
    expect(i.aviso).toBe(
      "O ponto de costume deste cliente não existe mais — escolha o ponto de embarque.",
    );
  });

  it("aguenta cliente e configuração ausentes", () => {
    const i = inicialDoAgendamento({
      direcao: "volta",
      costume: { route_point_code: "cantanhede" },
      data: "2026-11-04",
    });
    expect(i.nome).toBe("");
    expect(i.telefone).toBe("");
    expect(i.desembarque).toBe("");
    expect(i.desembarqueArea).toBe("");
  });
});

describe("formulário do costume", () => {
  it("parte do costume atual; sem costume, do primeiro ponto", () => {
    expect(formularioDoCostume(BUSCA, PONTOS_IDA)).toEqual({
      pontoId: "busca",
      bairro: "Prime Calhau",
      detalhe: "Bloco 3",
      desembarque: "Pirapemas",
    });
    expect(formularioDoCostume(null, PONTOS_IDA)).toEqual({
      pontoId: "rodoviaria",
      bairro: "",
      detalhe: "",
      desembarque: "",
    });
    expect(formularioDoCostume(null, []).pontoId).toBe("");
  });

  it("exige um ponto de embarque que exista", () => {
    expect(erroDoFormularioDeCostume({ pontoId: "busca" }, PONTOS_IDA)).toBeNull();
    expect(erroDoFormularioDeCostume({ pontoId: "" }, PONTOS_IDA)).toBe(
      "Escolha o ponto de embarque.",
    );
    expect(erroDoFormularioDeCostume({ pontoId: "nao_existe" }, PONTOS_IDA)).toBe(
      "Escolha o ponto de embarque.",
    );
    expect(erroDoFormularioDeCostume(null, PONTOS_IDA)).toBe("Escolha o ponto de embarque.");
  });
});

describe("dataDeAgendamentoValida", () => {
  it("aceita hoje e datas futuras", () => {
    expect(dataDeAgendamentoValida("2026-11-04", "2026-11-04")).toBe(true);
    expect(dataDeAgendamentoValida("2026-12-25", "2026-11-04")).toBe(true);
  });
  it("recusa data passada, vazia ou fora do formato", () => {
    expect(dataDeAgendamentoValida("2026-11-03", "2026-11-04")).toBe(false);
    expect(dataDeAgendamentoValida("", "2026-11-04")).toBe(false);
    expect(dataDeAgendamentoValida(null, "2026-11-04")).toBe(false);
    expect(dataDeAgendamentoValida("04/11/2026", "2026-11-04")).toBe(false);
    expect(dataDeAgendamentoValida("2026-11-04x", "2026-11-04")).toBe(false);
  });
});
