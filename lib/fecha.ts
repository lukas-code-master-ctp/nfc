/**
 * El único lugar del proyecto que sabe cómo se ve una fecha.
 *
 * `es-CL` NO produce `dd/mm/aaaa`: con `dateStyle:'short'` da `01-09-26`
 * (guiones y año de dos dígitos) y sin opciones da `01-09-2026`. Se usa
 * `en-GB`, que garantiza `dd/mm/yyyy`, con el mismo criterio con que
 * `hoyEnChile` usa `en-CA` para obtener `YYYY-MM-DD`: el locale se elige por
 * el formato que garantiza, no por el país al que pertenece.
 */

const ZONA = 'America/Santiago'

// A nivel de módulo: construir un Intl.DateTimeFormat es caro y estos no
// dependen de nada. Son datos puros, así que no rompen el SSR.
const FMT_FECHA = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

// `hourCycle: 'h23'` y NO `hour12: false`: este último produce '24:00' en
// algunas versiones de ICU, un bug que aparecería solo a medianoche.
const FMT_HORA = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `'2026-09-01'` → `'01/09/2026'`.
 *
 * **No usa `Date` a propósito.** `new Date('2026-09-01')` es medianoche UTC,
 * y como Chile va detrás de UTC, formatear eso en zona chilena muestra el día
 * ANTERIOR. Reordenando los tres números, ese bug no puede existir — y de
 * paso desaparece la necesidad de armar la fecha por componentes, que es lo
 * que hoy hacen `/facturacion` y `FranjaPrueba` para esquivarlo.
 */
export function fechaCalendario(iso: string | null | undefined): string {
  const m = CALENDARIO.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** `null` si la entrada no es un instante que se pueda formatear. */
function instante(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Instante ISO → `'01/09/2026'` en hora de Chile. */
export function fecha(iso: string | null | undefined): string {
  const d = instante(iso)
  return d ? FMT_FECHA.format(d) : ''
}

/** Instante ISO → `'01/09/2026 11:30'`, en 24 horas y hora de Chile. */
export function fechaHora(iso: string | null | undefined): string {
  const d = instante(iso)
  return d ? `${FMT_FECHA.format(d)} ${FMT_HORA.format(d)}` : ''
}
