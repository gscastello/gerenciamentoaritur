import { describe, expect, it } from "vitest";
import { montarFechamento } from "../../domain/fechamentoDoMes.js";
import { htmlDoFechamento } from "../fechamentoExport.js";

// O PDF do fechamento (issue #365) leva descrições digitadas pela equipe: nada
// do que vem do banco pode virar HTML.
describe("PDF do fechamento", () => {
  const f = montarFechamento({
    mes: "2026-10",
    gerado_em: "2026-11-01T11:00:00Z",
    numeros: { lancamentos: { receita: 100, despesa: 40, despesa_por_categoria: { outro: 40 } } },
    lancamentos: [
      {
        data: "2026-10-02",
        tipo: "despesa",
        categoria: "outro",
        valor: 40,
        descricao: '<img src=x onerror="alert(1)">',
        nota: null,
      },
    ],
  });
  const html = htmlDoFechamento(f);

  it("escapa o texto vindo do banco", () => {
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
  it("traz o título, o resultado e as datas no formato brasileiro", () => {
    expect(html).toContain("Fechamento de outubro de 2026");
    expect(html).toContain("Resultado antes do imposto");
    expect(html).toContain("02/10/2026");
    expect(html).toMatch(/R\$\s*60,00/);
  });
});
