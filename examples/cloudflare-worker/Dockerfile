# Build from repo root: docker build -f examples/cloudflare-worker/Dockerfile .
FROM node:20-slim

WORKDIR /app

# Copy Alfred source
COPY src ./src

# Copy worker example
COPY examples/cloudflare-worker/package.json ./
COPY examples/cloudflare-worker/worker.js ./
COPY examples/cloudflare-worker/test.js ./

# Install deps (esbuild + miniflare)
RUN npm install

# Bundle worker with Alfred inlined
RUN npx esbuild worker.js --bundle --outfile=dist/worker.js --format=esm --target=es2022

# Run tests against bundled worker
CMD ["node", "test.js"]
