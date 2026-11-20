#!/usr/bin/env bash
# Shared settings for setup.sh, migrate-db.sh and deploy.sh. Override any of them in the environment.
# Sourced, not executed.

PROJECT="${PROJECT:-267947667128}"              # project number or id
REGION="${REGION:-asia-south1}"
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"   # any Gemini model your project can call on Vertex AI
GEMINI_IMAGE_MODEL="${GEMINI_IMAGE_MODEL:-gemini-2.5-flash-image}"

ALLOYDB_CLUSTER="${ALLOYDB_CLUSTER:-paatam-cluster}"
ALLOYDB_INSTANCE="${ALLOYDB_INSTANCE:-paatam-primary}"
ALLOYDB_CPUS="${ALLOYDB_CPUS:-2}"
DB_NAME="${DB_NAME:-paatam}"
VPC_NETWORK="${VPC_NETWORK:-default}"
VPC_SUBNET="${VPC_SUBNET:-default}"

BQ_DATASET="${BQ_DATASET:-paatam_analytics}"
AR_REPO="${AR_REPO:-paatam}"
API_SA_NAME="${API_SA_NAME:-paatam-api-sa}"

# Resolve the project id and number once (accepts either form in PROJECT)
PROJECT_ID="$(gcloud projects describe "$PROJECT" --format='value(projectId)')"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
GCS_BUCKET="${GCS_BUCKET:-${PROJECT_ID}-paatam-uploads}"
API_SA="${API_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER_SA="paatam-deployer@${PROJECT_ID}.iam.gserviceaccount.com"   # used by the Cloud Build trigger
AR_HOST="${REGION}-docker.pkg.dev"
IMAGE_BASE="${AR_HOST}/${PROJECT_ID}/${AR_REPO}"
# Docker Hub images are pulled through an Artifact Registry remote repository (avoids Docker Hub rate limits)
DOCKERHUB_PROXY="${AR_HOST}/${PROJECT_ID}/dockerhub"
POSTGREST_IMAGE="${POSTGREST_IMAGE:-${DOCKERHUB_PROXY}/postgrest/postgrest:v12.2.12}"
INSTANCE_URI="projects/${PROJECT_ID}/locations/${REGION}/clusters/${ALLOYDB_CLUSTER}/instances/${ALLOYDB_INSTANCE}"

gcloud config set project "$PROJECT_ID" >/dev/null 2>&1

log()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

# Create a secret if it does not exist yet, with the value from stdin.
ensure_secret() {
  local name="$1"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    return 0
  fi
  gcloud secrets create "$name" --replication-policy=automatic --data-file=- >/dev/null
  ok "secret $name created"
}

secret_value() { gcloud secrets versions access latest --secret="$1"; }
