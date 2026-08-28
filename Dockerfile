# ---- Build stage ----
# node:22-bookworm (full) có sẵn build tools cho better-sqlite3 nếu prebuilt không khớp
FROM node:22-bookworm AS build
WORKDIR /app

# Dùng npm mirror để tải nhanh trên mạng VNPT (đường tới registry.npmjs.org bị nghẽn quốc tế)
ARG NPM_REGISTRY=https://registry.npmmirror.com

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY packages packages/
RUN npm ci --registry=$NPM_REGISTRY --ignore-scripts
# Build native module tu source (tranh tai prebuild tu github.com - duong VNPT cham)
RUN npm rebuild better-sqlite3 --build-from-source --registry=$NPM_REGISTRY

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/packages ./packages
COPY --from=build /app/client/dist ./client/dist
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server/dist/index.js"]
