FROM node:22-slim

WORKDIR /app

# Copy server package files and install deps at /app level
# so shared/ code can resolve modules from here
COPY server/package.json server/package-lock.json* ./
RUN npm ci

# Copy shared code
COPY shared/ ./shared/

# Copy server source
COPY server/index.ts ./server/
COPY server/routes/ ./server/routes/
COPY server/middleware/ ./server/middleware/
COPY server/tsconfig.json ./server/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server
CMD ["node", "../node_modules/.bin/tsx", "index.ts"]
