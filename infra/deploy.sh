#!/usr/bin/env bash
# Build and deploy Paatam.ai to Cloud Run (API + PostgREST sidecar, web app), schedule the
# AlloyDB → BigQuery sync, and run smoke tests. Run in Cloud Shell from the repo root:
#   bash infra/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh

TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
API_IMAGE="${API_IMAGE:-${IMAGE_BASE}/api:${TAG}}"
WEB_IMAGE="${WEB_IMAGE:-${IMAGE_BASE}/web:${TAG}}"

if [ "${SKIP_BUILD:-0}" = "1" ]; then
  log "1/5 Using images built by the Cloud Build trigger"
else
  log "1/5 Building images with Cloud Build (tag ${TAG})"
  build() { # dir image
    gcloud builds submit "$1" --region="$REGION" --config=infra/cloudbuild.yaml --quiet \
      --substitutions="_IMAGE=$2,_REGISTRY=${DOCKERHUB_PROXY}"
  }
  build smartstudy-backend "$API_IMAGE"
  build smartstudy-frontend "$WEB_IMAGE"
fi
ok "images ${API_IMAGE} / ${WEB_IMAGE}"

# Optional provider secrets are wired in only if they exist
OPTIONAL_SECRET_ENV=""
add_optional() { # secret-name ENV_NAME
  if gcloud secrets describe "$1" >/dev/null 2>&1; then
    OPTIONAL_SECRET_ENV+="            - name: $2
              valueFrom:
                secretKeyRef:
                  name: $1
                  key: latest
"
  fi
}
add_optional "${SECRET_PREFIX}-sarvam-api-key" SARVAM_API_KEY
add_optional "${SECRET_PREFIX}-meta-whatsapp-token" META_WHATSAPP_TOKEN
add_optional "${SECRET_PREFIX}-meta-phone-number-id" META_PHONE_NUMBER_ID

WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --region="$REGION" --format='value(status.url)' 2>/dev/null || true)"
WEB_URL="${WEB_URL:-http://localhost:5173}"

log "2/5 Deploying ${API_SERVICE} (API + PostgREST sidecar → AlloyDB)"
export API_SERVICE SECRET_PREFIX API_IMAGE POSTGREST_IMAGE API_SA GCS_BUCKET PROJECT_ID VERTEX_LOCATION GEMINI_MODEL \
       GEMINI_IMAGE_MODEL BQ_DATASET REGION WEB_URL VPC_NETWORK VPC_SUBNET OPTIONAL_SECRET_ENV
# DATA_BACKEND=alloydb (default): PostgREST sidecar → AlloyDB. DATA_BACKEND=supabase: existing Supabase.
TEMPLATE=infra/cloudrun/api-service.yaml
[ "${DATA_BACKEND:-alloydb}" = "supabase" ] && TEMPLATE=infra/cloudrun/api-service-supabase.yaml
log "   data backend: ${DATA_BACKEND:-alloydb} (${TEMPLATE})"
if command -v envsubst >/dev/null; then
  envsubst < "$TEMPLATE" > /tmp/${API_SERVICE}.yaml
else
  python3 -c 'import os,sys; sys.stdout.write(os.path.expandvars(sys.stdin.read()))' \
    < "$TEMPLATE" > /tmp/${API_SERVICE}.yaml
fi
gcloud run services replace /tmp/${API_SERVICE}.yaml --region="$REGION" --quiet
API_URL="$(gcloud run services describe "$API_SERVICE" --region="$REGION" --format='value(status.url)')"

make_public() { # allow browser access; falls back when an org policy blocks allUsers
  gcloud run services add-iam-policy-binding "$1" --region="$REGION" \
    --member=allUsers --role=roles/run.invoker >/dev/null 2>&1 || \
  gcloud run services update "$1" --region="$REGION" --no-invoker-iam-check --quiet >/dev/null
}
make_public "$API_SERVICE"
ok "API ${API_URL}"

log "3/5 Deploying ${WEB_SERVICE} (nginx; /api proxied to the API)"
gcloud run deploy "$WEB_SERVICE" --image "$WEB_IMAGE" --region="$REGION" --port=8080 \
  --set-env-vars "API_URL=${API_URL}" --cpu=1 --memory=512Mi --min-instances=0 --quiet
make_public "$WEB_SERVICE"
WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --region="$REGION" --format='value(status.url)')"
ok "Web ${WEB_URL}"

log "4/5 Hourly AlloyDB → BigQuery sync (Cloud Scheduler)"
SYNC_URI="${API_URL}/api/analytics/bigquery/sync"
if gcloud scheduler jobs describe "$SCHEDULER_JOB" --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$SCHEDULER_JOB" --location="$REGION" --schedule="17 * * * *" \
    --uri="$SYNC_URI" --http-method=POST --attempt-deadline=600s --quiet >/dev/null
else
  gcloud scheduler jobs create http "$SCHEDULER_JOB" --location="$REGION" --schedule="17 * * * *" \
    --uri="$SYNC_URI" --http-method=POST --attempt-deadline=600s --quiet >/dev/null
fi
ok "scheduler job ${SCHEDULER_JOB}"

log "5/5 Smoke tests"
check() { # name, curl args...
  local name="$1"; shift
  local code; code=$(curl -s -o /tmp/paatam-smoke.json -w '%{http_code}' --max-time 300 "$@" || true)
  if [[ "$code" =~ ^2 ]]; then ok "$name ($code)"; else warn "$name ($code): $(head -c 300 /tmp/paatam-smoke.json)"; fi
}
check "API health (AlloyDB + Vertex config)"  "${API_URL}/api/health"
check "Vertex AI Gemini call"                 "${API_URL}/api/test-models"
check "Web app"                               "${WEB_URL}/"
check "Web → API proxy"                       "${WEB_URL}/api/health"
check "Data via PostgREST (branches)"         "${WEB_URL}/api/branches"
check "AlloyDB → BigQuery sync"               -X POST "${API_URL}/api/analytics/bigquery/sync"
check "BigQuery dashboard query"              "${API_URL}/api/analytics/bigquery"
head -c 600 /tmp/paatam-smoke.json; echo

cat <<EOF

Deployed.
  Web app : ${WEB_URL}
  API     : ${API_URL}
  Logs    : gcloud run services logs read ${API_SERVICE} --region=${REGION} --limit=100
EOF
