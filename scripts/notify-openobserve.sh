#!/usr/bin/env bash
# Envía un evento del pipeline CI/CD a OpenObserve (API HTTP/JSON, stream "cicd_events").
# Uso: notify-openobserve.sh <event_type> <status> [detalle]
#   event_type: test_run | deploy
#   status:     success | failure | blocked
# Requiere: O2_URL, O2_USER, O2_PASSWORD (secrets) y variables estándar de GitHub Actions.
set -uo pipefail

EVENT_TYPE="${1:?event_type requerido}"
STATUS="${2:?status requerido}"
DETAIL="${3:-}"

if [ -z "${O2_URL:-}" ]; then
  echo "::warning::O2_URL no configurado; no se envía el evento a OpenObserve"
  exit 0
fi

PAYLOAD=$(jq -n \
  --arg event_type "$EVENT_TYPE" \
  --arg status "$STATUS" \
  --arg detail "$DETAIL" \
  --arg commit "${GITHUB_SHA:-local}" \
  --arg commit_short "${GITHUB_SHA:0:7}" \
  --arg commit_message "${COMMIT_MESSAGE:-}" \
  --arg branch "${GITHUB_REF_NAME:-local}" \
  --arg actor "${GITHUB_ACTOR:-local}" \
  --arg repository "${GITHUB_REPOSITORY:-}" \
  --arg workflow "${GITHUB_WORKFLOW:-}" \
  --arg trigger "${GITHUB_EVENT_NAME:-}" \
  --arg run_id "${GITHUB_RUN_ID:-}" \
  --arg run_number "${GITHUB_RUN_NUMBER:-}" \
  --arg run_url "${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}" \
  --arg backend_tests "${BACKEND_RESULT:-}" \
  --arg e2e_tests "${E2E_RESULT:-}" \
  --arg server "${EC2_HOST:-}" \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '[{event_type: $event_type, status: $status, detail: $detail, commit: $commit,
     commit_short: $commit_short, commit_message: $commit_message, branch: $branch,
     actor: $actor, repository: $repository, workflow: $workflow, trigger: $trigger,
     run_id: $run_id, run_number: $run_number, run_url: $run_url,
     backend_tests: $backend_tests, e2e_tests: $e2e_tests, server: $server,
     timestamp: $timestamp}]')

echo "Enviando a OpenObserve: $PAYLOAD"
HTTP_CODE=$(curl -s -o /tmp/o2_response.txt -w '%{http_code}' --max-time 20 \
  -u "${O2_USER}:${O2_PASSWORD}" \
  -H 'Content-Type: application/json' \
  -X POST "${O2_URL%/}/api/default/cicd_events/_json" \
  -d "$PAYLOAD")

echo "OpenObserve respondió HTTP $HTTP_CODE: $(cat /tmp/o2_response.txt)"
if [ "$HTTP_CODE" != "200" ]; then
  echo "::warning::No se pudo registrar el evento en OpenObserve (HTTP $HTTP_CODE)"
fi
exit 0
