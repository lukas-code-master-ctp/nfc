# Grabar el chip NFC desde la web app

**Fecha:** 2026-07-27
**Estado:** diseño aprobado

## Problema

Hoy, para dejar un vehículo operativo hay que salir de TapCar: el panel «Enlace NFC»
entrega la URL y unas instrucciones para grabarla con **NFC Tools**, una app de
terceros. Son dos aplicaciones y un copiar-pegar para completar el alta de cada
vehículo.

> Como administrador de flota, quiero registrar los chips directamente desde la
> aplicación web, para agilizar la gestión de vehículos sin depender de
> herramientas externas.

## Restricción que define el alcance

La API del navegador es **Web NFC** (`NDEFReader`), y su soporte es:

- **Android**: Chrome 89+, Samsung Internet 15+, Opera Mobile 64+. Funciona completo.
- **iOS**: no existe, en ningún navegador. Chrome/Firefox en iPhone corren sobre
  WebKit, así que heredan la ausencia. Apple solo expone NFC a apps nativas
  (Core NFC).
- **Escritorio**: no existe, ni con un lector USB conectado.

Requiere además HTTPS (ya lo tenemos) y que la escritura se dispare desde un
gesto del usuario.

**Consecuencia:** en Android reemplazamos NFC Tools por completo; en iPhone las
instrucciones actuales se quedan como única vía. No se descarta el sprint porque
el grabado hoy se hace desde Android/Chrome.

## Alcance

**Dentro:**

- Grabar la URL pública del vehículo en un chip, desde la ficha → pestaña
  **Ajustes**, dentro del panel «Enlace NFC» que ya existe.
- Confirmación antes de sobrescribir un chip que ya traía información.

**Fuera (decidido explícitamente):**

- Verificar/leer un chip existente para saber a qué vehículo apunta.
- Bloquear el chip como solo-lectura (`makeReadOnly()`).
- Grabado en serie de varios vehículos.
- Grabar desde el modal de alta de vehículo.
- Cualquier camino para iPhone (app nativa / PWA con Core NFC).

## Arquitectura

Sin cambios de servidor: no hay endpoints nuevos, ni campos en Firestore, ni
tipos de dominio nuevos. Escribir un chip no muta nada — solo copia al chip una
URL que ya está en pantalla. Todo ocurre en el navegador del administrador.

| Archivo | Rol |
|---|---|
| `lib/nfc/escritura.ts` | Lógica pura, sin DOM ni React. `mensajeErrorNfc(err)` y `esChipConDatos(err)`. Es lo único con tests. |
| `components/nfc/GrabarChip.tsx` | Client component: botón + hoja de grabado. Prop `url` (y `patente` para el estado de éxito). |
| `components/NfcTokenPanel.tsx` | Solo monta `GrabarChip`. El `InfoTip` de NFC Tools se mantiene intacto: es la vía de iPhone. |
| `types/web-nfc.d.ts` | Declaración mínima de `NDEFReader` (~20 líneas). TypeScript no la trae en `lib.dom.d.ts`. Se prefiere sobre agregar `@types/w3c-web-nfc` por tres métodos. |

La detección de soporte (`'NDEFReader' in window`) va en un `useEffect`, nunca en
el render, para no romper la hidratación del SSR. Sin soporte, el botón no se
renderiza y el panel queda exactamente como hoy.

## Flujo y estados

Máquina de cinco estados dentro de `GrabarChip`:

- **`idle`** — botón «Grabar chip» en el panel.
- **`esperando`** — hoja a pantalla completa: ondas animadas, «Acerca el chip a
  la parte de arriba del teléfono» y **Cancelar**. La llamada a `write()` se
  lanza dentro del `onClick` (Chrome exige gesto del usuario) y queda pendiente
  hasta que aparezca un chip → se controla con `AbortController` para el
  Cancelar, más un corte automático a los **60 s**.
- **`confirmar`** — el chip traía datos: «Este chip ya tiene información grabada.
  Si pertenece a otro vehículo, ese vehículo se quedará sin chip.» →
  [Sobrescribir] [Cancelar]. El click en Sobrescribir sirve de gesto nuevo para
  reintentar con `overwrite: true`.
- **`ok`** — check verde grande, «Chip grabado» y la patente del vehículo debajo,
  para confirmar que se grabó el correcto. Cierra con [Listo].
- **`error`** — mensaje de `mensajeErrorNfc()` + [Reintentar] [Cerrar].

### Qué se escribe

Un único record de tipo **`url`** con la URL completa
(`https://app.tapcar.cl/v/<token>`). Es el mismo tipo que recomienda hoy el
`InfoTip` y es lo que hace que un iPhone abra el enlace al acercarlo (con un
record `text` no lo haría). Pesa ~50 bytes: entra en cualquier NTAG213 (144 B).

### Protección de sobrescritura

Primer intento siempre con `overwrite: false`. Si el chip no estaba vacío, la
escritura falla y pasamos a `confirmar` en vez de pisarlo.

**Cuidado:** el spec de Web NFC usa `NotAllowedError` para dos casos distintos —
permiso denegado y «`overwrite: false` sobre un chip con datos»— así que el
`name` de la excepción no alcanza para distinguirlos. En el `catch` se consulta
`navigator.permissions.query({ name: 'nfc' })`: si el permiso está en `granted`,
el `NotAllowedError` solo pudo venir del chip con datos. Si la consulta de
permisos falla o no existe, se asume permiso denegado (falla hacia el mensaje
más seguro, sin sobrescribir nada). Sin esto, regrabar un
chip ya asignado dejaría al otro vehículo con un chip muerto y nadie se enteraría
hasta que un fiscalizador lo escaneara. NFC Tools no hace esta pregunta.

## Manejo de errores

`mensajeErrorNfc()` mapea el `name` de la excepción:

| `name` | Mensaje |
|---|---|
| `NotAllowedError` | «Falta el permiso de NFC. Tócalo en el candado de la barra de direcciones y vuelve a intentar.» |
| `NotReadableError` | «El NFC del teléfono está apagado. Actívalo en los ajustes y reintenta.» |
| `NotSupportedError` | «Este chip no se puede grabar: puede estar bloqueado, lleno o ser incompatible.» |
| `NetworkError` | «Se soltó el chip antes de terminar. Mantenlo apoyado hasta que aparezca el check.» |
| `AbortError` | No es error. Cancelar → vuelve a `idle` en silencio. El corte a los 60 s sí avisa: «No detectamos ningún chip.» Ambos abortan con el mismo `AbortController`, así que el motivo se distingue con una variable propia del componente (`motivoAborto: 'cancelado' \| 'timeout'`), no por el `name` de la excepción. |
| cualquier otro | Mensaje genérico + `console.error` con el error crudo. |

Cada rama es explícita y todo lo desconocido cae al genérico: **no se enmascara
un error desconocido como uno específico** (mismo error que produjo el `409`
falso de la entrega con daño, ver Gotchas de CLAUDE.md).

El caso «chip con datos» no es un error sino el estado `confirmar`: reutilizar un
chip es legítimo.

## Pruebas

**Automatizadas (Vitest)** — `lib/nfc/escritura.ts`:

- un caso por cada `name` mapeado,
- el fallback genérico,
- `esChipConDatos` distinguiendo el fallo de `overwrite: false` del resto.

**Sin E2E.** Playwright no emula NFC y el hardware no existe en CI. Un test que
"verifique" el grabado sería teatro.

**Verificación manual** (Android + Chrome + chip real, antes de dar por cerrado):

1. Grabar un chip virgen → acercar el chip al teléfono → abre la ficha pública
   correcta.
2. Grabar un chip ya escrito → aparece la confirmación → Sobrescribir → queda con
   la URL nueva.
3. Cancelar a mitad de la espera → vuelve al panel sin error.
4. Con el NFC del teléfono apagado → mensaje de NFC apagado.
5. Denegar el permiso del navegador → mensaje de permiso.
6. Abrir la ficha en iPhone → el panel se ve igual que hoy, sin botón, con el
   `InfoTip` de NFC Tools.

## Riesgos

- **Fragmentación de dispositivos**: la calidad de la antena NFC y su ubicación
  varían por modelo. El mensaje de la hoja dice explícitamente «la parte de
  arriba del teléfono» porque es donde está en la mayoría de los Android.
- **El usuario cambia de teléfono a uno iPhone** y el botón desaparece sin
  explicación. Mitigado: el `InfoTip` con las instrucciones sigue visible siempre.
