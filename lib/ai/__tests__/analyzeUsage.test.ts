import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUsage = vi.fn()
const setUsageAnalysis = vi.fn()
vi.mock('@/lib/data/usages', () => ({
  getUsage: (...a: unknown[]) => getUsage(...a),
  setUsageAnalysis: (...a: unknown[]) => setUsageAnalysis(...a),
}))
vi.mock('@/lib/storage/signedUrls', () => ({ createReadUrl: (p: string) => Promise.resolve(`url:${p}`) }))
const isConfigured = vi.fn()
const chatVision = vi.fn()
vi.mock('@/lib/ai/openrouter', () => ({
  isOpenRouterConfigured: () => isConfigured(),
  chatVision: (...a: unknown[]) => chatVision(...a),
}))

import { analyzeUsage } from '@/lib/ai/analyzeUsage'

beforeEach(() => {
  getUsage.mockReset(); setUsageAnalysis.mockReset(); isConfigured.mockReset(); chatVision.mockReset()
  isConfigured.mockReturnValue(true)
})

describe('analyzeUsage', () => {
  it('no hace nada si OpenRouter no está configurado', async () => {
    isConfigured.mockReturnValue(false)
    await analyzeUsage('u1')
    expect(getUsage).not.toHaveBeenCalled()
  })
  it('no hace nada si ya fue analizado', async () => {
    getUsage.mockResolvedValue({ id: 'u1', fotos: { tablero: 't', cabina: 'c' }, iaAnalizadoEn: 'ayer' })
    await analyzeUsage('u1')
    expect(chatVision).not.toHaveBeenCalled()
    expect(setUsageAnalysis).not.toHaveBeenCalled()
  })
  it('no hace nada si faltan fotos', async () => {
    getUsage.mockResolvedValue({ id: 'u1', fotos: { tablero: 't' } })
    await analyzeUsage('u1')
    expect(chatVision).not.toHaveBeenCalled()
  })
  it('analiza y guarda cuando corresponde', async () => {
    getUsage.mockResolvedValue({ id: 'u1', fotos: { tablero: 't', cabina: 'c' } })
    chatVision.mockResolvedValue('{"bencina":"1/2","km":50,"limpieza":"aceptable"}')
    await analyzeUsage('u1')
    expect(chatVision).toHaveBeenCalledWith(['url:t', 'url:c'], expect.any(String))
    expect(setUsageAnalysis).toHaveBeenCalledWith('u1', { bencina: '1/2', km: 50, limpieza: 'aceptable' })
  })
  it('no lanza si algo falla (best-effort)', async () => {
    getUsage.mockRejectedValue(new Error('boom'))
    await expect(analyzeUsage('u1')).resolves.toBeUndefined()
  })
})
