# backend

NestJS con arquitectura hexagonal por módulo (`src/modules/<modulo>/{application,ports,controllers,infrastructure}`) y lo transversal en `src/shared`.

```bash
docker compose -f ../compose.yaml up -d   # Postgres 17 en :5432
cp .env.example .env                      # ajustá BETTER_AUTH_SECRET
pnpm install
pnpm auth:migrate                         # crea user/session/account/verification (Better Auth)
pnpm start:dev   # API en :3000, Swagger UI en /docs
pnpm test        # Vitest
pnpm openapi     # regenera openapi.yaml desde controllers y DTOs (como `swag init` en Go)
```

## Auth

Better Auth (email + password, sesión por cookie) montado en `/api/auth/*`, por ejemplo `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`, `GET /api/auth/get-session`. El front debe enviar `credentials: "include"` y su origen tiene que estar en `WEB_ORIGIN`.

Para proteger una ruta: `@UseGuards(AuthGuard)` y `@CurrentUser()` (exportados por `AuthModule`).

### Roles

Every user has exactly one `role`, stored in the `user` table (Better Auth `additionalFields`). It is required at sign-up, with no default.

| Role            | Self-selectable at sign-up | Assigned by |
| --------------- | -------------------------- | ----------- |
| `buyer`         | yes                        | user / admin |
| `seller`        | yes                        | user / admin |
| `investor`      | yes                        | user / admin |
| `intermediator` | yes                        | user / admin |
| `fidu`          | no                         | admin only  |
| `admin`         | no                         | seed script, then admin only |

```bash
curl -X POST localhost:3000/api/auth/sign-up/email -H "Content-Type: application/json" \
  -d '{"email":"ana@example.com","password":"change-me-123","name":"Ana","role":"buyer"}'
```

Sign-up with a missing or non-selectable role (`admin`, `fidu`, anything unknown) is rejected, and `update-user` cannot change the role: both are enforced by `databaseHooks` in `better-auth.factory.ts`. Only `PATCH /users/:id/role` (admin only) changes a role; admins cannot change their own.

Protect a route by role with `@UseGuards(AuthGuard, RolesGuard)` and `@Roles("admin", "fidu")` (all exported by `AuthModule`): 401 without session, 403 with the wrong role.

The role column was added after the first schema: re-run `pnpm auth:migrate` on existing databases.

First admin: set `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME` in `.env` (see `.env.example`) and run `pnpm auth:seed-admin`. It is idempotent: if the user already exists it only ensures `role=admin`.

Tablas: Better Auth es dueño de `user`, `session`, `account` y `verification` (`pnpm auth:migrate`; `pnpm auth:generate` para ver el SQL). TypeORM es dueño de las tablas de dominio, con `synchronize` apagado: usá migraciones.
