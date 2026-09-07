#!/usr/bin/env bash
# Faz merge de um PR do repositório via API do GitHub.
#
#   scripts/merge-pr.sh <numero-do-pr> [squash|merge|rebase]
#
# O token vem do Git Credential Manager (mesma credencial usada pra push),
# então não precisa de gh CLI nem de token em variável de ambiente.
set -euo pipefail

PR="${1:?uso: scripts/merge-pr.sh <numero-do-pr> [squash|merge|rebase]}"
METHOD="${2:-squash}"

case "$METHOD" in
  squash|merge|rebase) ;;
  *) echo "método inválido: $METHOD (use squash, merge ou rebase)" >&2; exit 2 ;;
esac

# owner/repo a partir do remote origin (https ou ssh)
ORIGIN="$(git remote get-url origin)"
SLUG="$(printf '%s' "$ORIGIN" | sed -E 's#^(https://[^/]+/|git@[^:]+:)##; s#\.git$##')"

TOKEN="$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')"
if [ -z "$TOKEN" ]; then
  echo "sem credencial do GitHub no Git Credential Manager — rode 'git push' uma vez pra autenticar" >&2
  exit 1
fi

RESP="$(curl -sS -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${SLUG}/pulls/${PR}/merge" \
  -d "{\"merge_method\":\"${METHOD}\"}")"

echo "$RESP"

# saída de erro tem "message" e não tem "merged": true
if printf '%s' "$RESP" | grep -q '"merged": *true'; then
  echo "PR #${PR} merged (${METHOD}) em ${SLUG}."
else
  echo "falha ao fazer merge do PR #${PR}." >&2
  exit 1
fi
