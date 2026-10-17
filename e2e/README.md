# SURCO — Demo orquestada con Playwright

Pruebas **UI** independientes, secuenciables y grabadas en video. Código aislado en `e2e/`, sin modificar producción ni `main`.

## Importante: dos entornos diferentes

- **Render (smoke, solo lectura)**: `https://surco-caribe-first-web.onrender.com`. Comprueba el login desplegado; no crea registros ni ejecuta pagos.
- **Mock local (demo completa)**: `http://127.0.0.1:5175`. El proyecto inicia por defecto con `VITE_MILESTONES_SOURCE=mock`; sus grants, revisiones y comprobantes son simulaciones y se reinician al recargar el navegador. No requieren billeteras ni transferencia de fondos.
- **Backend real / Interledger testnet**: NO está automatizado por esta suite; antes se requiere un ambiente E2E exclusivo, seeding reproducible, perfiles y controles contra pagos reales. Varias pantallas siguen con `prototypeTransport` en modo HTTP.

## Preparación

En la raíz del repositorio:

```bash
cd frontend
npx --yes pnpm@10.34.7 install --frozen-lockfile
VITE_MILESTONES_SOURCE=mock npx --yes pnpm@10.34.7 --filter @agro/web dev --strictPort
```

En otra terminal:

```bash
cd e2e
npm install
npx playwright install chromium
npm run demo:smoke
npm run demo:full
```

### Presentación en pantalla, con pausas

En Linux/macOS:

```bash
cd e2e
DEMO_MODE=1 DEMO_SLOWMO=700 DEMO_PAUSE_MS=1800 npm run demo:full
```

En PowerShell:

```powershell
$env:DEMO_MODE="1"; $env:DEMO_SLOWMO="700"; $env:DEMO_PAUSE_MS="1800"
npm run demo:full
```

`DEMO_MODE=1` muestra Chromium, ralentiza interacciones, enseña títulos de escenas y produce grabaciones. Sin esta variable corre headless. El reporte HTML se abre con `npm run report`.

### Escenarios

| Script | Qué demuestra | Entorno |
|---|---|---|
| `demo:smoke` | Login servido por Render | Render, no destructivo |
| `demo:approve` | Evaluación favorable, firma, pago, comprobante | Mock |
| `demo:observe` | Dictamen observado, correcciones y bloqueo de pago | Mock |
| `demo:grants` | Consentimiento aprobado, denegado y revocación (3 tests) | Mock |
| `demo:payments` | Guardar evidencia y reenvío, panel de custodia | Mock |
| `demo:full` | Productor → verificador → pago → operador | Mock |

Ejecutar todo el catálogo: `npm run demo`. Tests aislados por contexto de Playwright, trabajadores = 1. Cada test parte de fixtures nuevos. El recorrido completo mantiene una sola página/contexto durante el cambio de perfiles.

Archivos: `artifacts/results` (videos, trazas de fallos) y `artifacts/report`. No se suben a GitHub.

## Limitaciones y siguientes pasos

1. En el frontend algunos flujos de grant y conciliación son prototipos locales, aun con `VITE_MILESTONES_SOURCE=http`.
2. El servidor desplegado en Render usa la rama `main`, pero este PR **no la toca** y no dispara un despliegue.
3. Los smoke tests no sustituyen la verificación visual sobre el despliegue: comprueba que la web apunte a la API correcta y no al mock antes de afirmar integración end-to-end.
4. Para E2E real crear fixtures con ids únicos, DB separada, simulador de wallet y límites de gasto, un endpoint de reset habilitado SOLO en E2E y pruebas API de estados. No reutilizar datos reales ni claves productivas.
5. Añadir smoke checks de backend/CORS tras disponer de credenciales y conocer el contrato de salud del servicio.

Nota: no se ejecutaron estas pruebas contra Render desde este entorno; los servicios figuran `live` en Render, pero la red de ejecución no alcanzó el dominio.
