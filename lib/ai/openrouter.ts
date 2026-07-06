// Cliente de OpenRouter (API compatible con OpenAI). Sin estado; lee el env en
// cada llamada. Wrapper de red (sin test unitario), igual que el cliente Resend.
const BASE = 'https://openrouter.ai/api/v1'
// Modelo multimodal (lee imágenes) vigente en OpenRouter. OJO: los slugs se
// deprecan (el viejo `google/gemini-2.0-flash-001` empezó a dar 404). Si vuelve a
// fallar con `openrouter_404`, revisar el slug en https://openrouter.ai/models.
const DEFAULT_MODEL = 'google/gemini-2.5-flash'

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

export async function chatVision(imageUrls: string[], prompt: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('openrouter_no_key')
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL
  const content = [
    { type: 'text', text: prompt },
    ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
  ]
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }] }),
  })
  if (!res.ok) {
    // Incluir el cuerpo del error de OpenRouter en el mensaje para que el log de
    // `analyzeUsage` diga la causa real (ej. modelo inválido) sin tener que adivinar.
    const detalle = await res.text().catch(() => '')
    throw new Error(`openrouter_${res.status}${detalle ? `: ${detalle.slice(0, 300)}` : ''}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}
