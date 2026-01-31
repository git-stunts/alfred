FROM oven/bun:1.0
WORKDIR /app
COPY . .
# Install dependencies using bun (maps to package-lock.json usually)
RUN bun install
# Run the smoke test directly
CMD ["bun", "test/smoke.js"]
