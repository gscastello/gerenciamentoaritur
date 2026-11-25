import { assert, assertEquals } from "jsr:@std/assert";
import { ladoEscrito, ladoPelaBase, lugaresContraOSentido, paradaDoInterior } from "./ladoDaRota.ts";

const ctx = {
  bairros: [{ neighborhood: "Cohatrac" }, { neighborhood: "Estrada da Maioba" }, { neighborhood: "Centro" }, { neighborhood: "Turu" }],
  locaisDeOutros: ["Estiva", "Pedrinhas", "Vila Itamar"],
};

Deno.test("#426 de que lado da rota é o lugar", () => {
  assertEquals(ladoEscrito("Retorno das Vans", ctx), "sao_luis");
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
  // Ida que desce em São Luís (sinal forte)
  assert(lugaresContraOSentido({ direction: "ida", route_point_code: "busca", pickup_neighborhood: "Turu", dropoff_location: "Rodoviária de São Luís" }, ctx));
  // nome de bairro de São Luís sozinho NÃO trava: existe no interior também ("Bairro São Francisco")
  assertEquals(lugaresContraOSentido({ direction: "volta", route_point_code: "pirapemas", pickup_detail: "Pira Lanches, Bairro Estrada da Maioba" }, ctx), null);
  assertEquals(lugaresContraOSentido({ direction: "ida", route_point_code: "busca", pickup_neighborhood: "Turu", dropoff_location: "Cohatrac" }, ctx), null);

  // o que combina passa
  assertEquals(lugaresContraOSentido({ direction: "ida", route_point_code: "retorno", pickup_detail: "Retorno das Vans", dropoff_location: "Pirapemas" }, ctx), null);
  assertEquals(lugaresContraOSentido({ direction: "ida", route_point_code: "busca", pickup_neighborhood: "Cohatrac", pickup_detail: "Rua 10" }, ctx), null);
  assertEquals(lugaresContraOSentido({ direction: "volta", route_point_code: "pirapemas", pickup_detail: "Rua do Sol", dropoff_location: "Rodoviária" }, ctx), null);
  assertEquals(lugaresContraOSentido({ direction: "ida", route_point_code: "outro", pickup_detail: "Estiva (BR)", dropoff_location: "Cantanhede" }, ctx), null);
  // entre cidades do interior vale a ordem das paradas
  assertEquals(lugaresContraOSentido({ direction: "ida", route_point_code: "outro", pickup_detail: "Cantanhede, Praça da Cruz", dropoff_location: "Pirapemas" }, ctx), null);
  assertEquals(lugaresContraOSentido({ direction: "volta", route_point_code: "pirapemas", pickup_detail: "Rua do Sol", dropoff_location: "Rodoviária de Miranda" }, ctx), null);
  assert(lugaresContraOSentido({ direction: "volta", route_point_code: "cantanhede", pickup_detail: "Praça da Cruz", dropoff_location: "Pirapemas" }, ctx));
  // "rodoviária" escrita não decide (Cantanhede tem); bairro de São Luís + cidade no texto: os dois lados
  assertEquals(lugaresContraOSentido({ direction: "volta", route_point_code: "cantanhede", pickup_detail: "Rua do Matadouro 20 — Rodoviária" }, ctx), null);
  assertEquals(lugaresContraOSentido({ direction: "ida", route_point_code: "busca", pickup_neighborhood: "Cohatrac", pickup_detail: "Rua do Pêssego, 29 — Cantanhede" }, ctx), null);
  // encomenda não entra; lado que a base de lugares resolveu vence o texto
  assertEquals(lugaresContraOSentido({ type: "encomenda", direction: "volta", route_point_code: "pirapemas", pickup_detail: "Retorno" }, ctx), null);
  assert(lugaresContraOSentido({ direction: "ida", route_point_code: "busca", pickup_detail: "Avenida Exemplo, 1025" }, { ...ctx, ladoDoEmbarque: "interior" }));
});

Deno.test("#426 'Jardim Araçagy, Cohatrac': o bairro é o pedaço escrito, não o nome do lugar", async () => {
  const { bairroForaDoNomeComposto } = await import("./rascunhoPuro.ts");
  const tabela = [{ neighborhood: "Araçagy" }, { neighborhood: "Cohatrac" }, { neighborhood: "Turu" }];
  assertEquals(bairroForaDoNomeComposto("Araçagy", ["Jardim aracagy, Cohatrac\nPróximo a arena, kit net azul"], tabela)?.neighborhood, "Cohatrac");
  // escreveu o bairro sozinho: vale o lido
  assertEquals(bairroForaDoNomeComposto("Araçagy", ["Rua 5, Araçagy"], tabela), null);
  // nome composto sem outro bairro: não mexe
  assertEquals(bairroForaDoNomeComposto("Turu", ["Jardim Turu, Rua N, casa 32"], tabela), null);
});

Deno.test("#530: Pirapemas até Cantanhede é extra; em pé só no ônibus e nos trechos curtos", async () => {
  const { trechoCurto } = await import("./ladoDaRota.ts");
  const t = (ponto: string, para: string, cap: number | null = 31, direction = "volta") =>
    trechoCurto({ direction, route_point_code: ponto, pickup_detail: "Rua do Exemplo", dropoff_location: para }, cap);
  assertEquals(t("pirapemas", "Cantanhede, na praça"), { extra: true, emPe: true });
  assertEquals(t("pirapemas", "Cantanhede", 15), { extra: true, emPe: false });
  assertEquals(t("cantanhede", "Miranda do Norte"), { extra: false, emPe: true });
  assertEquals(t("pirapemas", "Matões do Norte", 15), { extra: false, emPe: false });
  assertEquals(t("pirapemas", "Entroncamento"), { extra: false, emPe: false });
  assertEquals(t("pirapemas", "São Luís"), { extra: false, emPe: false });
  assertEquals(t("busca", "Cantanhede", 31, "ida"), { extra: false, emPe: false });
});
