FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Vite inlines these at build time: changing them needs a rebuild.
ARG VITE_MILESTONES_SOURCE=http
ARG VITE_MILESTONES_BASE_URL=/api
ARG VITE_API_URL=http://localhost:5180
ENV VITE_MILESTONES_SOURCE=$VITE_MILESTONES_SOURCE VITE_MILESTONES_BASE_URL=$VITE_MILESTONES_BASE_URL VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @agro/web build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/build/client /usr/share/nginx/html
