FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm ci

COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_PRODUCTS_SOURCE=api
ENV NEXT_PUBLIC_AUTH_SOURCE=http
ENV TZ=UTC

RUN npm run build --workspace apps/web

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "apps/web"]