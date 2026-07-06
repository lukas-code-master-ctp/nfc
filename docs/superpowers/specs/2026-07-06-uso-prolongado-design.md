# Aviso de uso prolongado en /flota (brecha 2)

**Fecha:** 2026-07-06
**Estado:** Aprobado, listo para plan de implementación

## Problema

En la bitácora de uso, un conductor puede tomar un vehículo (`tomar`) y no cerrar
nunca su uso (`entregar`). Si **nadie más toma el vehículo después**, el uso queda
`abierto` indefinidamente: ni el force-close (que dispara cuando otro conductor toma)
ni la detección de entrega irregular (que dispara cuando otro entrega) lo detectan,
porque ambos requieren una acción posterior de otra persona.

Este es el "uso abandonado que nadie retoma". Hoy queda invisible: el vehículo figura
"En uso por X" en `/flota` sin ninguna señal de que lleva demasiado tiempo así.

## Objetivo

Mostrar un **aviso visual** en `/flota` cuando un vehículo lleva más de N horas en uso
sin entregarse, con **N configurable por empresa**.

## Decisiones tomadas

- **Solo señal visual** en `/flota`. NO se crea alerta en `alertas/{id}`, NO se envía
  email, NO se auto-cierra el uso, NO se agrega un cron. (El usuario eligió la opción
  más liviana entre auto-cerrar / solo-alertar / solo-visual.)
- **Umbral configurable por empresa** (`avisoUsoHoras`), con un default global cuando la
  empresa no lo configuró.

## Fuera de alcance

- Cron / job programado.
- Alertas en la colección `alertas/{id}` y su bandeja.
- Email de aviso.
- Auto-cierre del uso por tiempo.

## Diseño

### Parte 1 — Ajuste por empresa

**Dato.** Nuevo campo opcional `avisoUsoHoras?: number` en el doc
`companies/{companyId}` (a nivel raíz, junto a `company`/`plan`/`ownerUid`). Cuando no
está seteado, se usa la constante `DEFAULT_AVISO_USO_HORAS = 12` (en `lib/types.ts`).

- `lib/types.ts`: agregar `avisoUsoHoras?: number` a la interfaz `Company` y exportar
  `DEFAULT_AVISO_USO_HORAS = 12`.
- `lib/data/companies.ts`: `getCompany` debe leer `avisoUsoHoras` del doc (si existe);
  `saveCompany` debe poder persistirlo. `saveCompany` ya acepta un `Partial`, así que
  se le pasa `{ avisoUsoHoras }` cuando corresponde (sin escribir `undefined` —
  Firestore lo rechaza; omitir la clave si no viene).

**Configuración (UI).** Lo edita el **Administrador** de la empresa
(`can(role, 'billing:manage')`) en Configuración, dentro de `CompanyCard`
(`components/company/CompanyCard.tsx`). Un campo numérico:
"Avisar cuando un vehículo lleve más de **[N]** horas en uso sin entregar".
Los roles no-Administrador ven el valor en solo lectura (igual que hoy con los datos de
empresa) o no lo ven — se sigue el patrón existente de `CompanyCard`.

**Endpoint.** Se extiende el `PATCH /api/company` existente
(`app/api/company/route.ts`, ya protegido por `getMembership` + `can(role,
'billing:manage')`) para aceptar un `avisoUsoHoras` opcional en el body además de
`company`. Validación: parsear a entero, **mínimo 1** (si viene inválido o < 1, se usa
el default o se rechaza con 400 — ver Ambigüedad resuelta). Se persiste vía
`saveCompany`.

### Parte 2 — Aviso en el panel

**Lógica pura** (sin Firebase, testeable) en `lib/usages/prolongado.ts`:

```ts
export function horasEnUso(tomadoEn: string, now: Date): number
// (now - tomadoEn) en horas, como número (puede ser fraccional).

export function usoProlongado(tomadoEn: string, avisoUsoHoras: number, now: Date): boolean
// true si horasEnUso(tomadoEn, now) >= avisoUsoHoras.
```

**Página `/flota`** (`app/(app)/flota/page.tsx`). Además de `listVehicles` y
`listAlertas`, carga la empresa con `getCompany(m.companyId)` para leer
`avisoUsoHoras ?? DEFAULT_AVISO_USO_HORAS`. Para cada vehículo con `usoActual`, calcula
con `now = new Date()` (la página es `dynamic`) si el uso es prolongado y cuántas horas
lleva (redondeadas hacia abajo para mostrar). Pasa a `FlotaGrid`, por vehículo:
`usoProlongado: boolean` y `horasEnUso: number` (o los datos crudos para que el grid
calcule — decisión de implementación; la lógica vive en el helper puro en ambos casos).

**`FlotaGrid`** (`components/flota/FlotaGrid.tsx`). En la card de un vehículo cuyo uso
es prolongado, muestra un badge ámbar reutilizando los mismos tokens del badge "Sin
entrega" actual (`bg-[#FDF1DC]` / `text-[#B45309]`): texto **"Sin entregar hace Xh"**.
No es una alerta de la bandeja `AlertasBandeja`; es solo señal en la card. La línea "En
uso por … · desde …" se mantiene.

**"Ahora" server-side.** El cálculo usa la hora del render del server component; el
badge se actualiza al recargar `/flota`, consistente con cómo ya se comporta el panel
(estado en vivo vía `vehicles.usoActual`, refetch en cada carga).

## Testing

- **Unit** (`lib/usages/prolongado.ts`): `horasEnUso` y `usoProlongado` con casos bajo
  el umbral, justo en el umbral (límite inclusivo `>=`), y sobre el umbral; verificar
  que `usoProlongado` usa el `avisoUsoHoras` recibido.
- Config (CompanyCard + PATCH) y display (FlotaGrid): cubiertos por `npx tsc --noEmit`
  y `npm run build`. Si el endpoint `PATCH /api/company` tiene test, extenderlo para el
  nuevo campo.

## Ambigüedad resuelta

- **Valor inválido en el PATCH** (`avisoUsoHoras` no numérico, ≤ 0, o ausente): el
  endpoint lo trata como "no cambiar / usar default". Concretamente: si viene un número
  entero ≥ 1, se guarda; si viene ausente, no se toca; si viene inválido (< 1 o no
  numérico), se responde 400 `avisoUsoHoras inválido`. Nunca se persiste un valor < 1
  ni `undefined`.
- **Límite inclusivo:** un uso con exactamente `avisoUsoHoras` horas SÍ cuenta como
  prolongado (`>=`).

## Criterios de aceptación

1. Una empresa sin `avisoUsoHoras` usa 12 horas por default.
2. El Administrador puede cambiar el umbral en Configuración; se persiste y se aplica.
3. Un vehículo en uso desde hace más del umbral muestra el badge "Sin entregar hace Xh"
   en `/flota`; uno por debajo del umbral no.
4. Un vehículo Disponible (sin `usoActual`) nunca muestra el badge.
5. No se crea ninguna alerta, email ni cron; el uso permanece `abierto`.
