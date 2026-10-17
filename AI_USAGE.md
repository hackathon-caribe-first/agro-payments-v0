# Uso de IA en Surco

> **Borrador.** Revisar y completar antes de la entrega (sábado 17 de octubre, 11:00). Cada integrante debe agregar su propio uso de IA en la sección 4.

Este documento cumple la [política de IA del hackatón](https://interledger.org/es/hackathon/ai-policy/): herramientas usadas, en qué partes del proyecto y qué archivos tuvieron poca o ninguna IA. Los prompts reales están en [`/prompts`](prompts/).

## 1. Herramientas

| Herramienta | Modelo | Uso | Créditos |
|---|---|---|---|
| Claude Code (CLI) | Claude Opus 5.5 | Exploración del PRD, diseño, implementación, pruebas, integración de ramas, revisión visual, borrador de la presentación | [plan / créditos usados] |
| Subagentes de Claude Code | Claude Opus 5.5 / Sonnet | Trabajo en paralelo por módulo en worktrees de git aisladas; análisis de solo lectura de contratos del front y del PRD | Incluido en lo anterior |
| Claude API (dentro del producto) | `claude-opus-5-5` | Asistente conversacional del productor (`backend/src/modules/assistant`): responde estado y crea intenciones con herramientas acotadas | [créditos de API] |
| [Otra herramienta del equipo] | [modelo] | [uso] | [créditos] |

## 2. Cómo trabajamos con la IA

- **La persona dirige y decide; la IA ejecuta.** Las decisiones de producto, alcance, cuentas de git, wallets de testnet y qué se integra las tomó el equipo. La IA propuso opciones y avisó riesgos.
- **Pruebas como contrato.** Casi todo el backend se escribió con TDD: primero la prueba que falla, después el código. Cada bloque se verificó con la suite completa antes de integrarse.
- **Paralelismo controlado.** Varios agentes trabajaron a la vez, cada uno en su propia worktree, rama y base de datos de pruebas. Un integrador concilió los conflictos y se volvió a correr toda la suite antes de cada push.
- **Pagos reales verificados a mano.** El fondeo de un hito y el pago a un proveedor se hicieron en Interledger testnet con billeteras del equipo; la aprobación de cada permiso la hizo una persona en la billetera.

## 3. Partes del proyecto y nivel de IA

| Parte | Rutas | Nivel de IA |
|---|---|---|
| Backend: dominio, Open Payments, persistencia, módulos del PRD v3 | `backend/src/modules/**`, `backend/src/shared/**` | Alto: generado con IA bajo dirección y revisión del equipo |
| Migraciones de base de datos | `backend/src/shared/database/migrations/` | Alto, con revisión manual del orden y de las restricciones del ledger |
| Contrato de API generado | `backend/openapi.yaml`, `frontend/packages/shared/src/api/schema.d.ts` | Generado por herramienta (no por IA) |
| Pantallas de inversionista, operador, contratos, cosecha, asistente | `frontend/apps/web/src/routes/**` (parcial) | Alto |
| Front del productor, comprador, negociaciones y escrow (mock y diseño) | `frontend/packages/shared/src/modules/{projects,presales,escrow}`, rutas de productor y comprador | [Completar: Faber] |
| Landing 3D | `frontend/apps/landing/**` | [Completar] |
| Sistema de diseño Surco | `.claude/skills/surco-design/` | [Completar] |
| PRD v1 y v3 | Documentos externos al repositorio | [Completar: ¿con o sin IA?] |
| Presentación | Google Slides de la entrega | Borrador con IA, revisado por el equipo |

## 4. Uso de IA por integrante

- **Hans Peter Castellar:** Claude Code durante los dos días para backend, integración y presentación. Prompts en [`prompts/claude-code-hans.md`](prompts/claude-code-hans.md).
- **[Integrante]:** [herramientas, partes, enlace a sus prompts]
- **[Integrante]:** [herramientas, partes, enlace a sus prompts]
- **[Integrante]:** [herramientas, partes, enlace a sus prompts]

## 5. Archivos con poca o ninguna IA

- [Completar con los archivos escritos a mano por el equipo]
- Configuración local de billeteras y llaves de testnet: hecha a mano (no está en el repositorio).
