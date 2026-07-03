import { describe, it, expect, vi } from 'vitest'
import { buildUsagePrompt, parseUsageVision, analyzeUsagePhotos } from '@/lib/ai/usageVision'

describe('buildUsagePrompt', () => {
  it('pide JSON con el esquema y las categorías', () => {
    const p = buildUsagePrompt()
    expect(p).toContain('JSON')
    expect(p).toContain('bencina')
    expect(p).toContain('limpieza')
    expect(p).toMatch(/Reserva/)
    expect(p).toMatch(/sucio/)
  })
})

describe('parseUsageVision', () => {
  it('extrae valores de un JSON válido', () => {
    expect(parseUsageVision('{"bencina":"1/2","km":45230,"limpieza":"aceptable"}')).toEqual({
      bencina: '1/2', km: 45230, limpieza: 'aceptable',
    })
  })
  it('tolera texto/fences alrededor del JSON', () => {
    const raw = 'Claro, aquí está:\n```json\n{"bencina":"Lleno","km":1000,"limpieza":"limpio"}\n```'
    expect(parseUsageVision(raw)).toEqual({ bencina: 'Lleno', km: 1000, limpieza: 'limpio' })
  })
  it('anula valores fuera de la enumeración o de tipo inválido', () => {
    expect(parseUsageVision('{"bencina":"medio","km":"muchos","limpieza":"mugriento"}')).toEqual({
      bencina: null, km: null, limpieza: null,
    })
  })
  it('km negativo o no entero → null', () => {
    expect(parseUsageVision('{"bencina":null,"km":-5,"limpieza":null}').km).toBeNull()
    expect(parseUsageVision('{"km":12.5}').km).toBeNull()
  })
  it('respuesta sin JSON → todo null', () => {
    expect(parseUsageVision('no pude leer las fotos')).toEqual({ bencina: null, km: null, limpieza: null })
  })
})

describe('analyzeUsagePhotos', () => {
  it('llama al chat con las 2 imágenes y devuelve el parse', async () => {
    const chat = vi.fn().mockResolvedValue('{"bencina":"3/4","km":100,"limpieza":"limpio"}')
    const res = await analyzeUsagePhotos(chat, { tableroUrl: 'A', cabinaUrl: 'B' })
    expect(chat).toHaveBeenCalledWith(['A', 'B'], expect.any(String))
    expect(res).toEqual({ bencina: '3/4', km: 100, limpieza: 'limpio' })
  })
})
