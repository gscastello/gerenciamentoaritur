import { assertEquals } from "jsr:@std/assert@1";
import {
  completarLugares,
  desembarqueCopiaDoEmbarque,
  desembarqueDaIdaEscrito,
  desembarqueDaVoltaEscrito,
  desembarqueDaVoltaNoCaminho,
  enderecoDaVoltaDito,
} from "./lugaresDoPedido.ts";

const c = (texto: string) => ({ quem: "cliente", texto });
const e = (texto: string) => ({ quem: "equipe", texto });

Deno.test("#523: a Ida fica com a cidade que o cliente escreveu como destino", () => {
  assertEquals(desembarqueDaIdaEscrito(["Vou pegar lá no retorno pra pirapemas"]), "Pirapemas");
  assertEquals(desembarqueDaIdaEscrito(["Tem vaga de sao luis a Pirapemas amanha ?"]), "Pirapemas");
  assertEquals(desembarqueDaIdaEscrito(["tem vaga para catanhede", "amanhã"]), "Cantanhede");
  assertEquals(desembarqueDaIdaEscrito(["quero ir pra Miranda"]), "Miranda do Norte");
  // duas cidades, ou cidade que não é destino
  assertEquals(desembarqueDaIdaEscrito(["vaga pra pirapemas", "não, para cantanhede"]), null);
  assertEquals(desembarqueDaIdaEscrito(["sou de Pirapemas", "bom dia"]), null);
});

Deno.test("#523: Volta que para no caminho fica com a cidade do destino", () => {
  assertEquals(desembarqueDaVoltaNoCaminho(["E por q eu queria ir pra Miranda meio dia"], "pirapemas"), "Miranda do Norte");
  assertEquals(desembarqueDaVoltaNoCaminho(["Quanto é até Bacabeira?", "vou pra São Luís"], "pirapemas"), null);
  assertEquals(desembarqueDaVoltaNoCaminho(["vaga para Pirapemas"], "cantanhede"), null);
  assertEquals(desembarqueDaVoltaNoCaminho(["quero passagem pra Campestre"], "cantanhede"), null);
});

Deno.test("#523: Volta com o lugar de São Luís onde ele disse que desce", () => {
  assertEquals(desembarqueDaVoltaEscrito(["Vou ficar na rodoviária"]), "Rodoviária");
  assertEquals(desembarqueDaVoltaEscrito(["Quanto tá a passagem de Cantanhede para São Luís ate a rodoviária?"]), "Rodoviária");
  assertEquals(desembarqueDaVoltaEscrito(["60 até o terminal do Maracanã?"]), "Terminal do Maracanã");
  assertEquals(desembarqueDaVoltaEscrito(["me deixa lá no posto carone"]), "Posto Carone");
  assertEquals(desembarqueDaVoltaEscrito(["Até no retorno"]), "Retorno das Vans");
  // "retorno" = volta; rodoviária do interior; embarque
  assertEquals(desembarqueDaVoltaEscrito(["passagem amanhã a tarde e retorno segunda-feira de manhã"]), null);
  assertEquals(desembarqueDaVoltaEscrito(["vou ficar na rodoviária de Cantanhede"]), null);
  assertEquals(desembarqueDaVoltaEscrito(["irei aguardar na rodoviária"]), null);
});

Deno.test("#523: desembarque que é cópia do embarque sai; lugar de São Luís fica", () => {
  assertEquals(desembarqueCopiaDoEmbarque("Av Dr Exemplo Guimarães", "Av Dr Exemplo Guimarães"), true);
  assertEquals(desembarqueCopiaDoEmbarque("Rua Exemplo Sarney, São Luís", "Rua Exemplo Sarney"), true);
  assertEquals(desembarqueCopiaDoEmbarque("Bar do Exemplo na estrada Matões", "Bar do Exemplo na estrada Matões"), true);
  assertEquals(desembarqueCopiaDoEmbarque("São Luís", "Rua Exemplo"), false);
  assertEquals(desembarqueCopiaDoEmbarque("Em casa (bairro)", "Rua Exemplo"), false);
  assertEquals(desembarqueCopiaDoEmbarque("Cohatrac, Rua do Exemplo Bar", "Rua do Exemplo Bar", ["Cohatrac"]), false);
  assertEquals(desembarqueCopiaDoEmbarque("Cidade Operária, rua 2", "Estrada Matões, em frente à quadra"), false);
});

Deno.test("#523: endereço da Volta pela resposta, pela equipe ou pelo que o cliente disse", () => {
  assertEquals(
    enderecoDaVoltaDito([
      c("Tem vaga pra quarta a tarde?"),
      e("Temos sim"),
      e("Qual o endereço pra lhe buscar"),
      c("Rua da Exemplo"),
      c("Quase em frente a casa da professora"),
      c("Dá pra levar uma sapateira?"),
      e("Agendado ☑️"),
    ]),
    { endereco: "Rua da Exemplo, Quase em frente a casa da professora", como: "resposta" },
  );
  assertEquals(
    enderecoDaVoltaDito([c("quero marcar para São Luís, amanhã"), c("Na casa do Exemplo das antenas"), e("Qual a rua?"), c("José Exemplo")]),
    { endereco: "José Exemplo, casa do Exemplo das antenas", como: "resposta" },
  );
  assertEquals(
    enderecoDaVoltaDito([c("gostaria de duas passagens em pirapemas"), c("Pra sábado."), e("Buscar na casa do exemplo pintor certo")]),
    { endereco: "casa do exemplo pintor", como: "equipe" },
  );
  assertEquals(enderecoDaVoltaDito([c("Tabom pois reserva uma vaga prami eu moro na rua da exemplo")]), { endereco: "rua da exemplo", como: "dito" });
  assertEquals(enderecoDaVoltaDito([c("Vou ficar aq na provisória, rua da exemplo")]), { endereco: "provisória, rua da exemplo", como: "dito" });
  assertEquals(enderecoDaVoltaDito([c("Para são Luis vou ficar  na Na praça meu nome é fulano")]), { endereco: "praça", como: "dito" });
  // lugar de São Luís é desembarque; pergunta, saudação e "ok" não são endereço
  assertEquals(enderecoDaVoltaDito([c("vou ficar na rodoviária")]), null);
  assertEquals(enderecoDaVoltaDito([c("vou ficar na rua 2 do Cohatrac")], ["Cohatrac"]), null);
  assertEquals(enderecoDaVoltaDito([e("Qual o endereço"), c("Bom dia"), c("ok"), c("que horas passa?")]), null);
});

Deno.test("#523: no pedido lido, completa o que falta e tira o que é cópia", () => {
  const ctx = { pontos: { ida: ["busca", "retorno"], volta: ["pirapemas", "cantanhede"] }, bairros: ["Cohatrac"], sentidos: ["volta"], temCostume: false };
  const p = { direcao: null, cidade_dita: "pirapemas", endereco: null, desembarque: "Casa do Exemplo Pintor (São Luís)" };
  completarLugares(p, [c("duas passagens em pirapemas"), e("Buscar na casa do exemplo pintor certo")], ctx);
  assertEquals([p.endereco, p.desembarque], ["casa do exemplo pintor", null] as unknown as null[]);
  const q = { direcao: "volta", cidade_dita: "pirapemas", endereco: null as string | null, desembarque: null };
  completarLugares(q, [c("Vou ficar aq na provisória, rua da exemplo"), e("Pra lhe buscar na provisória certo?")], ctx);
  assertEquals(q.endereco, "provisória, rua da exemplo");
  const i = { direcao: "ida", ponto: "retorno", desembarque: "Em casa (bairro)" };
  completarLugares(i, [c("Vou pegar lá no retorno pra pirapemas")], { ...ctx, sentidos: ["ida"] });
  assertEquals(i.desembarque, "Pirapemas");
  // o que o leitor achou não é trocado; com Ida na mesma leitura, o endereço não é completado
  const k = { direcao: "volta", endereco: "Rua do Exemplo", desembarque: "Cohatrac" };
  completarLugares(k, [e("Qual o endereço?"), c("Rua da Outra")], ctx);
  assertEquals([k.endereco, k.desembarque], ["Rua do Exemplo", "Cohatrac"]);
  const d = { direcao: "volta", endereco: null, desembarque: null };
  completarLugares(d, [e("Qual o endereço?"), c("Rua da Outra")], { ...ctx, sentidos: ["ida", "volta"] });
  assertEquals(d.endereco, null);
});
