import { assert, assertEquals } from "jsr:@std/assert";
import { ladoEscrito, ladoPelaBase, lugaresContraOSentido, paradaDoInterior } from "./ladoDaRota.ts";

const ctx = {
  bairros: [{ neighborhood: "Cohatrac" }, { neighborhood: "Estrada da Maioba" }, { neighborhood: "Centro" }, { neighborhood: "Turu" }],
  locaisDeOutros: ["Estiva", "Pedrinhas", "Vila Itamar"],
};

Deno.test("#426 de que lado da rota é o lugar", () => {
  assertEquals(ladoEscrito("Retorno das Vans", ctx), "sao_luis");
  assertEquals(ladoEscrito("Rodoviária", ctx), "sao_luis");
  assertEquals(ladoEscrito("Aeroporto de São Luís", ctx), "sao_luis");
  assertEquals(ladoEscrito("entrada da Vila Itamar, perto da PRF", ctx), "sao_luis");
  assertEquals(ladoEscrito("Condomínio Belleville, Estrada da Maioba", ctx), "sao_luis");
  assertEquals(ladoEscrito("Cohatrac", ctx), "sao_luis");
  assertEquals(ladoEscrito("Rua Newton Belo 233 - Centro, Pirapemas", ctx), "interior");
  assertEquals(ladoEscrito("Rodoviária de Miranda", ctx), "interior");
  assertEquals(ladoEscrito("Praça da Cruz, Cantanhede", ctx), "interior");
  // nome de rua e de residencial não é a cidade; bairro genérico e rua com nome de bairro não decidem
  assertEquals(ladoEscrito("Rua Santa Rita de Cássia, 28", ctx), null);
  assertEquals(ladoEscrito("Residencial Pirapemas", ctx), null);
  assertEquals(ladoEscrito("Centro", ctx), null);
  assertEquals(ladoEscrito("rua do Turu, perto da padaria", ctx), null);
  // os dois lados: não decide
  assertEquals(ladoEscrito("Pirapemas, saída pra São Luís", ctx), null);
  assertEquals(paradaDoInterior("perto da igreja de Campestre"), "campestre");
  assertEquals(ladoPelaBase({ interiorForte: true, saoLuisNaMemoria: false }), "interior");
  assertEquals(ladoPelaBase({ interiorForte: true, saoLuisNaMemoria: true }), null);
});

Deno.test("#426 embarque/desembarque que não combinam com o sentido", () => {
  // caso real: "Aguardo vcs no retorno" lançado como Volta saindo de Pirapemas
  assert(lugaresContraOSentido({ direction: "volta", route_point_code: "pirapemas", pickup_detail: "Retorno das Vans" }, ctx));
  // Volta com ponto da Ida
  assert(lugaresContraOSentido({ direction: "volta", route_point_code: "retorno" }, ctx));
  // Ida "busca em casa" num endereço de Pirapemas
  assert(lugaresContraOSentido({ direction: "ida", route_point_code: "busca", pickup_detail: "Rua Newton Belo, Pirapemas" }, ctx));
  // Ida com o ponto da Volta
  assert(lugaresContraOSentido({ direction: "ida", route_point_code: "cantanhede" }, ctx));
  // Ida que desce em São Luís; Volta que desce no interior saindo de Pirapemas pra Pirapemas
  assert(lugaresContraOSentido({ direction: "ida", route_point_code: "busca", pickup_neighborhood: "Turu", dropoff_location: "Cohatrac" }, ctx));
  // Volta embarcando num bairro de São Luís
  assert(lugaresContraOSentido({ direction: "volta", route_point_code: "cantanhede", pickup_detail: "Condomínio Belleville, Estrada da Maioba" }, ctx));

  // o que combina passa
  assertEquals(lugaresContraOSentido({ direction: "ida", route_point_code: "retorno", pickup_detail: "Retorno das Vans", dropoff_location: "Pirapemas" }, ctx), null);
  assertEquals(lugaresContraOSentido({ direction: "ida", route_point_code: "busca", pickup_neighborhood: "Cohatrac", pickup_detail: "Rua 10" }, ctx), null);
  assertEquals(lugaresContraOSentido({ direction: "volta", route_point_code: "pirapemas", pickup_detail: "Rua do Sol", dropoff_location: "Rodoviária" }, ctx), null);
  assertEquals(lugaresContraOSentido({ direction: "ida", route_point_code: "outro", pickup_detail: "Estiva (BR)", dropoff_location: "Cantanhede" }, ctx), null);
  // entre cidades do interior vale a ordem das paradas
  assertEquals(lugaresContraOSentido({ direction: "ida", route_point_code: "outro", pickup_detail: "Cantanhede, Praça da Cruz", dropoff_location: "Pirapemas" }, ctx), null);
  assertEquals(lugaresContraOSentido({ direction: "volta", route_point_code: "pirapemas", pickup_detail: "Rua do Sol", dropoff_location: "Rodoviária de Miranda" }, ctx), null);
  assert(lugaresContraOSentido({ direction: "volta", route_point_code: "cantanhede", pickup_detail: "Praça da Cruz", dropoff_location: "Pirapemas" }, ctx));
  // encomenda não entra; lado que a base de lugares resolveu vence o texto
  assertEquals(lugaresContraOSentido({ type: "encomenda", direction: "volta", route_point_code: "pirapemas", pickup_detail: "Retorno" }, ctx), null);
  assert(lugaresContraOSentido({ direction: "ida", route_point_code: "busca", pickup_detail: "Avenida Exemplo, 1025" }, { ...ctx, ladoDoEmbarque: "interior" }));
});
