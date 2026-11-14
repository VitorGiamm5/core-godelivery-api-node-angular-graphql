FROM node:26.13.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts tsconfig*.json nest-cli.json ./
COPY src ./src
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate && npm run build
ENV NODE_ENV=production PORT=9105 OIDC_JWKS_PATH=/data/oidc-jwks.json
EXPOSE 9105
CMD ["node", "--import", "./dist/telemetry.js", "./dist/main.js"]
