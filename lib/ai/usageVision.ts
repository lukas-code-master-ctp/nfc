export type BencinaNivel = 'Lleno' | '3/4' | '1/2' | '1/4' | 'Reserva'
export type Limpieza = 'limpio' | 'aceptable' | 'sucio'

export interface UsageVision {
  bencina: string | null
  km: number | null
  limpieza: Limpieza | null
}

const NIVELES: string[] = ['Lleno', '3/4', '1/2', '1/4', 'Reserva']
const LIMPIEZAS: string[] = ['limpio', 'aceptable', 'sucio']

export function buildUsagePrompt(): string {
  return [
    'Analiza dos fotos de un vehículo.',
    'Foto 1 (tablero): lee el nivel de bencina y el kilometraje (odómetro).',
    'Foto 2 (cabina): evalúa la limpieza general del interior.',
    'Responde SOLO con un JSON válido, sin texto adicional, con este formato exacto:',
    '{"bencina": "<uno de: Lleno, 3/4, 1/2, 1/4, Reserva, o null>", "km": <entero o null>, "limpieza": "<uno de: limpio, aceptable, sucio, o null>"}',
    'Si no puedes leer un dato con seguridad, usa null en ese campo. No inventes.',
  ].join('\n')
}

export function parseUsageVision(raw: string): UsageVision {
  const vacio: UsageVision = { bencina: null, km: null, limpieza: null }
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return vacio
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(match[0])
  } catch {
    return vacio
  }
  const bencina = typeof obj.bencina === 'string' && NIVELES.includes(obj.bencina) ? obj.bencina : null
  const km = typeof obj.km === 'number' && Number.isInteger(obj.km) && obj.km >= 0 ? obj.km : null
  const limpieza = typeof obj.limpieza === 'string' && LIMPIEZAS.includes(obj.limpieza) ? (obj.limpieza as Limpieza) : null
  return { bencina, km, limpieza }
}

export async function analyzeUsagePhotos(
  chat: (images: string[], prompt: string) => Promise<string>,
  fotos: { tableroUrl: string; cabinaUrl: string },
): Promise<UsageVision> {
  const raw = await chat([fotos.tableroUrl, fotos.cabinaUrl], buildUsagePrompt())
  return parseUsageVision(raw)
}
