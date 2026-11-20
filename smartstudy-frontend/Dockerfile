# Paatam.ai web app for Cloud Run: Vite build served by nginx, /api proxied to the API service
ARG REGISTRY=docker.io
FROM ${REGISTRY}/library/node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Empty base URL = same origin; nginx forwards /api/* to the API service.
ENV VITE_API_BASE_URL=""
RUN npm run build

FROM ${REGISTRY}/library/nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Cloud Run sets PORT; API_URL is set at deploy time (https://paatam-api-....run.app)
ENV PORT=8080
EXPOSE 8080
