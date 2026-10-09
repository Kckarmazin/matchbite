# =========================================================================
# MatchBite Multi-Stage Production Dockerfile
# Optimized for Google Cloud Run, Render, AWS App Runner, Fly.io, Railway
# =========================================================================

# Stage 1: Client Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production Server Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY package*.json ./
# Install only production dependencies
RUN npm ci --omit=dev

# Copy server code and pre-compiled client bundle
COPY server/ ./server/
COPY --from=builder /app/dist ./dist

# Non-root user for cloud security
USER node

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "server/index.js"]
