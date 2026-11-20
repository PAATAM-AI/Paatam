# ==============================================================================
# PAATAM.AI Frontend Dockerfile (Google Cloud Run Ready)
# Multi-stage build: Node 22 (Vite Build) -> Nginx Alpine (Port 8080 SPA Server)
# ==============================================================================

# Stage 1: Build static assets
FROM node:22-alpine AS build

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Accept VITE_API_BASE_URL build argument for connecting to the Cloud Run backend
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Build production bundle to dist/
RUN npm run build

# Stage 2: Serve with Nginx on port 8080
FROM nginx:alpine

# Copy custom Nginx configuration with SPA fallback
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled frontend assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose Cloud Run default HTTP port
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
