// Trava da issue #444 (depois da #442): o Supabase corta toda leitura em 1.000 linhas SEM erro.
// Este teste lê os services e falha quando uma leitura de lista não tem limite pequeno, não é de
// uma linha só, não usa `buscarTodasAsPaginas` e não está na lista de tabelas que nunca chegam a
// 1.000 linhas. Consulta nova de lista: pagine (lib/paginas.js) ou justifique aqui.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PASTA = path.resolve(__dirname, "..");

// Leituras que cabem com folga em 1.000 linhas, com o motivo.
const PEQUENAS = {
  // cadastros e ajustes editados à mão pela equipe (dezenas de linhas)
  "assistenteService.js:assistente_chaves": "chaves do próprio usuário",
  "botKnowledgeService.js:bot_knowledge": "base de conhecimento escrita pelo dono",
  "dropoffAreasService.js:dropoff_areas": "áreas de desembarque",
  "expenseCategoriesService.js:expense_categories": "categorias de despesa",
  "locaisOutrosService.js:boarding_spot_prices": "locais em Outros",
  "maintenanceTypesService.js:maintenance_types": "tipos de manutenção",
  "recurringExpensesService.js:recurring_expense_templates": "custos fixos",
  "routeFaresService.js:route_fares": "trechos entre cidades da rota (9 paradas)",
  "routeFaresService.js:bot_price_suggestions": "sugestões ainda não revisadas",
  "routePointsService.js:route_points": "pontos de embarque",
  "settingsService.js:settings": "ajustes do sistema",
  "usersService.js:users": "equipe",
  "vehiclesService.js:vehicles": "frota",
  "vehiclesService.js:drivers": "motoristas",
  // filtradas por um dia, uma viagem, uma reserva ou um passageiro
  "avisosService.js:avisos_passageiros": "avisos de uma viagem",
  "customersService.js:reservations": "reservas de um passageiro",
  "financeService.js:financial_entries": "lançamentos de um dia (o do mês é paginado)",
  "operationService.js:fuel_records": "abastecimentos de um veículo desde a última manutenção",
  "paymentsService.js:payments": "pagamentos de uma reserva ou pendentes de um dia",
  "reservationsService.js:v_reservations_flat":
    "reservas de um dia (janela e pendentes são paginadas)",
  "tripsService.js:v_trip_occupancy": "as duas viagens de um dia",
  "tripsService.js:trips": "viagens do período da Agenda (2 por dia)",
};

/** Leituras de lista sem limite, sem linha única e sem paginação, como "arquivo:tabela". */
function leiturasSemLimite(arquivo, fonte) {
  const achadas = [];
  const re = /\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)/g;
  for (let m = re.exec(fonte); m; m = re.exec(fonte)) {
    let fim = m.index;
    let nivel = 0;
    for (; fim < Math.min(fonte.length, m.index + 1200); fim++) {
      const c = fonte[fim];
      if (c === "(") nivel++;
      else if (c === ")") {
        nivel--;
        if (nivel < 0) break;
      } else if (c === ";" && nivel === 0) break;
    }
    const cadeia = fonte.slice(m.index, fim);
    if (!/\.select\(/.test(cadeia)) continue;
    if (/\.(insert|update|upsert|delete)\(/.test(cadeia)) continue;
    if (/\.(limit|single|maybeSingle|range)\(/.test(cadeia) || /head:\s*true/.test(cadeia))
      continue;
    // dentro de buscarTodasAsPaginas(() => …) ou de um `montar` entregue a ela
    const antes = fonte.slice(Math.max(0, m.index - 260), m.index);
    if (/buscarTodasAsPaginas\(\s*(\(\)\s*=>\s*\{?)?[^;]*$/.test(antes)) continue;
    if (
      /const montar = \(\) => \{[^}]*$/.test(antes) &&
      /buscarTodasAsPaginas\(montar\)/.test(fonte)
    ) {
      continue;
    }
    achadas.push(`${arquivo}:${m[1]}`);
  }
  return achadas;
}

describe("nenhuma lista dos services pode ser cortada em 1.000 linhas (issue #444)", () => {
  const arquivos = fs.readdirSync(PASTA).filter((f) => f.endsWith(".js"));
  const semLimite = arquivos.flatMap((f) =>
    leiturasSemLimite(f, fs.readFileSync(path.join(PASTA, f), "utf8")),
  );

  it("toda leitura de lista sem limite é paginada ou é de uma tabela pequena conhecida", () => {
    const novas = [...new Set(semLimite)].filter((chave) => !PEQUENAS[chave]);
    expect(novas, "pagine com buscarTodasAsPaginas ou justifique em PEQUENAS").toEqual([]);
  });

  it("a lista de tabelas pequenas não guarda entrada que já não existe", () => {
    const sobrando = Object.keys(PEQUENAS).filter((chave) => !semLimite.includes(chave));
    expect(sobrando).toEqual([]);
  });

  it("o leitor acusa uma lista sem limite e aceita a paginada", () => {
    const solta = `supabase.from("reservations").select("*").eq("x", 1);`;
    const paginada = `buscarTodasAsPaginas(() =>\n supabase.from("reservations").select("*").order("id"),\n);`;
    const comMontar = `const montar = () => {\n let q = supabase.from("reservations").select("*");\n return q;\n};\nhandle(buscarTodasAsPaginas(montar));`;
    const umaLinha = `supabase.from("reservations").select("*").eq("id", id).maybeSingle();`;
    const gravacao = `supabase.from("reservations").update({ a: 1 }).eq("id", id).select();`;
    expect(leiturasSemLimite("a.js", solta)).toEqual(["a.js:reservations"]);
    for (const ok of [paginada, comMontar, umaLinha, gravacao]) {
      expect(leiturasSemLimite("a.js", ok)).toEqual([]);
    }
  });
});
