/**
 * Construye el objeto `dano` para guardar en el uso, SIN claves con valor
 * `undefined` (Firestore Admin rechaza `undefined` y el `update` lanzaría).
 * Devuelve `undefined` si no se reportó daño.
 */
export function buildDano(
  raw: unknown,
): { hay: true; nota?: string; fotoPath?: string } | undefined {
  const d = raw as { hay?: unknown; nota?: unknown; fotoPath?: unknown } | null | undefined
  if (!d?.hay) return undefined
  const dano: { hay: true; nota?: string; fotoPath?: string } = { hay: true }
  if (typeof d.nota === 'string' && d.nota.trim()) dano.nota = d.nota.slice(0, 500)
  if (typeof d.fotoPath === 'string') dano.fotoPath = d.fotoPath
  return dano
}
