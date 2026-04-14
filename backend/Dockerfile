FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable

COPY package.json ./
# Use single pnpm install without workspace
RUN pnpm install

FROM deps AS build
WORKDIR /app

COPY . .

RUN pnpm run build:prod

FROM deps AS runtime
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
