FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

# Install xvfb for headed Chrome in headless environments (WAF bypass — Imperva
# blocks headless Chrome at TLS level, headed Chrome through xvfb passes fine)
# Install system Chrome on x86 for better WAF compatibility (skipped on ARM64)
RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && (npx playwright install chrome 2>/dev/null || echo "Chrome install skipped (ARM64)")

# Copy package files and install deps
COPY server/package.json server/package-lock.json ./
RUN npm ci

# Ensure Playwright browsers are registered for playwright-extra
RUN npx playwright install chromium 2>/dev/null || true

# Copy server source + configs
COPY server/index.ts ./
COPY server/db/ ./db/
COPY server/routes/ ./routes/
COPY server/middleware/ ./middleware/
COPY server/processor/ ./processor/
COPY server/automation/ ./automation/
COPY server/utils/ ./utils/
COPY server/drizzle.config.ts server/tsconfig.json ./

# Create traces directory
RUN mkdir -p /data/traces

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start Xvfb, wait for it to be ready, then start the server
CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp & sleep 2 && export DISPLAY=:99 && node node_modules/.bin/tsx index.ts"]
