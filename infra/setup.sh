#!/usr/bin/env bash
# One-time Google Cloud setup for Paatam.ai. Idempotent: safe to re-run.
# Run in Cloud Shell from the repo root:   bash infra/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.sh

log "Project ${PROJECT_ID} (#${PROJECT_NUMBER}), region ${REGION}"

log "1/8 Enabling APIs (takes a minute the first time)"
gcloud services enable \
  alloydb.googleapis.com compute.googleapis.com servicenetworking.googleapis.com \
  run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com aiplatform.googleapis.com bigquery.googleapis.com \
  storage.googleapis.com cloudscheduler.googleapis.com iam.googleapis.com \
  cloudresourcemanager.googleapis.com
ok "APIs enabled"

log "2/8 Service account for the API"
gcloud iam service-accounts describe "$API_SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$API_SA_NAME" --display-name="${APP} API (Cloud Run)"
for role in roles/alloydb.client roles/serviceusage.serviceUsageConsumer roles/aiplatform.user roles/bigquery.dataEditor roles/bigquery.jobUser \
            roles/secretmanager.secretAccessor roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${API_SA}" \
    --role="$role" --condition=None >/dev/null
done
# Deployer account for the Cloud Build trigger on branch "gcp": deploy rights only, no data access
gcloud iam service-accounts describe "$DEPLOYER_SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$DEPLOYER_SA_NAME" --display-name="${APP} deployer (Cloud Build trigger)"
for role in roles/run.admin roles/artifactregistry.writer roles/cloudscheduler.admin \
            roles/secretmanager.viewer roles/logging.logWriter roles/browser roles/compute.networkUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${DEPLOYER_SA}" \
    --role="$role" --condition=None >/dev/null
done
# lets the deployer run the API as ${API_SA}
gcloud iam service-accounts add-iam-policy-binding "$API_SA" \
  --member="serviceAccount:${DEPLOYER_SA}" --role=roles/iam.serviceAccountUser >/dev/null
# Cloud Build (runs as the Compute default service account in new projects) pushes images
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/cloudbuild.builds.builder --condition=None >/dev/null
ok "IAM roles granted"

log "3/8 Network: default VPC + private services access for AlloyDB"
gcloud compute networks describe "$VPC_NETWORK" >/dev/null 2>&1 || \
  gcloud compute networks create "$VPC_NETWORK" --subnet-mode=auto
# Private services access: if the VPC already has a peering with servicenetworking (for example an
# existing AlloyDB cluster), it is left exactly as it is. Only a project without one gets a new range.
if gcloud services vpc-peerings list --network="$VPC_NETWORK" \
     --format='value(peering)' 2>/dev/null | grep -q servicenetworking; then
  ok "existing private services access kept unchanged"
else
  gcloud compute addresses describe "${APP}-alloydb-range" --global >/dev/null 2>&1 || \
    gcloud compute addresses create "${APP}-alloydb-range" --global --purpose=VPC_PEERING \
      --prefix-length=16 --network="$VPC_NETWORK"
  gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com \
    --ranges="${APP}-alloydb-range" --network="$VPC_NETWORK"
fi
ok "private services access ready"

log "4/8 Secrets (generated, never printed)"
openssl rand -hex 24 | tr -d '\n' | ensure_secret ${SECRET_PREFIX}-db-postgres-password
openssl rand -hex 24 | tr -d '\n' | ensure_secret ${SECRET_PREFIX}-pgrst-authenticator-password
openssl rand -hex 32 | tr -d '\n' | ensure_secret ${SECRET_PREFIX}-pgrst-jwt-secret
openssl rand -hex 32 | tr -d '\n' | ensure_secret ${SECRET_PREFIX}-app-jwt-secret
ok "secrets ready"

log "5/8 AlloyDB cluster + primary instance (10–20 minutes on first run)"
if ! gcloud alloydb clusters describe "$ALLOYDB_CLUSTER" --region="$REGION" >/dev/null 2>&1; then
  gcloud alloydb clusters create "$ALLOYDB_CLUSTER" --region="$REGION" --network="$VPC_NETWORK" \
    --password="$(secret_value ${SECRET_PREFIX}-db-postgres-password)"
fi
if ! gcloud alloydb instances describe "$ALLOYDB_INSTANCE" --cluster="$ALLOYDB_CLUSTER" --region="$REGION" >/dev/null 2>&1; then
  # Public IP is only reachable through the AlloyDB Auth Proxy (used by migrate-db.sh); Cloud Run uses the private IP.
  gcloud alloydb instances create "$ALLOYDB_INSTANCE" --cluster="$ALLOYDB_CLUSTER" --region="$REGION" \
    --instance-type=PRIMARY --cpu-count="$ALLOYDB_CPUS" --availability-type=ZONAL \
    --assign-inbound-public-ip=ASSIGN_IPV4
fi
PRIVATE_IP="$(gcloud alloydb instances describe "$ALLOYDB_INSTANCE" --cluster="$ALLOYDB_CLUSTER" \
  --region="$REGION" --format='value(ipAddress)')"
ok "AlloyDB ready (private IP ${PRIVATE_IP})"

# A superuser for this replica only; existing users (and their passwords) are not changed.
openssl rand -hex 24 | tr -d '\n' | ensure_secret "${SECRET_PREFIX}-db-admin-password"
if gcloud alloydb users list --cluster="$ALLOYDB_CLUSTER" --region="$REGION" --format='value(name)' \
     | grep -q "/users/${DB_ADMIN_USER}$"; then
  ok "database user ${DB_ADMIN_USER} exists"
else
  gcloud alloydb users create "$DB_ADMIN_USER" --cluster="$ALLOYDB_CLUSTER" --region="$REGION" \
    --password="$(secret_value "${SECRET_PREFIX}-db-admin-password")" --superuser=true >/dev/null
  ok "database user ${DB_ADMIN_USER} created"
fi

# PostgREST connection string (authenticator role is created by migrate-db.sh)
printf 'postgres://postgrest_authenticator:%s@%s:5432/%s?sslmode=require' \
  "$(secret_value ${SECRET_PREFIX}-pgrst-authenticator-password)" "$PRIVATE_IP" "$DB_NAME" | ensure_secret ${SECRET_PREFIX}-pgrst-db-uri

log "6/8 Cloud Storage bucket for uploads (private)"
gcloud storage buckets describe "gs://${GCS_BUCKET}" >/dev/null 2>&1 || \
  gcloud storage buckets create "gs://${GCS_BUCKET}" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --member="serviceAccount:${API_SA}" --role=roles/storage.objectAdmin >/dev/null
ok "bucket gs://${GCS_BUCKET}"

log "7/8 BigQuery dataset"
bq --location="$REGION" show "${PROJECT_ID}:${BQ_DATASET}" >/dev/null 2>&1 || \
  bq --location="$REGION" mk --dataset --description "Paatam.ai analytics (synced from AlloyDB)" "${PROJECT_ID}:${BQ_DATASET}"
ok "dataset ${BQ_DATASET}"

log "8/8 Artifact Registry"
gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$AR_REPO" --location="$REGION" --repository-format=docker
# Pull-through cache for Docker Hub (node, nginx, postgrest) so builds and deploys don't hit Docker Hub limits
gcloud artifacts repositories describe dockerhub --location="$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create dockerhub --location="$REGION" --repository-format=docker \
    --mode=remote-repository --remote-docker-repo=DOCKER-HUB --description="Docker Hub cache"
ok "repositories ${IMAGE_BASE} and ${DOCKERHUB_PROXY}"

cat <<EOF

Setup complete. Next:
  bash infra/migrate-db.sh            # copy schema + data from Supabase into AlloyDB
  (or: bash infra/migrate-db.sh --from-code   # empty schema, if Supabase is unavailable)
  bash infra/deploy.sh
Optional secrets (add before deploy if you use them; the value is typed hidden, not echoed):
  read -rsp 'Sarvam API key: ' V && printf '%s' "\$V" | gcloud secrets create ${SECRET_PREFIX}-sarvam-api-key --data-file=-; unset V
  read -rsp 'Meta WhatsApp token: ' V && printf '%s' "\$V" | gcloud secrets create ${SECRET_PREFIX}-meta-whatsapp-token --data-file=-; unset V
EOF
