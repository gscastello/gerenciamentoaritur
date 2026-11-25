// supabase/functions/_shared/pilotoPuro.ts
//
// Piloto do atendente de IA (issue #537): regras PURAS.

/** Nota privada da equipe: "#parar" e "#religar". */
export function comandoDoPiloto(conteudo: string | null | undefined): "parar" | "religar" | null {
  const t = String(conteudo ?? "").trim().toLowerCase();
  if (/^#parar\b/.test(t)) return "parar";
  return /^#religar\b/.test(t) ? "religar" : null;
}
