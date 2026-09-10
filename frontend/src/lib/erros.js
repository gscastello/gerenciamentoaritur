// src/lib/erros.js
//
// Duas coisas, separadas de propósito:
//   - mensagemAmigavel(e): o que o USUÁRIO vê — curto, em PT-BR, sem
//     jargão nem stack. Regra de negócio que já vem legível do banco
//     passa direto (só tira o prefixo técnico "contexto: ").
//   - logTecnico(e, ctx): o que o ADMIN vê — mensagem + code + stack no
//     console, no Sentry (se ligado) e, quando disponível, na tabela
//     app_error_log (via rpc_log_client_error).

import { reportError } from "../observability/index.js";
import { supabase } from "./supabaseClient.js";

const POR_CODE = {
  "23505": "Esse registro já existe.",
  "23503": "Não dá para concluir — há dados ligados a este registro.",
  "23514": "Algum campo está fora do valor permitido.",
  "22P02": "Algum campo está com formato inválido.",
  "22007": "Data inválida.",
  "42501": "Você não tem permissão para isso.",
  "P0001": null, // regra de negócio — a própria mensagem já é amigável
  PGRST301: "Sua sessão expirou — entre de novo.",
};

function limpaPrefixo(msg) {
  return String(msg || "").replace(/^[a-zA-Z_][\w]*:\s+/, "");
}

/**
 * @param {unknown} error
 * @param {string} [fallback]
 * @returns {string} mensagem pronta para mostrar ao usuário
 */
export function mensagemAmigavel(error, fallback = "Não foi possível concluir. Tente de novo.") {
  const raw = error?.message || "";
  const semPrefixo = limpaPrefixo(raw).trim();
  const code = error?.code || error?.cause?.code;

  if (code && Object.hasOwn(POR_CODE, code) && POR_CODE[code]) return POR_CODE[code];

  if (/CAPACIDADE_EXCEDIDA|lotad|sem vaga|não há vaga/i.test(raw)) {
    return semPrefixo || "Viagem lotada.";
  }
  if (/failed to fetch|networkerror|network request|timeout|conexão/i.test(raw)) {
    return "Sem conexão. Verifique a internet e tente de novo.";
  }
  if (/jwt|refresh token|not authenticated|sessão|usuário não autenticado/i.test(raw)) {
    return "Sua sessão expirou — entre de novo.";
  }

  // mensagem curta de regra de negócio (as RPCs devolvem `message` em
  // PT-BR) — mostra como está, sem virar "erro genérico".
  if (
    semPrefixo &&
    semPrefixo.length <= 140 &&
    !/\b(error|exception|null|undefined|stack|TypeError|at\s)\b/i.test(semPrefixo)
  ) {
    return semPrefixo;
  }
  return fallback;
}

let ultimoLog = 0;

/**
 * Registra o erro técnico. Nunca lança — é o fim da linha do tratamento.
 */
export function logTecnico(error, contexto = {}) {
  const detalhe = {
    ...contexto,
    message: error?.message ?? String(error),
    code: error?.code ?? error?.cause?.code ?? null,
  };
  // biome-ignore lint/suspicious/noConsole: log técnico é o objetivo aqui
  console.error("[erro]", detalhe, error);
  try {
    reportError(error, contexto);
  } catch {
    /* observabilidade nunca pode derrubar o fluxo */
  }
  // throttle: no máximo 1 gravação no banco a cada 3s (evita tempestade)
  const agora = Date.now();
  if (agora - ultimoLog > 3000) {
    ultimoLog = agora;
    let url = "";
    let ua = "";
    try {
      url = window.location?.href ?? "";
      ua = navigator.userAgent ?? "";
    } catch {
      /* SSR / ambiente sem window */
    }
    supabase
      .rpc("rpc_log_client_error", {
        p_message: String(detalhe.message).slice(0, 500),
        p_code: detalhe.code ? String(detalhe.code).slice(0, 40) : null,
        p_context: { ...contexto, url, user_agent: ua },
      })
      .then(
        () => {},
        () => {}, // silencioso — observabilidade nunca derruba o fluxo
      );
  }
}
