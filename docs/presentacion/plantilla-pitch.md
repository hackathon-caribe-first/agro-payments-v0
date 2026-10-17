# Pitch Surco — texto para la plantilla "OP Hackathon Pitch Template ES"

Hackatón Interledger Open Payments · Medellín · Sala 4 · 17 de octubre de 2026
Duración objetivo: 5:00 (mínimo 3:00). Equipo: Caribe First. Proyecto: Surco.

Fuente del contenido: deck HTML del pitch (11 diapositivas, PRD v3). Los textos entre corchetes `[...]` son pendientes que se deben completar antes de presentar. No inventar cifras.

Reparto de tiempo:

| # | Diapositiva | Tiempo |
|---|---|---|
| 1 | Portada | 0:00–0:15 |
| 2 | Equipo | 0:15–0:30 |
| 3 | Problema | 0:30–1:00 |
| 4 | Frase de impacto (opcional) | 1:00–1:10 |
| 5 | La solución | 1:10–2:10 |
| 6 | Demo en vivo | 2:10–4:20 |
| 7 | Cierre | 4:20–5:00 |

---

## 1. Equipo + nombre del proyecto + fecha + ciudad

**Título:** Surco

**Texto en pantalla:**
- Financiamos la siembra por hitos: el dinero se mueve solo cuando el cultivo avanza.
- Caribe First · [Ciudad de origen]
- Medellín · 17 de octubre de 2026

**Notas del orador (0:00–0:15):**
"Hola, somos Caribe First, de [Ciudad de origen]. Les presentamos Surco: financiamos proyectos agrícolas por hitos. El dinero del inversionista queda en custodia y solo llega al productor y a sus proveedores cuando el cultivo avanza y un verificador lo aprueba. Todos los pagos corren sobre Open Payments."

---

## 2. Presentación del equipo

**Título:** Caribe First

**Texto en pantalla:**
- [Foto del equipo]
- A. Hans Peter Castellar — backend e integración Open Payments
- B. Faber [Apellido] — frontend
- C. [Nombre — rol]
- D. [Nombre — rol]
- E. [Nombre — rol]

**Notas del orador (0:15–0:30):**
"Somos [número] personas. Hans Peter llevó el backend y la integración con Open Payments; Faber, el frontend; [Nombre], [rol]; [Nombre], [rol]. Entre todos construimos Surco de punta a punta durante el hackatón."

---

## 3. Problema

**Título:** El reto

**Texto en pantalla:**
- El productor necesita plata antes de sembrar.
- El inversionista no ve en qué se gasta.
- Proveedores y jornales cobran tarde.
- [dato + fuente]

**Notas del orador (0:30–1:00):**
"El problema: el productor necesita capital antes de sembrar y hoy lo consigue caro o informal. [dato + fuente: por ejemplo, porcentaje de pequeños productores sin acceso a crédito formal; completar con la cifra real]. Cuando le entregan la plata de una, se gasta antes de tiempo y el inversionista no tiene visibilidad hasta que es tarde. Y los proveedores y jornaleros cobran tarde: el insumo llega tarde, la siembra se atrasa y el riesgo sube para todos."

---

## 4. (Opcional) Frase de impacto

**Título:** (sin título; solo la frase)

**Texto en pantalla:**
- "Con Open Payments, el dinero sigue a la siembra."

**Notas del orador (1:00–1:10):**
Pausa breve. "Esa es la idea de Surco: el pago no se entrega, se gana con avance verificado." Si el tiempo aprieta, saltar esta diapositiva.

---

## 5. La solución

**Título:** Del proyecto a la cosecha en cuatro pasos

**Texto en pantalla:**
1. Publicar solo si el retorno es alcanzable (20.000 escenarios).
2. Captar en custodia, en la moneda de cada inversionista.
3. Pagar por hito, con permiso con tope.
4. Cosechar y liquidar en cascada.

**Notas del orador (1:10–2:10):**
"Surco tiene cinco actores sobre una sola fuente de verdad: productor, inversionista, comprador, fiduciaria y verificador, más los proveedores que cobran.

Uno: el proyecto solo se publica si nuestro motor de simulación Monte Carlo, con 20.000 escenarios, dice que el retorno ofrecido es alcanzable. Si no alcanza, no se publica.

Dos: la plata entra una sola vez a una billetera de custodia. La captación es multimoneda: el quote fija en pesos lo que recibe la custodia y la billetera del inversionista debita en su propia moneda; guardamos la tasa implícita.

Tres: cada hito tiene su propio permiso de pago con tope igual al presupuesto, y lo aprueba la fiduciaria. Los jornales y el fee solo se pagan con dictamen aprobado del verificador.

Cuatro: el comprador paga la cosecha a la custodia y una cascada con prelación devuelve capital y retorno a cada parte.

Sobre Open Payments recorremos el flujo completo en cada pago: incoming payment y quote, grant interactivo GNAP con tope, outgoing payment desde la custodia y comprobante; al cerrar el hito revocamos el permiso. Y el productor no tiene que entender nada de esto: habla con un asistente por chat o voz, que solo crea intenciones y nunca mueve plata sin su 'sí', su PIN y la aprobación del operador."

---

## 6. DEMO EN VIVO

**Título:** Demo en vivo · Interledger testnet

**Texto en pantalla:**
- Un hito, de la solicitud al comprobante.
- Custodia: `$ilp.interledger-test.dev/hans`
- Proveedor: `$ilp.interledger-test.dev/hans-productor`

**Preparación (antes de subir al escenario):**
- Backend y web arriba; abrir `http://localhost:5175`.
- Sesión iniciada en la billetera de Interledger testnet de la custodia en otra pestaña (para no perder tiempo con el login de la billetera).
- Tener un hito listo para fondear y una línea de proveedor pendiente de pago.
- Contraseña de todos los usuarios demo: `Agro-demo-2026`.
- Usuarios: `productor@agro.dev`, `fiduciaria@agro.dev`, `inversionista@agro.dev`, `comprador@agro.dev`, `verificador@agro.dev`.
- Video de respaldo abierto y pausado en otra pestaña: [enlace al video].

**Guion paso a paso (2:10–4:20, ~2 min):**

1. **(0:00–0:15) Contexto.** Iniciar sesión con `fiduciaria@agro.dev`. Decir: "Esta es la pantalla de operación de la fiduciaria. Aquí está el proyecto con su hito y el presupuesto del hito."
2. **(0:15–0:35) Solicitud y autorización.** En el hito, pulsar **Aprobar grant del hito**. Decir: "Surco pide a Open Payments un grant interactivo con tope igual al presupuesto del hito." La app redirige a la billetera de Interledger testnet.
3. **(0:35–0:55) Consentimiento en la billetera.** Mostrar en la billetera de testnet el permiso solicitado y señalar el tope. Decir: "La custodia ve exactamente cuánto se autoriza. Nadie puede gastar más que esto, ni siquiera nosotros." Aprobar el permiso en la billetera.
4. **(0:55–1:10) Regreso a Surco.** La billetera devuelve a Surco. Decir: "Al volver, el backend verificó el hash de interacción GNAP y el hito queda fondeado." Señalar el nuevo estado del hito.
5. **(1:10–1:35) Ejecución del pago.** En la línea del proveedor, ejecutar el pago. Decir: "Creamos el incoming payment en la billetera del proveedor, pedimos el quote y hacemos el outgoing payment desde la custodia." Luego sincronizar el estado del pago.
6. **(1:35–2:00) Comprobante y traza.** Con la línea en estado completado, abrir el comprobante. Decir: "El comprobante muestra montos, tasa y cuánto se ha gastado del permiso. Y cada llamada a Open Payments queda trazada para soporte, con los tokens recortados." Si sobra tiempo, mostrar el pago recibido en la billetera de testnet del proveedor.

Cierre de la demo: "Eso fue un pago real en testnet: de la solicitud al comprobante, con un permiso que no puede gastar de más."

**Plan B:** si la testnet o la red fallan, reproducir el video grabado del mismo flujo ([enlace al video]) y narrarlo con este mismo guion.

---

## 7. Cierre

**Título:** Conclusiones clave

**Texto en pantalla:**
- El dinero sigue a la siembra.
- Un permiso con tope por hito.
- Captación y retorno en la moneda de cada inversionista.
- github.com/hackathon-caribe-first/agro-payments-v0

**Notas del orador (4:20–5:00):**
"Para cerrar: con Open Payments el dinero sigue a la siembra. Un permiso con tope por hito hace que el pago se gane con avance verificado. La captación y el retorno van en la moneda de cada inversionista, y el capital está protegido por la cascada y el seguro. Inclusión: el productor solo habla con un asistente. Innovación: el grant con tope funciona como un contrato que se cumple por hitos. Impacto: inversión directa al campo colombiano. Todo con pagos reales en testnet, de la solicitud al comprobante. El código está en el repositorio. Somos Caribe First, gracias."

---

## Respaldo para preguntas (no va en la plantilla)

- **Arquitectura:** backend hexagonal en NestJS; el dominio no conoce Open Payments, habla con un puerto `PaymentGateway` con un adaptador real contra testnet y uno simulado para pruebas. Web en React Router, PostgreSQL con migraciones, roles con Better Auth y asistente con Claude y herramientas acotadas. 789 pruebas del backend y 62 del front compartido en verde.
- **Seguridad:** tokens y nonces de cada permiso cifrados con AES-256-GCM; rotación del token si vence; nunca se paga dos veces.
- **Permisos por momento del dinero:** captación (lo autoriza el inversionista), hito y prima del seguro (la fiduciaria), cosecha (el comprador, cantidad certificada × precio), liquidación (la fiduciaria, cascada con prelación).
