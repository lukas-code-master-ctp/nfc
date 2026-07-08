import { nanoid } from 'nanoid'
import type { Categoria } from '@/lib/types'

const MAX = 30
const MAX_NOMBRE = 40

// Saneo de la lista de categorías que llega del cliente (PATCH /api/company).
export function sanitizeCategorias(raw: unknown): Categoria[] {
  if (!Array.isArray(raw)) return []
  const out: Categoria[] = []
  const vistos = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as { id?: unknown; nombre?: unknown }
    const nombre = String(r.nombre ?? '').trim().slice(0, MAX_NOMBRE)
    if (!nombre) continue
    const key = nombre.toLowerCase()
    if (vistos.has(key)) continue
    vistos.add(key)
    const id = typeof r.id === 'string' && r.id ? r.id : nanoid()
    out.push({ id, nombre })
    if (out.length >= MAX) break
  }
  return out
}
