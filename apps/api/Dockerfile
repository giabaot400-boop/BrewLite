FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm ci

COPY apps/api ./apps/api

RUN npm run build --workspace apps/api

ENV NODE_ENV=production
ENV TZ=UTC
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace", "apps/api"]