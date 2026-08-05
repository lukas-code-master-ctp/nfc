/**
 * Lectura de la fecha de vencimiento de un documento vehicular chileno.
 * Puro: sin red y sin reloj, para poder testearlo. Mismo patrón que
 * `usageVision.ts` (prompt + parseo separados de la llamada).
 */

/** Ventana de cordura alrededor del presente, en años. */
const RANGO_ANIOS = 20
const MS_POR_ANIO = 365.25 * 24 * 60 * 60 * 1000

export function buildFechaPrompt(): string {
  return [
    'Estás leyendo la foto de un documento vehicular chileno (permiso de circulación, revisión técnica, SOAP, certificado de homologación o similar).',
    'Busca la fecha HASTA LA CUAL el documento es válido. Suele aparecer como "válido hasta", "vence el", "hasta el" o "fecha de vencimiento".',
    'NO devuelvas la fecha de emisión, ni la de pago, ni la del trámite.',
    'OJO con el formato: en Chile las fechas se escriben DD-MM-AAAA. Por ejemplo "03-04-2027" es el 3 de abril de 2027, NO el 4 de marzo.',
    'Si la fecha viene SIN día, solo mes y año (por ejemplo "ENE/2027" en un certificado de homologación), usa el ÚLTIMO día de ese mes: el documento vale hasta que el mes termina. "ENE/2027" es 2027-01-31.',
    'Responde SOLO con un JSON válido, sin texto adicional, con uno de estos dos formatos exactos:',
    '{"vence": "2027-04-03"} si puedes leer la fecha (formato AAAA-MM-DD, sin comillas alrededor de null).',
    '{"vence": null} si no puedes leerla con seguridad. No inventes.',
  ].join('\n')
}

/** Último día del mes, en dos dígitos. El día 0 del mes siguiente es el último
 *  del actual, así que no hay que saberse los meses de 30 y 31 ni los bisiestos. */
function ultimoDiaDelMes(anio: number, mes: number): string {
  return String(new Date(Date.UTC(anio, mes, 0)).getUTCDate()).padStart(2, '0')
}

/**
 * La fecha leída, o `null`. **Estricta a propósito.**
 *
 * Una `fechaVencimiento` mal formada hace que `daysUntil` devuelva `NaN`,
 * `documentStatus` caiga a `al_dia`, y un documento **vencido** se pinte verde.
 * Preferimos no leer nada a rellenar basura: el campo vacío el usuario lo llena;
 * el campo con una fecha absurda quizás no lo mira.
 *
 * `ahoraMs` entra por parámetro y no se lee del reloj: si no, el rango de
 * cordura no se podría testear.
 */
export function parseFechaVision(raw: string, ahoraMs: number): string | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(match[0])
  } catch {
    return null
  }

  const vence = obj.vence
  if (typeof vence !== 'string') return null

  // Una fecha sin día ("ENE/2027" en un certificado de homologación) se completa
  // al ÚLTIMO día del mes: el documento vale hasta que el mes termina, así que
  // tomar el día 1 adelantaría el vencimiento —y el recordatorio— un mes entero.
  // La regla va acá y no solo en el prompt: el prompt es un pedido, esto es la
  // garantía de que se cumpla aunque el modelo responda `AAAA-MM`.
  const soloMes = vence.match(/^(\d{4})-(\d{2})$/)
  const fecha = soloMes
    ? `${soloMes[1]}-${soloMes[2]}-${ultimoDiaDelMes(Number(soloMes[1]), Number(soloMes[2]))}`
    : vence

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null

  const ms = Date.parse(`${fecha}T00:00:00.000Z`)
  if (Number.isNaN(ms)) return null
  // Ida y vuelta: el regex deja pasar 2027-02-31, que tiene la forma correcta
  // pero no existe. No se confía en que todos los motores rechacen el parseo.
  // Cubre también un mes inválido colado por la rama de arriba (2027-13).
  if (new Date(ms).toISOString().slice(0, 10) !== fecha) return null

  if (Math.abs(ms - ahoraMs) > RANGO_ANIOS * MS_POR_ANIO) return null
  return fecha
}
