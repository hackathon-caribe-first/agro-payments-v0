# backend

NestJS con arquitectura hexagonal por módulo (`src/modules/<modulo>/{application,ports,controllers,infrastructure}`) y lo transversal en `src/shared`.

```bash
pnpm install
pnpm start:dev   # API en :3000, Swagger UI en /docs
pnpm test        # Vitest
pnpm openapi     # regenera openapi.yaml desde controllers y DTOs (como `swag init` en Go)
```
