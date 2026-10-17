# Surco

Financiamiento agrícola por hitos con custodia, captación multimoneda y asistente conversacional, sobre [Open Payments](https://openpayments.dev) (Interledger testnet).

Un productor publica un proyecto de siembra dividido en hitos. Inversionistas aportan capital en su propia moneda y el comprador deposita su anticipo; todo llega a una wallet de custodia. Cada hito se paga con un permiso (grant) de Open Payments con tope, que aprueba la fiduciaria después de que el verificador confirma el avance. Al cosechar, el pago del comprador se reparte en cascada: comisión, capital, rendimiento y utilidad del productor.

Proyecto del equipo **Caribe First** para el Interledger Hackathon Medellín 2026.

- Presentación: [`docs/presentacion/`](docs/presentacion/)
- Video de la demo: [enlace pendiente]
- Uso de IA: [`AI_USAGE.md`](AI_USAGE.md) y [`/prompts`](prompts/)

## Arquitectura

Monorepo con dos partes independientes:

| Ruta | Qué es |
|---|---|
| `backend/` | API NestJS con arquitectura hexagonal (`src/modules/<módulo>/{domain,application,infrastructure}`), Postgres con TypeORM y Better Auth. El adaptador de pagos usa `@interledger/open-payments`. |
| `frontend/` | Turborepo con pnpm. `apps/web` es la app (React Router 7 + Tailwind 4, sistema de diseño Surco); `apps/landing` es la landing; `packages/shared` tiene dominio, cliente de API generado desde OpenAPI y UI. |

Flujo de Open Payments que usa la app: grant interactivo GNAP (el usuario aprueba en su wallet y vuelve con `interact_ref`, verificado por hash) → incoming payment en la wallet destino → quote → outgoing payment. Los tokens de los grants se guardan cifrados con AES-256-GCM.

Módulos principales del backend: `projects`, `milestones`, `negotiations`, `investments`, `payouts`, `settlement`, `harvest`, `contracts`, `simulation`, `assistant`, `support`, `notifications`, `auth`.

## Cómo correrlo en local

Requisitos: Node 22.12+, pnpm 10 (`npx -y pnpm@10.34.7`) y Postgres 17.

### 1. Base de datos

Un Postgres local con usuario, clave y base `agro`. Con Docker:

```bash
docker run -d --name agro-pg -p 5432:5432 -e POSTGRES_USER=agro -e POSTGRES_PASSWORD=agro -e POSTGRES_DB=agro postgres:17-alpine
```

### 2. Backend (puerto 3010)

```bash
cd backend
cp .env.example .env            # completar valores, ver abajo
pnpm install
pnpm auth:migrate               # tablas de Better Auth
pnpm auth:seed-demo             # usuarios demo
pnpm start:dev                  # las migraciones de dominio corren al arrancar
```

Variables clave de `.env` (la lista completa y comentada está en `.env.example`):

| Variable | Valor para la demo |
|---|---|
| `PORT` / `DATABASE_URL` | `3010` / `postgres://agro:agro@localhost:5432/agro` |
| `WEB_ORIGIN` | `http://localhost:5175` |
| `PAYMENT_GATEWAY` | `simulated` (sin red) u `open-payments` (testnet) |
| `OP_CLIENT_WALLET_ADDRESS`, `OP_KEY_ID`, `OP_PRIVATE_KEY_PATH` | Wallet cliente y llave Ed25519 de la testnet. La llave va en `backend/keys/`, que no se versiona. |
| `OP_CUSTODY_WALLET_ADDRESS`, `OP_INVESTOR_WALLET_ADDRESS`, `OP_RECEIVER_WALLET_ADDRESS`, `OP_BUYER_WALLET_ADDRESS` | Wallets de custodia, inversionista, proveedor y comprador |
| `GRANT_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `DEMO_IDENTITY` | `true` solo para la demo |
| `ANTHROPIC_API_KEY` | Opcional: activa el asistente del productor |

Swagger queda en http://localhost:3010/docs.

### 3. Frontend (puerto 5175)

```bash
cd frontend
pnpm install
cd apps/web
VITE_API_URL=http://localhost:3010 VITE_MILESTONES_SOURCE=http VITE_MILESTONES_BASE_URL=/api pnpm dev --strictPort
```

Vite reenvía `/api` al backend en :3010. Sin `VITE_MILESTONES_SOURCE=http` la web corre con datos de prueba en memoria.

### Usuarios demo

Todos con la clave `Agro-demo-2026`:

| Rol | Correo |
|---|---|
| Productor | `productor@agro.dev` |
| Comprador | `comprador@agro.dev` |
| Inversionista | `inversionista@agro.dev` |
| Verificador | `verificador@agro.dev` |
| Fiduciaria | `fiduciaria@agro.dev` |

### Todo con Docker

```bash
docker compose up --build       # web http://localhost:5180, API http://localhost:3080
```

## Pruebas

```bash
cd backend && pnpm test         # requiere una base de pruebas cuyo nombre termine en _test
cd frontend && pnpm typecheck && pnpm test
```

## Licencia

[pendiente]
