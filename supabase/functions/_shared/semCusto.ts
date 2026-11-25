// supabase/functions/_shared/semCusto.ts
//
// Testes sem gastar API (dono, 25/11 — issue #537). Com a trava ligada (só no avaliar-bot), nada chama modelo
// pago nem busca na internet: vale o que já foi lido e guardado; o que não foi, o teste diz que não tem leitura.

let ligado = false;

export function travarCusto(sim: boolean): void {
  ligado = sim;
}

export function semCusto(): boolean {
  return ligado;
}

export class SemLeituraGuardada extends Error {
  constructor(o: string) {
    super(`sem leitura guardada (${o}); teste grátis não chama a IA`);
  }
}
