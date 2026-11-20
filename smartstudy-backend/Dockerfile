# ==============================================================================
# PAATAM.AI Backend Dockerfile (Google Cloud Run Ready)
# Node.js 22 Slim with native dependencies for Canvas / PDF rasterization
# ==============================================================================

FROM node:22-slim

# Install native system dependencies required by @napi-rs/canvas and PDF processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    fonts-dejavu-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies required for compilation)
RUN npm ci

# Copy source code and config
COPY . .

# Build TypeScript to dist/
RUN npm run build

# Cloud Run injects PORT at runtime (defaulting to 3001 if run locally)
ENV PORT=3001
EXPOSE 3001

# Start the compiled Express server
CMD ["node", "dist/index.js"]
