FROM node:24-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3000
# Better Auth tables live outside the TypeORM migrations (those run on boot), so migrate them first.
CMD ["sh", "-c", "pnpm auth:migrate && { [ -z \"$ADMIN_EMAIL\" ] || node dist/modules/auth/infrastructure/seed-admin.js; } && { [ \"$DEMO_IDENTITY\" != true ] || node dist/modules/auth/infrastructure/seed-demo.js; } && node dist/main.js"]
