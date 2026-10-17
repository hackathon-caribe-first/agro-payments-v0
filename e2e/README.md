# Surco — Suite Playwright para demostraciones

La suite corre escenarios **simulados** (sin transferir dinero ni modificar la base de Render) y un smoke **solo lectura** de Render. `npm run demo` inicia automáticamente la web local en `http://127.0.0.1:5175` a través de Playwright `webServer`.

## Comandos

```bash
# Ejecuta una sola vez:
cd frontend && npx --yes pnpm@10.34.7 install --frozen-lockfile
cd ../e2e && npm install && npx playwright install chromium

# Ejecutar todas las pruebas simuladas
npm run demo

# Demostración narrativa con vídeo y navegador visible
DEMO_MODE=1 DEMO_SLOWMO=700 DEMO_PAUSE_MS=1500 npm run demo:full

# Pruebas separadas
npm run demo:approve
npm run demo:observe
npm run demo:grants
npm run demo:payments

# El único test que apunta a la web de Render (sin mutaciones)
npm run demo:smoke
npm run report
```

Para PowerShell, antes del comando usa `$env:DEMO_MODE="1"; $env:DEMO_SLOWMO="700"; $env:DEMO_PAUSE_MS="1500"`.

## Automatización de GitHub

`.github/workflows/playwright-demo.yml` se ejecuta en pushes a la rama de la demo y en cambios al PR. Instala Node, pnpm, Chromium; realiza los tests del modo mock, ejecuta el smoke sobre Render y adjunta reportes, capturas en fallo, trazas y videos como artefactos.

## Alcance y restricciones

- El **backend REST** en Render puede servir datos persistentes, pero la implementación actual del frontend usa `prototypeTransport` para ciertos módulos incluso en HTTP: no se debe afirmar que los grants de la suite salen por Interledger real.
- El panel clásico de custodia `/custodian` depende de la API real `VITE_API_URL` y no está cubierto por el test de pagos simulados; el test de operador utiliza `/ops/reconciliation`.
- El mock en memoria se reinicia al recargar el navegador. En la demo de varios roles se navega dentro de la SPA; cada test independiente tiene un contexto limpio.
- No se automatizan pagos de testnet ni producción. Para ello hace falta backend sandbox, wallets de prueba, seeding, límites e idempotencia.
- La web remota por defecto es `https://surco-caribe-first-web.onrender.com` y puede modificarse con `DEMO_BASE_URL`.
- Reporte: `e2e/artifacts/report`; video/trazas: `e2e/artifacts/results`.
