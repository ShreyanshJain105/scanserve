FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable

COPY package.json ./
RUN pnpm install

FROM deps AS build
WORKDIR /app

COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm run build

FROM deps AS runtime
WORKDIR /app

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.* ./
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json

ENV NODE_ENV=production
EXPOSE 3000

CMD ["pnpm", "start"]
