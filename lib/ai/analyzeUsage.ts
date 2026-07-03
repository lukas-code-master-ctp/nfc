import { getUsage, setUsageAnalysis } from '@/lib/data/usages'
import { createReadUrl } from '@/lib/storage/signedUrls'
import { chatVision, isOpenRouterConfigured } from '@/lib/ai/openrouter'
import { analyzeUsagePhotos } from '@/lib/ai/usageVision'

// Best-effort: analiza las fotos de un uso ya cerrado y rellena bencina/km/limpieza.
// Nunca lanza; si algo falla, el uso queda sin lectura (la foto sigue siendo la evidencia).
export async function analyzeUsage(usageId: string): Promise<void> {
  try {
    if (!isOpenRouterConfigured()) return
    const u = await getUsage(usageId)
    if (!u || u.iaAnalizadoEn) return
    if (!u.fotos?.tablero || !u.fotos?.cabina) return
    const [tableroUrl, cabinaUrl] = await Promise.all([
      createReadUrl(u.fotos.tablero),
      createReadUrl(u.fotos.cabina),
    ])
    const datos = await analyzeUsagePhotos(chatVision, { tableroUrl, cabinaUrl })
    await setUsageAnalysis(usageId, datos)
  } catch (err) {
    console.error('[analyzeUsage]', usageId, err)
  }
}
