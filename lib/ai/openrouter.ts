// Cliente de OpenRouter (API compatible con OpenAI). Sin estado; lee el env en
// cada llamada. Wrapper de red (sin test unitario), igual que el cliente Resend.
const BASE = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001'

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
  if (!res.ok) throw new Error(`openrouter_${res.status}`)
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}
