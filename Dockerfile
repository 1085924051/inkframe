# ---- 构建阶段 ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

ENV DATABASE_URL=file:./dev.db

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.mjs ./

EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --schema prisma/schema.prisma && npm run start"]