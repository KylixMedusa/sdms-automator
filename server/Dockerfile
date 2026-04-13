FROM node:22-slim

WORKDIR /app

# Copy shared code (DB, utils)
COPY shared/ ./shared/

# Copy server package files and install deps
COPY server/package.json server/package-lock.json* ./server/
WORKDIR /app/server
RUN npm ci

# Copy server source
COPY server/index.ts ./
COPY server/routes/ ./routes/
COPY server/middleware/ ./middleware/
COPY server/tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "node_modules/.bin/tsx", "index.ts"]
