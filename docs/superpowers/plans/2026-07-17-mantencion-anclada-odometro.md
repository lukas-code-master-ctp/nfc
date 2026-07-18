# Mantención por km anclada al odómetro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando un vehículo no tiene mantención registrada, anclar el criterio de km al odómetro (próximo hito = siguiente múltiplo de la pauta), de modo que un vehículo cerca de un múltiplo (ej. 9.500 km, pauta 10.000) muestre "próxima" en el dashboard sin necesidad de un registro previo.

**Architecture:** Cambio contenido a la función pura `estadoMantencion` (`lib/mantencion/status.ts`). Los consumidores (pill del dashboard, `MantencionPanel` de la ficha, cron) heredan el nuevo comportamiento sin cambios.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Español neutro (Chile).
- **Solo se toca `estadoMantencion` (+ sus tests).** No se cambian `MantencionPanel`, el cron, endpoints ni datos.
- Con una mantención **registrada**, el comportamiento queda **idéntico** (la base sigue siendo `ultima.km`).
- **Sin registro:** el criterio de km ancla al odómetro con base `Math.floor(kmActual / cadaKm) * cadaKm` → nunca marca "vencida" (kmRestantes siempre entre 1 y `cadaKm`).
- El **criterio de tiempo** aplica solo con una mantención registrada (necesita fecha base): guardarlo con `pauta.cadaMeses != null && ultima != null`.

---

### Task 1: Anclar el criterio de km al odómetro sin registro

**Files:**
- Modify: `lib/mantencion/status.ts` (función `estadoMantencion`)
- Test: `lib/mantencion/__tests__/status.test.ts` (bloque `describe('estadoMantencion', ...)`)

**Interfaces:**
- Consumes: `daysUntil`, `pautaVacia`, `addMeses`, `UMBRAL_KM_PROXIMA`, `UMBRAL_DIAS_PROXIMA`, `RANK` (todo ya en el módulo).
- Produces: `estadoMantencion` con el nuevo comportamiento (misma firma `EstadoInput → EstadoResult`).

- [ ] **Step 1: Actualizar los tests (TDD)**

Reemplazar **todo** el bloque `describe('estadoMantencion', () => { ... })` en `lib/mantencion/__tests__/status.test.ts` por:

```typescript
describe('estadoMantencion', () => {
  const now = new Date('2026-07-09T12:00:00Z')

  it('sin pauta', () => {
    expect(estadoMantencion({ pauta: null, ultima: null, kmActual: 100, now }).estado).toBe('sin_pauta')
  })

  // --- Con mantención registrada: se cuenta desde su km (sin cambios) ---
  it('km al día', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 6000, now })
    expect(r.estado).toBe('al_dia')
    expect(r.detalle.kmRestantes).toBe(9000)
  })
  it('km próxima (dentro de 1000)', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 14500, now })
    expect(r.estado).toBe('proxima')
    expect(r.detalle.kmRestantes).toBe(500)
  })
  it('km vencida', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 16000, now })
    expect(r.estado).toBe('vencida')
  })
  it('tiempo vencida', () => {
    const r = estadoMantencion({ pauta: { cadaMeses: 6 }, ultima: { km: null, fecha: '2026-01-01' }, kmActual: null, now })
    expect(r.estado).toBe('vencida') // próxima era 2026-07-01, ya pasó
  })
  it('lo que ocurra primero: gana el peor criterio', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000, cadaMeses: 6 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: 6000, now })
    expect(r.estado).toBe('vencida')
  })
  it('km no computable por kmActual null cae a tiempo', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000, cadaMeses: 60 }, ultima: { km: 5000, fecha: '2026-06-01' }, kmActual: null, now })
    expect(r.estado).toBe('al_dia')
  })
  it('solo km, sin kmActual, con registro → sin_registro (no computable)', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: { km: 5000, fecha: '2026-01-01' }, kmActual: null, now })
    expect(r.estado).toBe('sin_registro')
  })

  // --- Sin registro: el criterio de km se ancla al odómetro ---
  it('sin registro, km ancla al odómetro: primer hito en el primer múltiplo', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: null, kmActual: 9500, now })
    expect(r.estado).toBe('proxima')
    expect(r.detalle.proximaKm).toBe(10000)
    expect(r.detalle.kmRestantes).toBe(500)
  })
  it('sin registro, km a mitad de intervalo → al día', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: null, kmActual: 3000, now })
    expect(r.estado).toBe('al_dia')
    expect(r.detalle.proximaKm).toBe(10000)
    expect(r.detalle.kmRestantes).toBe(7000)
  })
  it('sin registro, km pasado un múltiplo apunta al siguiente (nunca vencida)', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: null, kmActual: 12000, now })
    expect(r.estado).toBe('al_dia')
    expect(r.detalle.proximaKm).toBe(20000)
    expect(r.detalle.kmRestantes).toBe(8000)
  })
  it('sin registro, pauta km+meses: solo cuenta el km (el tiempo no participa sin fecha base)', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000, cadaMeses: 6 }, ultima: null, kmActual: 9500, now })
    expect(r.estado).toBe('proxima')
    expect(r.detalle.proximaFecha).toBeUndefined()
  })
  it('sin registro, solo tiempo → sin_registro (no hay fecha base)', () => {
    const r = estadoMantencion({ pauta: { cadaMeses: 6 }, ultima: null, kmActual: 100, now })
    expect(r.estado).toBe('sin_registro')
  })
  it('sin registro, km sin kmActual → sin_registro (no computable)', () => {
    const r = estadoMantencion({ pauta: { cadaKm: 10000 }, ultima: null, kmActual: null, now })
    expect(r.estado).toBe('sin_registro')
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run lib/mantencion/__tests__/status.test.ts`
Expected: FAIL — los nuevos casos "sin registro" que ahora deben computar (`proxima`/`al_dia`) todavía dan `sin_registro` con la implementación vieja.

- [ ] **Step 3: Modificar `estadoMantencion`**

En `lib/mantencion/status.ts`, reemplazar la función `estadoMantencion` completa por:

```typescript
export function estadoMantencion(input: EstadoInput): EstadoResult {
  const { pauta, ultima, kmActual, now } = input
  if (pautaVacia(pauta)) return { estado: 'sin_pauta', detalle: {} }

  const detalle: EstadoResult['detalle'] = {}
  const criterios: ('al_dia' | 'proxima' | 'vencida')[] = []

  // Criterio por km. Con una mantención registrada se cuenta desde su km; sin
  // registro se ancla al odómetro (el múltiplo de la pauta inmediatamente
  // inferior al km actual), así el primer hito cae en el primer múltiplo
  // (ej. 10.000) y nunca marca "vencida" sin datos.
  if (pauta!.cadaKm != null && kmActual != null) {
    const baseKm = ultima?.km != null ? ultima.km : Math.floor(kmActual / pauta!.cadaKm) * pauta!.cadaKm
    const proximaKm = baseKm + pauta!.cadaKm
    const kmRestantes = proximaKm - kmActual
    detalle.proximaKm = proximaKm
    detalle.kmRestantes = kmRestantes
    criterios.push(kmRestantes <= 0 ? 'vencida' : kmRestantes <= UMBRAL_KM_PROXIMA ? 'proxima' : 'al_dia')
  }

  // Criterio por tiempo: necesita una fecha de referencia, así que solo aplica
  // con una mantención registrada.
  if (pauta!.cadaMeses != null && ultima != null) {
    const proximaFecha = addMeses(ultima.fecha, pauta!.cadaMeses)
    const dias = daysUntil(proximaFecha, now)
    detalle.proximaFecha = proximaFecha
    if (dias != null) {
      detalle.diasRestantes = dias
      criterios.push(dias < 0 ? 'vencida' : dias <= UMBRAL_DIAS_PROXIMA ? 'proxima' : 'al_dia')
    }
  }

  if (criterios.length === 0) return { estado: 'sin_registro', detalle }
  const estado = criterios.reduce<'al_dia' | 'proxima' | 'vencida'>(
    (worst, c) => (RANK[c] > RANK[worst] ? c : worst),
    'al_dia',
  )
  return { estado, detalle }
}
```

(El único cambio funcional: se elimina el `if (!ultima) return sin_registro` temprano; el criterio de km deriva `baseKm` del odómetro cuando no hay `ultima.km`; y el criterio de tiempo se guarda con `&& ultima != null`.)

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/mantencion/__tests__/status.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Typecheck, lint y build**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx eslint app components lib`
Expected: sin errores (3 warnings preexistentes de `set-state-in-effect` ajenos permitidos).

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 6: Commit**

```bash
git add lib/mantencion/status.ts lib/mantencion/__tests__/status.test.ts
git commit -m "feat(mantencion): anclar el criterio de km al odómetro cuando no hay registro"
```

---

## Notas de verificación final

Antes del merge: `npx tsc --noEmit`, `npx eslint app components lib`, `npm run build`, `npx vitest run` (incluye `status.test.ts`; `rules.test.ts` requiere emulador y se salta en local). Recordar que merge a `master` **auto-despliega a producción**.
