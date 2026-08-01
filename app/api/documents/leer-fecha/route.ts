import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { chatVision, isOpenRouterConfigured } from '@/lib/ai/openrouter'
import { buildFechaPrompt, parseFechaVision } from '@/lib/ai/documentoVision'

export const dynamic = 'force-dynamic'
// Una llamada de visión puede tardar bastante más que una respuesta normal.
export const maxDuration = 30

const PREFIJO_DATA_URI = 'data:image/'

/**
 * Lee la fecha de vencimiento de la imagen de un documento.
 *
 * Best-effort de punta a punta: cualquier fallo devuelve `{ fecha: null }` y el
 * formulario sigue funcionando como antes (el usuario escribe la fecha a mano).
 * El usuario nunca ve un error por esto; el log del servidor es donde sirve.
 */
export async function POST(req: NextRequest) {
  // Exige membresía porque cada llamada cuesta plata: no puede quedar abierto.
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { imagen } = await req.json()
  // Data URI completo, no base64 suelto: `chatVision` lo pasa tal cual como
  // `image_url.url`, y ahí OpenRouter necesita el prefijo para saber qué recibe.
  if (typeof imagen !== 'string' || !imagen.startsWith(PREFIJO_DATA_URI)) {
    return NextResponse.json({ error: 'imagen inválida' }, { status: 400 })
  }

  // Sin la clave, el feature simplemente no corre. Permite desplegar antes de
  // configurarla, igual que `analyzeUsage`.
  if (!isOpenRouterConfigured()) return NextResponse.json({ fecha: null })

  try {
    const raw = await chatVision([imagen], buildFechaPrompt())
    return NextResponse.json({ fecha: parseFechaVision(raw, Date.now()) })
  } catch (err) {
    // Ej. `openrouter_404` cuando el slug del modelo se deprecó — ya pasó una vez.
    console.error('[leer-fecha]', err)
    return NextResponse.json({ fecha: null })
  }
}
