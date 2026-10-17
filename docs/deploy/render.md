# Render deployment checklist (Surco)

This change is intentionally **not** deployed until its pull request is reviewed and merged.

## Services

- Static site: `surco-caribe-first-web` (frontend)
- Web service: `surco-caribe-first-api` (backend)
- PostgreSQL 17: `surco-caribe-first-db`

## Backend settings

The API must have `DATABASE_URL` (the internal Render Postgres URL), `BETTER_AUTH_SECRET` (a long random secret), `API_URL` (the public API URL), `WEB_ORIGIN` (the public frontend origin), `PAYMENT_GATEWAY=simulated`, and `DEMO_IDENTITY=false`. These must be stored in Render Environment, **not in Git**.

Set `AUTH_MIGRATE_ON_START=true` **only** for controlled bootstrap of Better Auth tables (`user`, `session`, `account`, `verification`). The provider fails startup if migration fails. After the first successful rollout, return it to `false`. Domain TypeORM migrations run on startup independently.

## Frontend integration is NOT yet activated

The deployed static site remains in mock mode while authentication is integrated. The frontend reads `VITE_MILESTONES_SOURCE=http` and `VITE_MILESTONES_BASE_URL=/api` at **build time**. The latter only works if the frontend origin proxies `/api` to the NestJS server. The Vite proxy in `vite.config.ts` works **only during local development**, not on Render static hosting.

Do not set HTTP mode in Render yet: separate `*.onrender.com` sites have cross-site cookie restrictions and the existing backend Better Auth cookie defaults are not enough to guarantee browser authentication. A same-origin reverse proxy or validated cross-site cookie configuration is needed first. Never use `DEMO_IDENTITY=true` as a substitute for actual production auth.

## Validation

1. Check backend deploy is live and `/docs` responds.
2. Check the Better Auth migration reports success in logs, then disable `AUTH_MIGRATE_ON_START`.
3. Verify that the browser can sign in, read `/api/users/me` and sign out **before** setting frontend to HTTP mode.
4. Test role guards and ensure unauthorized API calls receive 401 or 403.
5. Only configure real Interledger testnet wallets after safely storing private keys and testing callbacks; `simulated` never sends real payments.

This checklist is for a hackathon/demo environment, not a production financial system.
