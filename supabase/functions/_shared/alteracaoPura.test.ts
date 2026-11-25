import { assertEquals } from "jsr:@std/assert@1";
import { type Alteracao, detalhesDaAlteracao, lugaresAMais, montarAlteracao, mudaOValor, type ReservaAtual } from "./alteracaoPura.ts";

const ida: ReservaAtual = {
  data: "2026-11-27",
  direcao: "ida",
  ponto: "busca",
  bairro: "Cohatrac",
  endereco: "Rua Um",
  desembarque: "Pirapemas",
  quantidade: 1,
  pagamento: "dinheiro",
};
const volta: ReservaAtual = {
  data: "2026-11-27",
  direcao: "volta",
  ponto: "cantanhede",
  bairro: null,
  endereco: "Praça da Cruz",
  desembarque: "Rodoviária",
  quantidade: 2,
  pagamento: "pix",
};
const PONTOS: Record<string, string[]> = { ida: ["busca", "rodoviaria", "retorno", "outro"], volta: ["pirapemas", "cantanhede"] };
const codigo = (n: string, d: "ida" | "volta") => (PONTOS[d].includes(n) ? n : null);
const muda = (r: ReservaAtual, p: Record<string, unknown>) => montarAlteracao(r, p, "2026-11-25", codigo);
const certo = (r: ReservaAtual, p: Record<string, unknown>): Alteracao => {
  const x = muda(r, p);
  if (!x.ok) throw new Error(x.erro);
  return x.alteracao;
};
const falha = (r: ReservaAtual, p: Record<string, unknown>) => {
  const x = muda(r, p);
  return x.ok ? "ok" : x.codigo;
};

Deno.test("#538: quantidade para mais e para menos", () => {
  const mais = certo(ida, { nova_quantidade: 3 });
  assertEquals([mais.quantidade, lugaresAMais(ida, mais), mais.mudou.viagem, mudaOValor(mais)], [3, 2, false, false]);
  const menos = certo(volta, { nova_quantidade: 1 });
  assertEquals([menos.quantidade, lugaresAMais(volta, menos)], [1, 0]);
  assertEquals(detalhesDaAlteracao(menos, null), {});
});

Deno.test("#538: mudar o dia confere vaga para todos e mantém o endereço", () => {
  const a = certo(volta, { nova_data: "2026-11-28" });
  assertEquals([a.data, a.endereco, lugaresAMais(volta, a)], ["2026-11-28", "Praça da Cruz", 2]);
  assertEquals(falha(ida, { nova_data: "2026-11-24" }), "DATA_INVALIDA");
  assertEquals(falha(ida, { nova_data: "amanhã" }), "DATA_INVALIDA");
});

Deno.test("#538: endereço antigo não sobra no lugar novo", () => {
  const rod = certo(ida, { novo_ponto: "rodoviaria" });
  assertEquals([rod.bairro, rod.endereco, mudaOValor(rod)], [null, null, true]);
  assertEquals(detalhesDaAlteracao(rod, null), { pickup_neighborhood: "", pickup_detail: "", street: "", reference_point: "" });
  const outroBairro = certo(ida, { novo_bairro: "Turu" });
  assertEquals([outroBairro.bairro, outroBairro.endereco], ["Turu", null]);
  const mesmoBairro = certo(ida, { novo_bairro: "cohatrac", novo_endereco: "Rua Dois" });
  assertEquals([mesmoBairro.bairro, mesmoBairro.endereco], ["cohatrac", "Rua Dois"]);
});

Deno.test("#538: lugar novo que precisa de endereço pergunta", () => {
  assertEquals(falha(volta, { novo_ponto: "pirapemas" }), "FALTA_EMBARQUE");
  assertEquals(falha(ida, { novo_ponto: "outro" }), "FALTA_EMBARQUE");
  assertEquals(falha({ ...ida, ponto: "retorno", bairro: null, endereco: null }, { novo_ponto: "busca" }), "FALTA_EMBARQUE");
  assertEquals(certo(volta, { novo_ponto: "pirapemas", novo_endereco: "Rua Nova" }).endereco, "Rua Nova");
});

Deno.test("#538: trocar o sentido troca embarque e desembarque", () => {
  assertEquals(falha(ida, { nova_direcao: "volta" }), "FALTA_EMBARQUE");
  assertEquals(falha(ida, { nova_direcao: "volta", novo_ponto: "rodoviaria" }), "PONTO_NAO_EXISTE");
  assertEquals(falha(ida, { nova_direcao: "norte" }), "SENTIDO_INVALIDO");
  const a = certo(ida, { nova_direcao: "volta", novo_ponto: "cantanhede", novo_endereco: "Praça da Cruz" });
  assertEquals([a.direcao, a.bairro, a.endereco, a.desembarque, a.mudou.desembarque], ["volta", null, "Praça da Cruz", null, true]);
});

Deno.test("#538: desembarque, pagamento e nome", () => {
  const d = certo(volta, { novo_desembarque: "Turu" });
  assertEquals(detalhesDaAlteracao(d, "casa"), { dropoff_location: "Turu", dropoff_area: "casa", dropoff_detail: "" });
  assertEquals(detalhesDaAlteracao(certo(ida, { nova_forma_pagamento: "pix" }), null), { payment_method: "pix" });
  assertEquals(certo(ida, { novo_nome: "Maria Silva" }).mudou.nome, true);
  assertEquals(falha(ida, { novo_nome: "Ma" }), "NOME_INVALIDO");
  assertEquals(falha(ida, { nova_forma_pagamento: "cheque" }), "PAGAMENTO_INVALIDO");
});

Deno.test("#538: nada mudou e quantidade impossível", () => {
  assertEquals(falha(ida, {}), "NADA_MUDOU");
  assertEquals(falha(ida, { nova_quantidade: 1, novo_desembarque: "pirapemas" }), "NADA_MUDOU");
  assertEquals(falha(ida, { nova_quantidade: 0 }), "QUANTIDADE_INVALIDA");
  assertEquals(falha(ida, { nova_quantidade: 40 }), "QUANTIDADE_INVALIDA");
});
