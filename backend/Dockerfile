# ----------- Dependencies -----------
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

# ----------- Build -----------
FROM node:20-alpine AS build
WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 🔥 IMPORTANT: generate prisma client
RUN npx prisma generate

# build typescript
RUN pnpm run build

# ----------- Runtime -----------
FROM node:20-alpine AS runtime
WORKDIR /app

RUN corepack enable

# only production deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod

# copy built app + prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/prisma ./prisma

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]