import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  decidirComprovante,
  instrucoesDoComprovante,
  normalizarComprovante,
  notaDaBaixa,
  palavrasDaEmpresa,
  recebedorEhAEmpresa,
  type ReservaParaBaixa,
  reservasDoValor,
} from "./comprovantePuro.ts";

// Comprovante Pix no WhatsApp (issue #363): baixa só quando tudo bate.
const hoje = "2026-11-12";
const pix = { key: "98981012388", name: "A O Castelo Transporte e Turismo" };
const r = (id: string, data: string, direcao: "ida" | "volta", total: number, extra: Partial<ReservaParaBaixa> = {}): ReservaParaBaixa => ({
  id, data, direcao, total, pago: false, status: "confirmada", ...extra,
});
const leitura = (x: Record<string, unknown>) =>
  normalizarComprovante({ eh_comprovante: true, data: "2026-11-12", recebedor: "A O CASTELO TRANSP", ...x }, hoje);

Deno.test("normalizarComprovante: valor brasileiro, data válida, txid sem espaços", () => {
  const l = normalizarComprovante({ eh_comprovante: true, valor: "1.160,00", data: "2026-11-11", txid: "E1234 5678", pagador: " Maria  S " }, hoje);
  assertEquals(l.valor, 1160);
  assertEquals(l.data, "2026-11-11");
  assertEquals(l.txid, "E12345678");
  assertEquals(l.pagador, "Maria S");
  assertEquals(normalizarComprovante({ eh_comprovante: true, valor: -2, data: "2026-12-30" }, hoje).valor, null);
  assertEquals(normalizarComprovante({ eh_comprovante: true, data: "2026-12-30" }, hoje).data, null); // futuro
  assertEquals(normalizarComprovante({ data: "2026-02-31" }, hoje).data, null);
  assertEquals(normalizarComprovante(null, hoje).eh_comprovante, false);
  assertEquals(normalizarComprovante({ eh_comprovante: "sim" }, hoje).eh_comprovante, false);
});

Deno.test("recebedor: pelo nome próprio da empresa ou pela chave (mascarada também)", () => {
  assertEquals(palavrasDaEmpresa(pix.name), ["castelo"]);
  assert(recebedorEhAEmpresa(leitura({ recebedor: "A.O. CASTELO TRANSPORTE" }), pix));
  assert(!recebedorEhAEmpresa(leitura({ recebedor: "Castelinho Bar" }), pix));
  assert(!recebedorEhAEmpresa(leitura({ recebedor: "Joao da Silva" }), pix));
  assert(recebedorEhAEmpresa(leitura({ recebedor: null, chave_recebedor: "(98) 98101-2388" }), pix));
  assert(recebedorEhAEmpresa(leitura({ recebedor: null, chave_recebedor: "***012388" }), pix));
  assert(!recebedorEhAEmpresa(leitura({ recebedor: null, chave_recebedor: "***388" }), pix)); // pouco demais
  assert(!recebedorEhAEmpresa(leitura({ recebedor: null }), { key: null, name: null }));
});

Deno.test("reservasDoValor: uma exata (a mais próxima), Ida+Volta somadas, ou nenhuma", () => {
  const lista = [r("volta", "2026-11-16", "volta", 80), r("ida", "2026-11-14", "ida", 80), r("velha", "2026-11-01", "ida", 80, { pago: true })];
  assertEquals(reservasDoValor(80, lista, hoje).map((x) => x.id), ["ida"]); // empate: a próxima viagem
  assertEquals(reservasDoValor(160, lista, hoje).map((x) => x.id), ["ida", "volta"]);
  assertEquals(reservasDoValor(100, lista, hoje), []);
  assertEquals(reservasDoValor(80, [r("c", "2026-11-14", "ida", 80, { status: "cancelada" })], hoje), []);
  // viagem de ontem ainda sem pagar: vale quando é a única com o valor
  assertEquals(reservasDoValor(60, [r("ontem", "2026-11-11", "volta", 60)], hoje).map((x) => x.id), ["ontem"]);
});

Deno.test("decidirComprovante: baixa só quando tudo bate; o resto vira pendência com motivo", () => {
  const reservas = [r("ida", "2026-11-14", "ida", 80)];
  const ok = decidirComprovante(leitura({ valor: 80 }), { hoje, pix, reservas });
  assertEquals(ok.tipo, "baixa");
  if (ok.tipo === "baixa") assertEquals(ok.reservas.map((x) => x.id), ["ida"]);

  assertEquals(decidirComprovante(normalizarComprovante({ eh_comprovante: false }, hoje), { hoje, pix, reservas }).tipo, "nao_e_comprovante");
  const motivo = (x: Record<string, unknown>, rs: ReservaParaBaixa[] | null = reservas) => {
    const d = decidirComprovante(leitura(x), { hoje, pix, reservas: rs });
    return d.tipo === "pendencia" ? d.motivo : d.tipo;
  };
  assertStringIncludes(motivo({ valor: null }), "sem valor");
  assertStringIncludes(motivo({ valor: 80, recebedor: "Outra Van Ltda", chave_recebedor: null }), "Outra Van");
  assertStringIncludes(motivo({ valor: 80, data: null }), "sem data");
  assertStringIncludes(motivo({ valor: 80, data: "2026-10-20" }), "antigo");
  assertStringIncludes(motivo({ valor: 80 }, null), "sem cadastro");
  assertStringIncludes(motivo({ valor: 75 }), "R$ 75,00 não bate");
});

Deno.test("nota da baixa e instruções", () => {
  const n = notaDaBaixa(leitura({ valor: 160, pagador: "Maria" }), [r("a", "2026-11-14", "ida", 80), r("b", "2026-11-16", "volta", 80)]);
  assertEquals(n, "🧾 Comprovante conferido: R$ 160,00 de Maria. Marquei como pago: Ida 14/11, Volta 16/11.");
  assertStringIncludes(instrucoesDoComprovante(hoje), "hoje é 2026-11-12");
});
