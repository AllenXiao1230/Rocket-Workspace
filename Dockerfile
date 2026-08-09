FROM node:22-alpine
WORKDIR /app
ARG APP_VERSION=0.1.0
ARG APP_COMMIT=unknown
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV DATABASE_URL=postgresql://rocket:rocket@postgres:5432/rocket_workspace?schema=public \
    AUTH_SECRET=build-only-placeholder \
    NEXTAUTH_URL=http://localhost:3000 \
    APP_VERSION=${APP_VERSION} \
    APP_COMMIT=${APP_COMMIT}
RUN pnpm db:generate && pnpm build
EXPOSE 3000 1234
CMD ["pnpm", "start"]
