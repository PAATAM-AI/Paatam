# Paatam.ai API for Cloud Run
# REGISTRY: Docker Hub by default; deploy.sh passes the Artifact Registry Docker Hub cache.
ARG REGISTRY=docker.io
FROM ${REGISTRY}/library/node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM ${REGISTRY}/library/node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# express, cors, @google/genai etc. are listed under devDependencies in this repo, so install all.
RUN npm ci --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
