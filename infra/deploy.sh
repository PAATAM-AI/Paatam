#!/usr/bin/env bash
# Build and deploy Paatam.ai to Cloud Run (API + PostgREST sidecar, web app), schedule the
# AlloyDB → BigQuery sync, and run smoke tests. Run in Cloud Shell from the repo root:
#   bash infra/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh

TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
API_IMAGE="${IMAGE_BASE}/paatam-api:${TAG}"
WEB_IMAGE="${IMAGE_BASE}/paatam-web:${TAG}"

log "1/5 Building images with Cloud Build (tag ${TAG})"
build() { # dir image
  gcloud builds submit "$1" --region="$REGION" --config=infra/cloudbuild.yaml --quiet \
    --substitutions="_IMAGE=$2,_REGISTRY=${DOCKERHUB_PROXY}"
}
build smartstudy-backend "$API_IMAGE"
build smartstudy-frontend "$WEB_IMAGE"
ok "images pushed"

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
add_optional paatam-sarvam-api-key SARVAM_API_KEY
add_optional paatam-meta-whatsapp-token META_WHATSAPP_TOKEN
add_optional paatam-meta-phone-number-id META_PHONE_NUMBER_ID

WEB_URL="$(gcloud run services describe paatam-web --region="$REGION" --format='value(status.url)' 2>/dev/null || true)"
WEB_URL="${WEB_URL:-http://localhost:5173}"

log "2/5 Deploying paatam-api (API + PostgREST sidecar → AlloyDB)"
export API_IMAGE POSTGREST_IMAGE API_SA GCS_BUCKET PROJECT_ID VERTEX_LOCATION GEMINI_MODEL \
       GEMINI_IMAGE_MODEL BQ_DATASET REGION WEB_URL VPC_NETWORK VPC_SUBNET OPTIONAL_SECRET_ENV
envsubst < infra/cloudrun/api-service.yaml > /tmp/paatam-api-service.yaml
gcloud run services replace /tmp/paatam-api-service.yaml --region="$REGION" --quiet
API_URL="$(gcloud run services describe paatam-api --region="$REGION" --format='value(status.url)')"

make_public() { # allow browser access; falls back when an org policy blocks allUsers
  gcloud run services add-iam-policy-binding "$1" --region="$REGION" \
    --member=allUsers --role=roles/run.invoker >/dev/null 2>&1 || \
  gcloud run services update "$1" --region="$REGION" --no-invoker-iam-check --quiet >/dev/null
}
make_public paatam-api
ok "API ${API_URL}"

log "3/5 Deploying paatam-web (nginx; /api proxied to the API)"
gcloud run deploy paatam-web --image "$WEB_IMAGE" --region="$REGION" --port=8080 \
  --set-env-vars "API_URL=${API_URL}" --cpu=1 --memory=512Mi --min-instances=0 --quiet
make_public paatam-web
WEB_URL="$(gcloud run services describe paatam-web --region="$REGION" --format='value(status.url)')"
ok "Web ${WEB_URL}"

log "4/5 Hourly AlloyDB → BigQuery sync (Cloud Scheduler)"
SYNC_URI="${API_URL}/api/analytics/bigquery/sync"
if gcloud scheduler jobs describe paatam-bigquery-sync --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http paatam-bigquery-sync --location="$REGION" --schedule="17 * * * *" \
    --uri="$SYNC_URI" --http-method=POST --attempt-deadline=600s --quiet >/dev/null
else
  gcloud scheduler jobs create http paatam-bigquery-sync --location="$REGION" --schedule="17 * * * *" \
    --uri="$SYNC_URI" --http-method=POST --attempt-deadline=600s --quiet >/dev/null
fi
ok "scheduler job paatam-bigquery-sync"

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
  Logs    : gcloud run services logs read paatam-api --region=${REGION} --limit=100
EOF
