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
    'Estás leyendo la foto de un documento vehicular chileno (permiso de circulación, revisión técnica, SOAP, certificado de gases o similar).',
    'Busca la fecha HASTA LA CUAL el documento es válido. Suele aparecer como "válido hasta", "vence el", "hasta el" o "fecha de vencimiento".',
    'NO devuelvas la fecha de emisión, ni la de pago, ni la del trámite.',
    'OJO con el formato: en Chile las fechas se escriben DD-MM-AAAA. Por ejemplo "03-04-2027" es el 3 de abril de 2027, NO el 4 de marzo.',
    'Responde SOLO con un JSON válido, sin texto adicional, con este formato exacto:',
    '{"vence": "<AAAA-MM-DD, o null>"}',
    'Convierte la fecha al formato AAAA-MM-DD. Si no puedes leerla con seguridad, usa null. No inventes.',
  ].join('\n')
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vence)) return null

  const ms = Date.parse(`${vence}T00:00:00.000Z`)
  if (Number.isNaN(ms)) return null
  // Ida y vuelta: el regex deja pasar 2027-02-31, que tiene la forma correcta
  // pero no existe. No se confía en que todos los motores rechacen el parseo.
  if (new Date(ms).toISOString().slice(0, 10) !== vence) return null

  if (Math.abs(ms - ahoraMs) > RANGO_ANIOS * MS_POR_ANIO) return null
  return vence
}
