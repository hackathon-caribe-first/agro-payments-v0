# DESIGN.md — Surco · Agro Payments

> **Estado:** guía de diseño propuesta (no implica que los estilos ya estén implementados).  
> **Versión:** 1.0 · **Fecha de revisión:** 16 de octubre de 2026.  
> **Producto:** Surco / Agro Payments · Agrofintech, financiación por hitos, verificación y distribución de pagos **simulados**.  
> **Fuente de verdad de la identidad actual:** **public/styles.css**, **public/planning.css** y **public/index.html** de la rama **main**, commit **e6d07ec6**.  
> **Alcance:** identidad visual, tipografía, sistema de diseño, UX de las pantallas actuales y criterios para próximas funcionalidades. La autenticación y los pagos reales quedan fuera de la demo actual.

## 1. Dirección creativa

**Idea rectora:** «Cercano como una superapp, claro como una plataforma financiera y conectado con el campo».

Surco debe verse **amigable, contemporáneo y confiable**. Tomamos como referencia el carácter humano y redondeado que el usuario asocia con Rappi, **no su logotipo, colores naranja, marca ni una supuesta tipografía oficial**. La identidad propia sigue siendo verde agrícola, lima y marfil.

### Principios innegociables

1. **Claridad antes que decoración.** Cada pantalla responde primero: ¿qué está pasando?, ¿qué falta?, ¿qué puedo hacer ahora?
2. **Una acción primaria por contexto.** Reducir botones simultáneos, especialmente para productores y verificadores.
3. **Dinero inequívoco.** Distinguir *presupuesto*, *capital comprometido*, *fondos de prueba*, *desembolso pendiente* y *pago confirmado*. Nunca presentar dinero simulado como real.
4. **Diseño de campo, no solo de oficina.** Legible al sol, táctil, rápido con una mano y resiliente ante conectividad limitada.
5. **Expresivo en momentos clave, sobrio en decisiones críticas.** La personalidad aparece en títulos, ilustración y estados positivos; aprobaciones, rechazos y pagos privilegian exactitud.
6. **Accesibilidad medible.** WCAG 2.2 AA como meta para la UI, sin afirmar conformidad hasta completar auditoría y pruebas.

**Palabras visuales:** humano, fértil, simple, ágil, transparente, optimista, profesional.  
**Evitar:** neón genérico, glassmorphism sobre tablas financieras, exceso de tarjetas, iconos sin etiqueta, gráficos puramente decorativos y copiar la estética naranja de otra marca.

## 2. Tendencias relevantes para 2026: investigación → decisión para Surco

Las tendencias son referencias, **no requisitos automáticos**. Se prioriza evidencia primaria cuando está disponible y se distingue de las observaciones editoriales de mercado.

| Tendencia / señal reciente | Evidencia y alcance | Aplicación en Surco | Evitar |
|---|---|---|---|
| **Diseño expresivo con propósito** | Investigación de Google publicada en CHI 2026: 48 participantes y 10 apps; los diseños Material 3 Expressive redujeron en ese estudio el tiempo de finalización de tareas 20 % y aceleraron la fijación en el elemento correcto 33 %. [R1] | Una acción destacada por flujo, jerarquía visual fuerte, chips claros, contraste de tamaños y formas suaves. | Suponer que esas mejoras se reproducirán automáticamente en Agro Payments. |
| **Tipografía variable y personalidad reconocible** | Material 3 Expressive promueve contraste tipográfico, forma y movimiento; Figma destacó mayor expresividad en Config 2026. [R2][R3] | Nunito variable para marca/títulos; pesos 800–900 en titulares y 600–700 en CTAs. | Usar tipografía decorativa en números, comprobantes o tablas. |
| **Módulos asimétricos tipo bento, pero funcionales** | Tendencia editorial de interfaces 2026; no es un estándar de usabilidad. [R4] | Resumen con una tarjeta principal de **próximo hito** y tarjetas menores de presupuesto, avance y pagos. | Convertir formularios, auditorías o movimientos financieros en mosaicos desordenados. |
| **Flujos móviles y confianza en pagos** | Stripe reportó que 65 % de sus transacciones inferiores a US$50 ocurrían en móvil; es dato de su red, **no de agricultores colombianos**. [R5] | Acciones y comprobantes legibles desde el teléfono; pasos claros y confirmación explícita. | Extrapolar porcentajes de Stripe a nuestro público objetivo. |
| **Diseño y código con una especificación viva** | Figma lanzó Specs para Markdown el 15 de octubre de 2026. [R6] | Este archivo documenta tokens, decisiones, estados y criterios que deben revisarse en PR. | Mantener un diseño en Figma desconectado del CSS implementado. |
| **Información densa cuando se necesita, no siempre** | Observación del mercado SaaS 2026; los dashboards priorizan cada vez más datos útiles frente a decoración excesiva. [R7] | Vista general resumida; detalle accesible en plan financiero, movimientos y auditoría. | Repetir la misma cifra en cinco tarjetas o esconder datos críticos en tooltips. |

**Interpretación de producto:** Surco debe combinar calidez visual de una app de consumo con reglas de confianza de una fintech. Las referencias externas aportan ideas; el criterio final son los recorridos de productor, verificador, administrador y custodio.

## 3. Paleta oficial **ya presente en el repositorio**

Estos valores se extrajeron de las variables **:root** de **public/styles.css**; **no son colores nuevos**.

| Token actual | Hexadecimal | Rol recomendado |
|---|---|---|
| **--ink** | **#153E31** | Verde principal; botones, encabezados, texto destacado |
| **--ink-deep** | **#10382B** | Sidebar y superficies oscuras |
| **--gray** | **#737B73** | Gris de apoyo existente; **revisar uso en texto pequeño** |
| **--fog** | **#F6F7F1** | Fondo marfil de la aplicación |
| **--surface** | **#FFFFFF** | Tarjetas, diálogos y formularios |
| **--line** | **#E6E9DF** | Divisores y bordes sutiles |
| **--lime** | **#D4EB9D** | CTA secundario expresivo, progreso y acentos |
| **--lime-deep** | **#B7DA71** | Variante intensa de lima |
| **--gold** | **#F9CA87** | Atención, trabajo pendiente y distribución visual |
| **--red** | **#BC614E** | Acento de error actual; **no usar directamente como texto pequeño sobre blanco** |
| **--radius** | **18px** | Radio base actual |

**Identidad reconocible:** verde profundo + marfil como base, lima para esperanza/progreso, dorado para avisos y rojo para problemas. No adoptar el naranja distintivo de Rappi.

### 3.1 Tokens semánticos propuestos (nuevos, no implementados)

Mantener intacta la paleta de marca y agregar variantes de **tinta accesible** para texto sobre fondos claros:

| Token nuevo | Valor sugerido | Uso |
|---|---|---|
| **--text-primary** | **#1A2F26** | Texto principal (ya usado en el body actual) |
| **--text-secondary** | **#53675A** | Texto secundario, descripciones, etiquetas |
| **--danger-text** | **#8C4032** | Error/rechazo legible sobre blanco |
| **--success-text** | **#32684A** | Confirmación legible sobre blanco |
| **--warning-text** | **#765322** | Advertencia legible sobre blanco |
| **--focus-strong** | **#32684A** | Indicador de foco en superficies claras |
| **--radius-sm** | **10px** | Campos, chips |
| **--radius-md** | **14px** | Tarjetas compactas |
| **--radius-lg** | **18px** | Tarjetas principales |
| **--radius-xl** | **22px** | Hero o contenedores de marca |

**No** reemplazar globalmente las variables actuales: los tokens semánticos distinguen función (texto, estado, foco) de identidad cromática (marca).

### 3.2 Contraste: auditoría inicial calculada

Relaciones relativas WCAG para combinaciones planas, sin transparencias ni gradientes:

| Par de colores | Contraste aproximado | Observación |
|---|---:|---|
| #153E31 sobre #FFFFFF | **11.90:1** | Supera AA para texto normal |
| #10382B sobre #FFFFFF | **12.94:1** | Supera AA |
| #1A2F26 sobre #F6F7F1 | **13.18:1** | Supera AA |
| #153E31 sobre #D4EB9D | **9.16:1** | Buen contraste para texto/CTA |
| #737B73 sobre #FFFFFF | **4.37:1** | Por debajo de AA para texto normal |
| #BC614E sobre #FFFFFF | **4.24:1** | Por debajo de AA para texto normal |
| #7E887E sobre #FFFFFF | **3.68:1** | Ejemplo de gris **hardcodeado** en el CSS actual; insuficiente para texto normal |
| #53675A sobre #FFFFFF (nuevo) | **6.08:1** | Alternativa accesible para texto secundario |
| #8C4032 sobre #FFFFFF (nuevo) | **7.26:1** | Alternativa accesible para mensajes de error |

Meta de **WCAG 2.2 AA**: texto normal ≥ **4.5:1**, texto grande ≥ **3:1**; para componentes y sus estados visuales esenciales, revisar también contraste no textual ≥ **3:1**. Revisar ratios reales contra el fondo efectivamente renderizado. [R8]

## 4. Tipografía: calidez cercana al estilo de Rappi, identidad independiente

### Decisión recomendada

- **Marca, H1–H3, títulos de tarjetas y botones:** **Nunito** variable (pesos 600–900). Sus terminales redondeados aportan cercanía sin copiar la marca de otra empresa.
- **Texto funcional, formularios, auditoría y cifras:** **Inter** (pesos 400–700), por precisión de lectura; ya está declarado como primera opción de fuente del body en **public/styles.css**.
- **Alternativa de exploración, NO aprobada para producción:** **Baloo 2** solo para pruebas del wordmark. Es más juguetona y podría restar seriedad a un producto financiero.

**Importante:** no afirmamos conocer ni reutilizar la fuente propietaria exacta de Rappi. El objetivo es una *sensación* de redondez, ritmo y cercanía. Nunito está publicada por Google Fonts bajo OFL; validar y conservar los avisos de licencia del archivo concreto elegido. [R9]

### Escala sugerida

| Uso | Escritorio | Móvil | Peso / familia |
|---|---:|---:|---|
| Logotipo textual «SURCO.» | 32–38 px | 27–32 px | Nunito 900, tracking -0.035em |
| Hero destacado | 36–40 px | 28–32 px | Nunito 800–900 |
| Título de página H1 | 32–36 px | 27–30 px | Nunito 800 |
| Encabezado de sección H2 | 22–24 px | 20–22 px | Nunito 800 |
| Título de tarjeta H3 | 17–18 px | 16–18 px | Nunito 700–800 |
| Número principal / KPI | 26–32 px | 22–28 px | Inter 700–800, tabulares |
| Texto principal | 16 px / 1.5 | 16 px / 1.5 | Inter 400–500 |
| Texto de apoyo, tabla | 14 px / 1.5 | 14 px / 1.5 | Inter 400–600 |
| Etiqueta auxiliar (no crítica) | 12–13 px | 12–13 px | Inter 600–700 |

**Reglas:** respetar tildes y «ñ»; evitar texto informativo de 9–11 px actualmente frecuente en la app; no depender de mayúsculas de tracking excesivo; usar **font-variant-numeric: tabular-nums** en dinero, porcentajes y fechas; mostrar moneda ISO cuando pueda haber ambigüedad (**USD**, **COP**).

### Implementación futura recomendada: autoalojar archivos WOFF2

El CSS actual menciona Inter pero **no carga su archivo**; por tanto, muchos usuarios verán una fuente de sistema. El documento propone incorporar Nunito/Inter con fuentes autoalojadas, sin depender de CDN y con licencias verificadas.

~~~css
/* Especificación de futuro cambio de implementación.
   Los archivos WOFF2 NO forman parte de este PR de documentación. */
@font-face {
  font-family: 'Nunito';
  src: url('/fonts/nunito-latin-variable.woff2') format('woff2');
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
}
:root {
  --font-brand: 'Nunito', 'Trebuchet MS', sans-serif;
  --font-ui: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --text-primary: #1a2f26;
  --text-secondary: #53675a;
  --danger-text: #8c4032;
  --success-text: #32684a;
  --warning-text: #765322;
  --focus-strong: #32684a;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 18px;
  --radius-xl: 22px;
}
h1, h2, h3, .brand, .button { font-family: var(--font-brand); }
body, input, textarea, select, .money, .table { font-family: var(--font-ui); }
.money, .stat-value, td[data-amount] { font-variant-numeric: tabular-nums; }
~~~

**Nota de implementación:** **src/server.mjs** solo sirve extensiones HTML/JS/CSS/SVG. Si se añaden archivos de fuentes se deberá habilitar **.woff2** con MIME **font/woff2** y verificar CSP. No introducir enlaces externos a CSS/fonts sin revisar **style-src** y **font-src**. Nunca compartir archivos de fuentes empaquetados sin comprobar su licencia.

## 5. Layout, densidad y navegación

### Escritorio / tablet

- Conservar el patrón de **sidebar verde oscuro** (hoy ~255 px) + área de trabajo marfil.
- Ancho de contenido objetivo 1200–1440 px; márgenes consistentes 24–48 px.
- Resumen modular: 1 tarjeta protagonista «Próxima decisión» + 2–4 métricas de apoyo. La grilla no debe ordenar los datos solo por estética.
- Formularios lineales; un solo panel dominante por tarea. Tablas reales con encabezados, orden y acciones nombradas.
- Espaciado basado en unidad de 4 px; escala de 4, 8, 12, 16, 24, 32, 48 px.

### Móvil / campo

- Mantener navegación inferior actual a ≤770 px, máximo **4–5 destinos** realmente disponibles; no desperdiciar espacio con módulos futuros deshabilitados.
- Zona segura: considerar **env(safe-area-inset-bottom)** y botones de acción sobre la barra inferior.
- Botones críticos con objetivo recomendado **44–48 px**; WCAG 2.2 AA exige **24×24 px**, salvo excepciones específicas de espaciado. [R10]
- Pantallas probadas a **320, 375, 390, 768, 1024 y 1440 px**, sin scroll horizontal accidental.
- Tarjetas apiladas y tablas con alternativa en filas verticales; conservar descarga/exportación de movimientos. No reducir tipografía hasta hacer caber el contenido.
- Evidencias de campo: foto, descripción, GPS opcional y estado de sincronización explícito. **No** prometer modo offline hasta implementarlo.

## 6. Componentes y patrones de interacción

### Botones

- **Primario**: fondo verde #153E31, texto blanco, acción principal («Guardar presupuesto», «Enviar a revisión»).
- **Secundario expresivo**: lima #D4EB9D y texto #153E31, para avanzar sin connotación de pago confirmado.
- **Terciario**: texto y borde verde sobre blanco.
- **Destructivo**: usar texto oscuro accesible **--danger-text** + descripción de consecuencias. Requiere confirmación cuando corresponda.
- Todos con hover, activo, cargando, deshabilitado y **:focus-visible** diferenciados. **Nunca** dar una señal falsa de éxito mientras la operación está pendiente.

### Tarjetas y etiquetas

- Tarjeta: blanco, línea #E6E9DF y radio 14–18 px; sombras muy sutiles solo si mejoran jerarquía.
- Etiqueta de estado: texto + color + símbolo; nunca únicamente color.
- Vacíos: explicar «qué falta» con un CTA relevante, no mostrar solo «sin datos».
- Carga: skeleton solo para información diferida; no bloquear toda la pantalla si una sección puede estar disponible.

### Formularios financieros

- Etiqueta visible, descripción breve y error junto al campo (no solo toast).
- Números alineados a la derecha en tablas; separar separador decimal, divisa y fecha.
- En presupuestos, mostrar **planificado / ejecutado / disponible / desviación** con unidades y fecha de corte.
- Para formularios largos: revelado progresivo de opciones avanzadas, **sin esconder información contractual o de autorización**.
- Deshacer cuando sea posible; para decisiones irreversibles, pedir confirmación y mostrar resumen.

### Estados de dinero y validación

| Estado | Texto visible | Tratamiento |
|---|---|---|
| Borrador | «Sin enviar» | Neutro; acción «Completar» |
| Evidencia enviada | «Pendiente de verificación» | Dorado + texto accesible |
| Hito aprobado | «Hito aprobado» | Verde, sin confundir con pago |
| Hito rechazado | «Requiere corrección» | Rojo oscuro + motivo |
| Transferencia en proceso | «Pago en proceso» | Neutro/advertencia; no usar check verde |
| Transferencia confirmada | «Pago simulado confirmado» | Verde + recibo de simulación |
| Transferencia incierta | «Resultado por conciliar» | Advertencia persistente + acción del custodio |
| Demo | «Entorno de simulación · Sin dinero real» | Visible en todas las pantallas financieras |

**Separar eventos:** aprobar un hito ≠ ordenar un pago ≠ confirmar recepción. Mostrar hora, responsable y referencia de cada estado. Las credenciales ficticias del selector de rol **no son autenticación**.

### Gráficos

- Mantener la identidad del gráfico diario **planificado (verde)** vs. **ejecutado (dorado)** que ya existe en **public/planning.css**.
- Añadir título, unidades, rango temporal, leyenda y alternativa tabular accesible.
- Distribución 50/30/20: barras con porcentaje **y** montos, más leyenda nominativa (productor, proveedor, trabajadores).
- No usar gráficos 3D, promedios sin unidad ni colores que impliquen rentabilidad garantizada.

### Modales y notificaciones

- Diálogo nativo actual: mantener título discernible, foco inicial, Escape, retorno de foco y navegación por teclado; seguir las guías W3C. [R11]
- Toast solo para éxito no crítico; errores de pago/conciliación deben persistir en la pantalla hasta resolverse.
- Movimiento sugerido 120–220 ms para estados/hover; animaciones mayores solo para transiciones narrativas, no para movimientos de fondos.
- Respetar **prefers-reduced-motion: reduce**.

## 7. Recomendación específica para cada pantalla actual

| Pantalla de la app | Jerarquía recomendada | Acción principal |
|---|---|---|
| **Vista general** | Estado del cultivo + próximo hito + capital estimado del período + avisos; bento moderado | «Ver siguiente hito» |
| **Plan financiero** | Presupuesto total y desviación arriba; gastos por etapa, línea diaria, categorías; datos en segundo nivel | «Registrar gasto» o «Guardar presupuesto» según rol |
| **Hitos y evidencias** | Timeline: borrador → evidencia → revisión → decisión; evitar información secundaria antes de completar tarea | «Agregar evidencia» / «Revisar hito» |
| **Pagos y distribución** | Estado de cada pago, destinatario, importe, recibo y discrepancias; lenguaje explícito de simulación | «Ver recibo» / «Conciliar» solo para custodio |
| **Actividad y auditoría** | Línea temporal filtrable por hito, actor y evento, con fecha/hora y resultado | «Filtrar actividad» |

### Recorridos por rol

- **Productor:** entrar → ver siguiente tarea → capturar evidencia → enviar → recibir resultado y corrección necesaria. Priorizar móvil.
- **Verificador:** bandeja por revisar → evidencia y ubicación **no verificada** → aprobar/rechazar con motivo → confirmación.
- **Administrador:** planear cultivo → presupuesto → comparar ejecución → revisar desviaciones.
- **Inversor/comprador:** avance del proyecto y compromisos, con denominaciones inequívocas; no simular garantías de retorno.
- **Custodio:** revisar los tres destinatarios, transferencias inciertas y conciliación sin reintentos ciegos.

## 8. Ilustración, iconos y voz de marca

- **Ilustración:** geometrías inspiradas en surcos, semillas y parcelas; luz cálida y acentos lima/dorado sobre verdes profundos.
- **Fotografía:** trabajo agrícola auténtico y contextual, con consentimiento; nunca fotos genéricas que pretendan ser evidencias reales de un proyecto.
- **Iconografía:** trazo consistente de ~1.75–2 px; iconos acompañados de etiqueta en acciones críticas.
- **Copy:** español claro de Colombia, verbos concretos, frases breves, errores accionables.
- **Microcopy de ejemplo:** «Tu evidencia quedó guardada», «Falta revisión técnica», «Se simuló un pago de USD 1.500; no se transfirió dinero».
- **No usar:** «rentabilidad garantizada», «pago exitoso» sin confirmación y «fondos custodiados» mientras solo exista saldo virtual.

## 9. Auditoría del diseño actual: cambios pendientes (no aplicados en este documento)

| Prioridad | Hallazgo comprobable en CSS/HTML actual | Acción para próximo PR visual |
|---|---|---|
| P0 | Uso extendido de texto de **9–12 px** en contenido funcional | Elevar escalas base; mínimo 14 px para datos que soportan decisiones, 16 px para cuerpo |
| P0 | Grises y rojo actuales con contraste insuficiente en determinadas combinaciones | Adoptar tokens semánticos; revisar todos los hardcodes y los fondos finales |
| P0 | Simulación identificada en UI, pero selector de roles es demostrativo | Asegurar etiqueta persistente «Simulación»; no aparentar sesión autenticada |
| P1 | Inter declarado en CSS sin archivo de fuente cargado | Incorporar Nunito/Inter autoalojadas con WOFF2, licencia, MIME y CSP adecuados |
| P1 | Sidebar y múltiples tarjetas compiten por atención | Jerarquizar la siguiente acción; ocultar contenido secundario por contexto, no por función |
| P1 | Barra de navegación móvil fija y componentes densos | Área segura, targets >=44 px recomendados, pruebas reales de 320 px y zoom 200 % |
| P1 | Tabla financiera y gráfico diario requieren accesibilidad más explícita | Etiquetas, tabla alternativa, unidades, encabezados y mensajes de vacío |
| P2 | Iconografía y animaciones carecen de especificación sistemática | Aplicar biblioteca consistente, motion tokens y preferencia de movimiento reducido |
| P2 | Componentes y estados no están centralizados como sistema | Extraer tokens y componentes gradualmente, sin reescribir el MVP de golpe |

### Definición de terminado para una implementación visual

- [ ] Respeta exactamente los 10 colores base existentes salvo decisión documentada.
- [ ] Titulares y botones usan Nunito si está efectivamente cargada; UI/cifras usan Inter o fallback probado.
- [ ] Contraste AA validado con valores computados de fondo + texto en estados normales, foco y deshabilitados cuando aplique.
- [ ] Flujos accesibles con teclado, lector de pantalla y zoom 200 %; foco visible.
- [ ] Interfaz funcional a 320/375/390/768/1024/1440 px.
- [ ] Estados de hito/pago identificables sin color; «simulación» nunca desaparece del contexto financiero.
- [ ] Screens de productor/verificador muestran primero una decisión útil.
- [ ] No se alteran montos, reglas de distribución ni permisos de dominio solo por cambios visuales.
- [ ] Sin dependencias externas innecesarias, imágenes pesadas o animaciones obligatorias.
- [ ] PR incluye capturas escritorio/móvil, pruebas de accesibilidad y referencia a este **design.md**.

## 10. Referencias verificadas (fecha de consulta: 2026-10-16)

**Fuentes primarias, investigación y estándares**

- [R1] Google Research, *Usability Hasn't Peaked* (CHI 2026): https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/
- [R2] Google Design, *Expressive Design: Google's UX Research* (2025): https://design.google/library/expressive-material-design-google-research
- [R3] Figma, *Config 2026: New Materials, New Tools and a More Expressive Canvas* (24/06/2026): https://www.figma.com/blog/config-2026-recap/
- [R5] Stripe, *How agents, digital wallets, and trust are rewriting checkout* (07/04/2026): https://stripe.com/blog/global-checkout-trends
- [R6] Figma, *Introducing Specs: Markdown as a Medium* (15/10/2026): https://www.figma.com/blog/introducing-figma-specs/
- [R8] W3C WAI, *WCAG 2.2 — Contrast (Minimum)*: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- [R9] Google Fonts, **Nunito** (licencia OFL y metadatos oficiales): https://github.com/google/fonts/blob/main/ofl/nunito/METADATA.pb
- [R10] W3C WAI, *WCAG 2.2 — Target Size (Minimum)*: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- [R11] W3C WAI, *HTML dialog / modales accesibles*: https://www.w3.org/WAI/WCAG22/Techniques/html/H102

**Lecturas editoriales de tendencias, no pruebas universales**

- [R4] UIXDraft, *Web Design Trends 2026* (julio de 2026; observación bento y tipografía): https://www.uixdraft.com/blog/web-design-trends-2026
- [R7] TheKitBase, *SaaS Dashboard Design Trends in 2026* (junio de 2026): https://thekitbase.app/blog/saas-dashboard-design-trends-2026

**Nota sobre Rappi:** la similitud deseada es **formal y emocional** (formas redondeadas, titulares contundentes y tono cercano), no el uso de su wordmark ni de sus activos. Sin documentación oficial de la fuente propietaria concreta, no se atribuye un nombre tipográfico a Rappi.

---

**Gobernanza:** mantener este documento en el repositorio como especificación viva. Toda modificación deliberada de tokens, tipografía, colores, jerarquía, estados de pagos o experiencia móvil debe actualizar **design.md** en el mismo PR. **Este documento por sí solo no cambia el aspecto ni la funcionalidad de la aplicación desplegada.**
