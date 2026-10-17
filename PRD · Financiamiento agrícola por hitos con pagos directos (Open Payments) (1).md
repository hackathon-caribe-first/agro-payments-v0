# PRD · Financiamiento agrícola por hitos con pagos directos (Open Payments)

Oct 16, 2026 · @Rafael Arnedo

## Resumen

La web app (la Plataforma) financia proyectos agrícolas por hitos y paga a proveedores y productores directamente desde la wallet del inversor, sin custodiar fondos. Para eso usa Open Payments: el inversor autoriza un tope por hito y la Plataforma ejecuta los pagos dentro de ese tope.

**Problema.** Hoy el capital de un proyecto agrícola pasa por intermediarios que lo custodian. El inversor no ve en qué se gasta cada hito. El productor espera semanas a que le liberen los fondos.

**Propuesta.** La web app orquesta el ciclo completo: publicación del proyecto, fondeo por hito, compra de insumos, verificación técnica, pago al productor y liquidación final de la venta. Cada peso va de la wallet de quien paga a la wallet de quien cobra.

**Decisiones clave**

1. **Sin custodia.** La Plataforma nunca recibe el dinero de un hito ni de una venta. Solo recibe su comisión, como un beneficiario más.
2. **Un grant por hito.** El inversor aprueba un grant `outgoing-payment` con tope igual al presupuesto máximo del hito. La Plataforma revoca ese grant cuando termina la última transferencia del hito. Lo que no se gastó nunca salió de la wallet del inversor.
3. **La Plataforma hace el split.** La web app reparte el presupuesto del hito entre proveedores y productor. Cada línea del split es un pago directo e independiente, con su propio comprobante.

Este PRD toma como base la PoC del orquestador (`orquestador/`). En ella, el «vendedor» es el **Productor** y el «comprador» es el **Inversor**.

## Objetivos y no objetivos

El MVP debe demostrar el ciclo completo de un proyecto con al menos 3 hitos, con dinero que nunca pasa por la Plataforma salvo su comisión.

**Objetivos**

- El inversor fondea un hito con una sola aprobación en su wallet y ve en tiempo real cada pago que se hace con ese grant.
- Los proveedores reciben exactamente el valor de su factura u orden de compra.
- El productor recibe el pago de mano de obra o adelanto el mismo día en que el verificador aprueba el hito.
- Al cerrar cada hito, el grant queda revocado y lo no ejecutado sigue en la wallet del inversor.
- La venta final se liquida en un solo paso: capital y rendimiento al inversor, utilidad al productor y comisión a la Plataforma.
- Cualquier persona puede auditar cada pago: ids del incoming y del outgoing payment, montos enviados y recibidos, y la traza de las llamadas.

**No objetivos (MVP)**

- Custodiar fondos o «bloquear» dinero en subcuentas. Open Payments no lo permite sin un custodio; ver la sección de principios.
- Pagos entre monedas distintas: todas las wallets de un proyecto usan el mismo `assetCode`.
- Pasarelas de tarjeta o transferencias bancarias fuera de Open Payments.
- Generación legal automática de contratos: en el MVP la Plataforma adjunta un contrato plantilla y registra las firmas.
- Mercado secundario de participaciones del inversor.

## Actores y roles

La Plataforma es el único cliente de Open Payments: firma todas las peticiones con su llave y nunca es dueña de los fondos que mueve.

| Actor | Rol en el flujo | En Open Payments | Equivalente en la PoC |
| --- | --- | --- | --- |
| Plataforma (web app) | Publica proyectos, calcula el split, pide grants, ejecuta y revoca pagos, emite comprobantes | Cliente GNAP: wallet address propia + llave Ed25519 | Orquestador |
| Productor | Registra el proyecto y los hitos, reporta avances, cobra mano de obra y utilidad | Wallet address receptora (incoming payments) | Vendedor |
| Inversor | Fondea el proyecto aprobando un grant por hito | Wallet address pagadora; aprueba grants en su wallet | Comprador |
| Proveedores de insumos | Entregan insumos y servicios del hito y cobran su factura | Wallet address receptora | — (nuevo) |
| Verificador técnico | Inspecciona el hito y emite el dictamen que libera el pago al productor | Ninguno: rol dentro de la Plataforma | — (nuevo) |
| Comprador final | Compra la cosecha y paga la orden de compra | Wallet address pagadora; aprueba un grant por orden | — (nuevo) |

**El carril «Fiducia / Open Payments» del diagrama** no es una cuenta de la Plataforma. Son las wallets de cada actor en su proveedor de cuentas (ASE) y los servidores de autorización y de recursos de Open Payments. La Plataforma da órdenes de pago autorizadas; el ASE mueve el dinero entre las wallets.

## Principios de diseño y cambios respecto al diagrama

El diagrama original supone un escrow que bloquea el capital. Con Open Payments y sin custodio, el capital se queda en la wallet del inversor y lo que se bloquea es el **permiso** de gastarlo, hito por hito.

**Principios**

1. **El dinero no toca a la Plataforma.** Cada pago es un outgoing payment de la wallet del pagador hacia un incoming payment de la wallet del beneficiario.
2. **Permiso mínimo y temporal.** Un grant cubre un solo hito y solo hasta su presupuesto máximo. Se revoca en cuanto el hito termina, se cancela o vence.
3. **La Plataforma decide el reparto; Open Payments lo ejecuta.** El split se calcula en la web app y cada línea se paga por separado.
4. **Lo humano se limita a decidir.** El inversor aprueba un grant por hito y el verificador emite su dictamen. El resto lo ejecuta la Plataforma.
5. **Todo pago es auditable y repetible sin duplicarse.** Cada línea tiene una clave de idempotencia, un estado y un comprobante.

**Qué cambia respecto al diagrama**

| Paso del diagrama | Cómo se implementa | Por qué |
| --- | --- | --- |
| Fase 2: «Transferencia de capital total acordado (Grant / Escrow)» | El inversor aprueba el grant del **hito 1**; los siguientes se piden hito a hito | Un grant por hito limita la exposición y no inmoviliza dinero |
| Fase 2: «Bloquear fondos en subcuentas por hito» | No se bloquean fondos. El tope de cada grant hace de «subcuenta» lógica | Open Payments no reserva saldo; ver el riesgo de saldo insuficiente |
| Fase 2: «Confirmación de fondeo (webhook)» | Confirmación del `grant.continue` con el hash de interacción verificado | Open Payments no tiene webhooks hacia el cliente; la Plataforma consulta el estado |
| Fase 3: «Desbloquear asignación presupuestal para el siguiente hito» | Revocar el grant del hito N y pedir el grant del hito N+1 | Cada hito tiene su propio permiso |
| Fase 4: «Pago recibido en custodia» | El comprador final aprueba un grant por la orden; el pago se ejecuta al confirmar la recepción | Sin custodia; el comprador conserva el dinero hasta la entrega |
| Fase 4: «Instrucción de liquidación final» | Split de liquidación sobre el grant de la orden: inversor, productor y Plataforma | Mismo mecanismo que los hitos |

## Flujo por fases

Solo las fases 2, 3 y 4 mueven dinero, y en las tres se usa el mismo patrón: grant con tope → split → un pago por línea → revocación.

### Fase 1 · Publicación y negociación (sin dinero)

1. El productor registra el proyecto: cultivo, cronograma, fondo de imprevistos y su wallet address. La Plataforma valida la wallet con un `GET` (existe, `assetCode` y `assetScale`).
2. El productor define los hitos. Cada uno tiene plazo, presupuesto máximo y líneas de split previstas (insumos, servicios y mano de obra).
3. La Plataforma publica la oportunidad en el catálogo.
4. El inversor explora el catálogo y envía una propuesta: monto y rendimiento. El productor la acepta o la contraoferta.
5. La Plataforma genera el contrato a partir de una plantilla, con los hitos, sus topes y la regla de liquidación. Ambos lo firman digitalmente.

### Fase 2 · Fondeo del hito 1

1. La Plataforma pide un grant `outgoing-payment` sobre la wallet del inversor con `limits.debitAmount` = presupuesto máximo del hito 1, sin `interval`.
2. El inversor aprueba el grant en su wallet. Es el único paso humano de esta fase.
3. La Plataforma verifica el hash de interacción, hace `grant.continue` y guarda el token y la `manage_url` cifrados.
4. La Plataforma marca el proyecto como «habilitado», avisa al productor y emite el certificado de inversión al inversor.

### Fase 3 · Ejecución de cada hito (bucle 1…N)

1. **Sub-etapa A · Insumos.** El productor elige proveedores y carga facturas u órdenes. La Plataforma arma el split de insumos y paga cada línea al proveedor: grant `incoming-payment` del proveedor → incoming payment → consulta de lo gastado → outgoing payment desde la wallet del inversor. El comprobante va al productor y al inversor.
2. **Sub-etapa B · Ejecución.** El productor aplica los insumos y marca el hito como terminado, con bitácoras, fotos y evidencia. La Plataforma notifica al verificador.
3. **Sub-etapa C · Inspección.** El verificador inspecciona en campo o en remoto y emite el dictamen.
   1. **Aprobado:** la Plataforma paga la línea del productor (mano de obra o adelanto), revoca el grant del hito y pide el grant del hito siguiente.
   2. **Observado:** la Plataforma envía la lista de subsanaciones. El productor corrige (puede pedir fondos de imprevistos) y vuelve a solicitar la verificación. El grant sigue vivo, pero la línea del productor no se paga.

### Fase 4 · Liquidación final y venta

1. El productor reporta el fin del ciclo y el volumen cosechado. El verificador certifica calidad y cantidad.
2. La Plataforma publica el lote en el marketplace. El comprador final genera la orden de compra.
3. La Plataforma pide un grant `outgoing-payment` sobre la wallet del comprador final, con tope = total de la orden. El comprador lo aprueba.
4. El productor despacha. El comprador final confirma la recepción a satisfacción.
5. La Plataforma ejecuta el split de liquidación desde la wallet del comprador final: capital y rendimiento al inversor, utilidad neta al productor y comisión a la Plataforma. Después revoca el grant de la orden.
6. La Plataforma emite el estado de cuenta final al productor y el balance de inversión al inversor.

## Grant por hito

Cada hito tiene exactamente un grant `outgoing-payment` vivo, con tope igual a su presupuesto máximo, que se revoca en cuanto se confirma el último pago del hito.

&#91;embedded content: ciclo de vida del grant de un hito · 1 decisión, 1 bucle\]

El dictamen observado no revoca el grant: vuelve a verificación tras la subsanación. Una cancelación o un plazo vencido lo revocan aunque queden líneas sin pagar.

**Reglas**

1. **Solicitud.** `access.type` = `outgoing-payment`, `actions` = `create`, `read` y `list`, `identifier` = wallet del inversor y `limits.debitAmount` = presupuesto máximo del hito, que ya incluye el margen de comisiones. **Sin** `limits.interval`: el tope es para toda la vida del grant, no por periodo. Para pagar con `receiveAmount` fijo hace falta además un grant `quote` no interactivo en el auth server del inversor.
2. **Guardar para revocar.** Del `grant.continue` se guardan cifrados el access token, la `manage_url` y también el `continue.uri` con su token: sin ellos no se puede revocar. La PoC no guardaba los dos últimos.
3. **Uso.** Antes de cada línea se consulta `outgoing-payment-grant`. Si el token vence, se rota con la `manage_url`.
4. **Revocación.** Con `grant.cancel` (`DELETE` sobre `continue.uri`) en cuatro casos: última línea confirmada, hito cancelado, plazo vencido (D-08) o incidente de seguridad. Después se borran los tokens guardados.
5. **Prueba de revocación.** La Plataforma registra en la auditoría la respuesta del `DELETE` y el comprobante de cierre del hito: tope, gastado y sobrante que sigue en la wallet del inversor.
6. **Un solo grant vivo.** Nunca hay dos grants vivos para el mismo hito e inversor. El grant del hito N+1 se pide después de revocar el del hito N.

## Split del hito

La web app convierte el presupuesto de un hito en líneas de pago, y cada línea es un pago directo del inversor a un beneficiario. La suma de las líneas más las comisiones estimadas nunca puede superar el tope del grant del hito.

**Modelo**

- **Hito:** id, proyecto, plazo, presupuesto máximo (= tope del grant), estado, grant asociado.
- **Línea de split:** id, beneficiario (rol + wallet address validada), concepto (factura, orden, mano de obra), monto, modo del monto, momento de pago (`insumos`, `aprobacion` o `liquidacion`), estado (`pendiente`, `completado`, `fallido` o `en_cola`) y comprobante.

**Ejemplo: hito 2, fertilización, presupuesto máximo 1,000.00 EUR**

| Línea | Beneficiario | Momento | Recibe (EUR) | Comisión estimada (EUR) | Debita al inversor (EUR) |
| --- | --- | --- | --- | --- | --- |
| Fertilizante, factura F-118 | Proveedor A | insumos | 600.00 | 1.00 | 601.00 |
| Transporte, orden T-07 | Proveedor B | insumos | 120.00 | 1.00 | 121.00 |
| Mano de obra del hito | Productor | aprobación | 230.00 | 1.00 | 231.00 |
| **Total** |  |  | **950.00** | **3.00** | **953.00** |

Los 47.00 EUR no ejecutados nunca salen de la wallet del inversor: el grant se revoca al cerrar el hito. La comisión de 1.00 EUR por pago es la observada en la testnet en EUR; en producción se toma la del ASE del pagador.

**Reglas de cálculo**

1. **Recibe exacto.** Proveedores y productor reciben exactamente el monto pactado. La línea se paga con `receiveAmount` fijo (vía quote) y la comisión la absorbe el inversor dentro del tope. Esto difiere de la PoC, que fijaba `debitAmount` y descontaba la comisión al receptor.
2. **Validación de tope.** Al definir el hito y al cargar cada factura: Σ recibe + Σ comisión estimada ≤ presupuesto máximo. Si no cabe, la factura se rechaza antes de pedir pagos.
3. **Consolidación.** Varias facturas del mismo proveedor en el mismo momento se pagan en una sola línea, para pagar una sola comisión.
4. **Mínimo pagable.** Una línea menor que la unidad mínima (0.01 con `assetScale` 2) no se crea. Una línea ≤ comisión se marca como aviso y se consolida o se paga junto con el siguiente momento.
5. **Porcentajes y redondeo.** Si una línea se define en porcentaje (habitual en la liquidación), se calcula en unidades mínimas con aritmética entera, sin decimales flotantes. Los céntimos sobrantes del redondeo van a la línea del productor.
6. **Lo no gastado no es del productor.** El sobrante del hito no se reparte: se queda en la wallet del inversor.

**Ejecución**

- Las líneas de un mismo grant se pagan de una en una, para que la consulta de lo gastado no tenga carreras.
- Cada línea sigue los pasos de la PoC: grant `incoming-payment` del beneficiario → incoming payment → quote → consulta de lo gastado → outgoing payment → verificación. Su clave de idempotencia es `hito:línea`.
- Una línea que falla no bloquea a las demás. El hito no se cierra hasta que todas sus líneas estén en estado final.

**Split de liquidación (fase 4).** Usa el mismo modelo, pero sobre el grant del comprador final. Se aplica en este orden: comisión de la Plataforma, capital del inversor, rendimiento pactado y, por último, utilidad neta del productor como resto. Si la venta no alcanza, el inversor asume la pérdida (D-04).

## Requisitos funcionales

Los requisitos marcados **MVP** son necesarios para la primera entrega; el resto puede esperar a la siguiente.

| ID | Requisito | Prioridad |
| --- | --- | --- |
| RF-01 | Registrar proyectos con cultivo, cronograma, fondo de imprevistos y wallet del productor, validando la wallet con `GET` (existe, `assetCode`, `assetScale`) | MVP |
| RF-02 | Definir hitos con plazo, presupuesto máximo y líneas de split previstas; rechazar hitos cuya suma supere el presupuesto | MVP |
| RF-03 | Catálogo de proyectos y propuesta de inversión con aceptación o contraoferta del productor | MVP |
| RF-04 | Contrato desde plantilla con hitos, topes y regla de liquidación, y registro de la firma digital de ambas partes | MVP |
| RF-05 | Solicitar el grant `outgoing-payment` del hito sobre la wallet del inversor, con `debitAmount` = presupuesto máximo y sin `interval` | MVP |
| RF-06 | Verificar el hash de interacción GNAP (con y sin «/» final), hacer `grant.continue` y guardar token y `manage_url` cifrados | MVP |
| RF-07 | Rotar el token del grant con `manage_url` ante 401 o 403 «Inactive Token» y reintentar una sola vez | MVP |
| RF-08 | Registrar proveedores con su wallet address validada y cargar facturas u órdenes como líneas del hito | MVP |
| RF-09 | Calcular el split del hito con las reglas de la sección anterior y bloquear líneas que no quepan en el tope | MVP |
| RF-10 | Pagar cada línea con incoming payment del beneficiario, quote con `receiveAmount` y outgoing payment del inversor; consultar `outgoing-payment-grant` antes de pagar | MVP |
| RF-11 | Idempotencia por línea (`hito:línea`): un reintento nunca crea un segundo outgoing payment; buscar por `metadata` antes de recrear | MVP |
| RF-12 | Flujo de verificación técnica: solicitud, evidencia, dictamen aprobado u observado, subsanaciones y re-verificación | MVP |
| RF-13 | Con dictamen aprobado: pagar la línea del productor, revocar el grant del hito y solicitar el grant del hito siguiente | MVP |
| RF-14 | Revocar el grant (`grant.cancel`) cuando el hito se cierra, se cancela o vence su plazo; confirmar que un pago posterior es rechazado | MVP |
| RF-15 | Comprobante por línea: ids del incoming y del outgoing payment, montos debitado y recibido, comisión, gastado antes y después | MVP |
| RF-16 | Grant de la orden de compra del comprador final y split de liquidación tras confirmar la recepción | MVP |
| RF-17 | Conciliación: listar los incoming payments de cada beneficiario con un grant de lectura y cuadrarlos con los comprobantes | MVP |
| RF-18 | Notificaciones a productor, inversor, verificador y proveedores en cada cambio de estado del hito | MVP |
| RF-19 | Panel del inversor: grant de cada hito, gastado frente al tope, líneas y comprobantes en tiempo real | MVP |
| RF-20 | Vista de traza para soporte: peticiones reales a Open Payments como curl, con tokens recortados por defecto | MVP |
| RF-21 | Fondo de imprevistos como porcentaje fijo del presupuesto de cada hito, dentro de su grant | Siguiente |
| RF-22 | Estado de cuenta final del productor y balance de inversión del inversor, exportables en PDF | Siguiente |
| RF-23 | Varios inversores por proyecto, con split del hito proporcional entre sus grants | Siguiente |

## Requisitos no funcionales

La Plataforma maneja permisos de gasto sobre dinero ajeno, así que la seguridad de la llave y de los tokens pesa más que el rendimiento.

| ID | Requisito |
| --- | --- |
| RNF-01 | La llave privada Ed25519 de la Plataforma vive en un gestor de secretos o un KMS; nunca en el repositorio, en logs ni en la base de datos. Al arrancar se comprueba contra `jwks.json` que el `keyId` corresponde a la llave. |
| RNF-02 | Access tokens, continue tokens y `manage_url` se guardan cifrados (AES-256-GCM o el KMS) y se recortan en logs e interfaz. |
| RNF-03 | Idempotencia de punta a punta: evento, línea y outgoing payment. Un reintento, un doble clic o un reinicio nunca pagan dos veces. |
| RNF-04 | Persistencia transaccional (PostgreSQL) para hitos, líneas, grants y comprobantes; el archivo JSON de la PoC no sirve en producción. |
| RNF-05 | Reintentos con espera exponencial ante errores de red y 5xx (como máximo 5); los errores de negocio no se reintentan. |
| RNF-06 | Auditoría inmutable: cada cambio de estado de hito, línea y grant queda con fecha, actor y causa. |
| RNF-07 | Autenticación y roles en la web app (productor, inversor, verificador, proveedor, comprador, operador); cada acción se autoriza por rol y por proyecto. |
| RNF-08 | Un pago confirmado aparece en el panel del inversor en menos de 30 s. |
| RNF-09 | La web app es usable en móvil: el productor reporta evidencia desde el campo. |
| RNF-10 | Montos en unidades mínimas con aritmética entera; nunca decimales flotantes. |

## Lecciones de la PoC

La PoC del orquestador corrió contra la testnet `wallet.interledger-test.dev` y dejó estas reglas, que el producto debe respetar.

| Lección | Qué exige al producto |
| --- | --- |
| Los access tokens vencen en minutos (`expires_in` 600 s en el grant del receptor) | Rotación automática con `manage_url`; un hito que dura semanas depende de ella |
| Superar el tope devuelve 403 «unauthorized» sin detalle | Consultar lo gastado antes de pagar y reportar `GRANT_LIMIT_EXCEEDED`, distinto de un token vencido |
| `grantSpentDebitAmount` en la respuesta del pago es lo gastado **antes** del pago | Volver a consultar `outgoing-payment-grant` para el comprobante |
| Con `debitAmount` fijo, la comisión (1.00 EUR por pago en EUR; 0 en COP) se descuenta al receptor; si el pago es menor, la wallet responde «negative receive amount» | Pagar con `receiveAmount` fijo y consolidar líneas pequeñas |
| Un `keyId` que no corresponde a la llave da 401 «invalid signature» | Comprobar la llave contra `jwks.json` al arrancar |
| Si el navegador tiene abierta la wallet con otra cuenta, la aprobación muestra «Access to the given resource is forbidden» | Avisar al inversor de que debe entrar con la cuenta dueña de la wallet; ofrecer un enlace de reintento |
| Las wallet addresses de una misma cuenta comparten saldo, y Open Payments no dice a qué cuenta pertenecen | Los roles deben estar en cuentas distintas; se declara en el registro y se verifica en la conciliación |
| Open Payments no expone saldos | La prueba de que el dinero no pasa por la Plataforma se hace con comprobantes y conciliación de incoming payments |

**Por validar en la testnet antes del MVP:** grant sin `interval` como tope total del hito, revocación con `grant.cancel` y rechazo posterior, y pago con quote de `receiveAmount` fijo. La PoC no cubrió estos tres casos.

## Diagramas de las vistas de la PoC

La PoC tiene dos vistas, y cada una prueba un modelo de grant. **Orquestador** (`/`) usa un grant con intervalo que se reinicia cada periodo. **Hito** (`/hito.html`) usa un grant de monto máximo sin intervalo, que es el modelo de este PRD.

### Vista Orquestador: grant con intervalo

&#91;embedded content: vista Orquestador (index.html) · grant con intervalo, 5 pasos por evento\]

Un evento que no cabe en el tope no falla: queda en cola y se reintenta solo al empezar el siguiente intervalo. Si el token vence en cualquier paso, se rota con la `manage_url` y la llamada se reintenta una vez.

**Quién genera cada solicitud en la vista Orquestador.** Cada flecha sale del rol que genera la solicitud.

&#91;embedded content: vista Orquestador · secuencia por roles: 5 carriles, 14 solicitudes\]

El comprador solo actúa una vez, en el paso 4. A partir de ahí, los eventos los genera el timer o el operador, y cada llamada a Open Payments la genera y la firma la Plataforma. El paso 14 (rotar el token) solo ocurre cuando el token vence.

### Vista Hito: grant de monto máximo

&#91;embedded content: vista Hito (hito.html) · grant de monto máximo, 6 pasos por línea, revocación al final\]

Aquí no hay «siguiente intervalo»: una línea que no cabe en lo que queda del tope falla con `GRANT_LIMIT_EXCEEDED`. Cuando no quedan líneas, la Plataforma revoca el grant, comprueba que el token ya no sirve y el sobrante sigue en la wallet del pagador.

**Quién genera cada solicitud en la vista Hito.** Cada flecha sale del rol que genera la solicitud.

&#91;embedded content: vista Hito · secuencia por roles: 5 carriles, 18 solicitudes\]

El pagador solo actúa en el paso 5: aprueba el grant en su wallet. Todas las flechas que salen de la Plataforma son peticiones firmadas con su llave. El dinero (14) va de ASE a ASE y nunca pasa por la Plataforma.

### Quién genera cada solicitud en el producto

Las personas generan solicitudes a la Plataforma o aprueban grants en su wallet. Todas las llamadas a Open Payments las genera y las firma la Plataforma, y solo después de la autorización indicada en la última columna.

| # | Solicitud | La genera | Va a | Requisito o autorización |
| --- | --- | --- | --- | --- |
| 1 | Registrar proyecto, hitos y split previsto | Productor | Plataforma | Wallet del productor validada |
| 2 | Propuesta de inversión | Inversor | Plataforma | El productor la acepta o contraoferta |
| 3 | Firma del contrato | Productor e inversor | Plataforma | Las dos firmas |
| 4 | Grant `outgoing-payment` del hito (tope, sin `interval`) | Plataforma | ASE del inversor | El inversor lo aprueba en su wallet |
| 5 | Cargar facturas u órdenes del hito | Productor | Plataforma | Caben en el tope del hito |
| 6 | Solicitud de fondos de imprevistos | Productor | Plataforma | Dentro del porcentaje fijo del hito (D-05) |
| 7 | Grant `incoming-payment` e incoming payment de cada línea | Plataforma | ASE del beneficiario | No interactivo |
| 8 | Outgoing payment a un proveedor | Plataforma | ASE del inversor | Grant del hito vigente y el pago cabe en lo que queda |
| 9 | Marcar el hito como terminado, con evidencia | Productor | Plataforma | — |
| 10 | Dictamen técnico (aprobado u observado) | Verificador | Plataforma | Solo el verificador asignado al proyecto |
| 11 | Outgoing payment al productor (mano de obra) | Plataforma | ASE del inversor | Dictamen aprobado |
| 12 | Outgoing payment de la comisión del hito | Plataforma | ASE del inversor | Dictamen aprobado (D-06) |
| 13 | Revocar el grant del hito (`grant.cancel`) | Plataforma | ASE del inversor | Última línea confirmada o hito cancelado |
| 14 | Grant del hito siguiente | Plataforma | ASE del inversor | Dictamen aprobado del hito anterior; el inversor lo aprueba (D-02) |
| 15 | Orden de compra de la cosecha | Comprador final | Plataforma | Lote certificado por el verificador |
| 16 | Grant `outgoing-payment` de la orden | Plataforma | ASE del comprador final | El comprador final lo aprueba |
| 17 | Confirmar la recepción | Comprador final | Plataforma | — |
| 18 | Split de liquidación: inversor, productor y Plataforma | Plataforma | ASE del comprador final | Recepción confirmada |
| 19 | Revocar el grant de la orden | Plataforma | ASE del comprador final | Liquidación completa |

## Métricas de éxito

El piloto se da por exitoso si cumple todas estas metas en un proyecto real de al menos 3 hitos.

| Métrica | Meta del piloto |
| --- | --- |
| Pagos duplicados | 0 |
| Dinero de hitos o ventas que pasó por la wallet de la Plataforma (fuera de su comisión) | 0 |
| Comprobantes que cuadran con la conciliación de incoming payments | 100 % |
| Grants revocados al cerrar su hito | 100 % |
| Tiempo desde el dictamen aprobado hasta el pago del productor | < 5 min |
| Pagos que terminan en `completado` sin intervención manual | ≥ 98 % |
| Aprobaciones humanas del inversor por hito | 1 |

## Riesgos y mitigaciones

El riesgo principal es que, sin custodia, un grant aprobado no garantiza que el dinero siga en la wallet cuando llega el momento de pagar.

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| El inversor no tiene saldo al pagar insumos o al productor (Open Payments no reserva fondos) | Proveedor sin pago y hito detenido | Pagar insumos al inicio del hito; si un pago falla por fondos, avisar al inversor y dejar la línea `en_cola`; penalidad contractual; evaluar un ASE que ofrezca reserva |
| El comprador final revoca el grant de la orden antes de confirmar la recepción | El productor despacha y no cobra | Despacho solo con grant vigente; pago parcial anticipado como línea separada; condiciones en el contrato de compra |
| El inversor revoca el grant a mitad de hito | Las líneas restantes no se pueden pagar | Detectar el error de rotación o 401 permanente, marcar el hito como «fondeo interrumpido» y escalarlo |
| Las comisiones reales difieren de las estimadas | El último pago no cabe en el tope | Margen de comisiones en el presupuesto; quote antes de cada pago; la línea pasa a `en_cola` si no cabe |
| Robo de la llave de la Plataforma | Pagos no autorizados dentro de los topes vigentes | KMS, rotación de llave, grants de vida corta y revocación inmediata de todos los grants vivos |
| Disputa sobre el dictamen del verificador | Pago retenido o pagado por error | Evidencia y dictamen firmados en la auditoría; flujo de apelación; el pago al productor solo sale con dictamen aprobado |
| Requisitos regulatorios del país de operación | Bloqueo del lanzamiento | Consulta legal antes del piloto (decisión abierta D-01) |

## Decisiones abiertas

- [ ] **D-01 Regulación:** ¿orquestar pagos sin custodiar fondos exige licencia o registro en el país del piloto? Consultar a un asesor legal.
- [ ] **D-02 Momento del grant:** ¿el inversor aprueba el grant de cada hito después de que el verificador cierra el anterior con su dictamen (propuesta de este PRD) o todos los grants al fondear el proyecto? El cierre del hito lo hace solo el verificador; el inversor no interviene en él.
- [ ] **D-03 Un grant o dos por hito:** decidido: un solo grant por hito cubre insumos y mano de obra.
- [ ] **D-04 Orden de liquidación** si la venta no cubre capital más rendimiento: decidido, el inversor asume la pérdida.
- [ ] **D-05 Fondo de imprevistos:** decidido, un porcentaje fijo dentro del presupuesto de cada hito.
- [ ] **D-06 Comisión de la Plataforma:** decidido, se cobra por hito.
- [ ] **D-07 Moneda y ASE de producción:** el piloto usa COP (decidido); falta elegir el ASE. Define comisiones y mínimos.
- [ ] **D-08 Plazo vencido:** descartada. El grant del siguiente hito solo se genera cuando el verificador dictamina el hito; sin dictamen no hay grant nuevo.

## Plan de entrega

La entrega va en cuatro etapas, y no se pasa a la siguiente sin cumplir el gate de la anterior. Las fechas están por definir.

&#91;embedded content: plan de entrega · 4 etapas, 3 gates (sin fechas: por definir)\]

La etapa 0 valida en la testnet el comportamiento de grants que exigen las especificaciones de este PRD. La etapa 1 implementa el grant por hito con split y revocación, todavía en la testnet. Antes de la etapa 3 tienen que estar resueltas las decisiones que siguen abiertas: D-01 (regulación), D-02 (momento del grant) y el ASE de D-07.
