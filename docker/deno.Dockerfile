FROM denoland/deno:alpine
WORKDIR /app
COPY . .
# Deno doesn't use package.json/npm install by default, but can import from it or run scripts.
# For the smoke test, we can run it directly.
CMD ["deno", "run", "--allow-read", "--allow-env", "--allow-hrtime", "test/smoke.js"]
