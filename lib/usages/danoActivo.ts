import type { DanoActivo } from '@/lib/types'

/** Arma el objeto danoActivo SIN claves undefined (Firestore las rechaza). */
export function buildDanoActivo(
  input: { nota?: string | null; fotoPath?: string | null },
  reportadoPor: 'admin' | 'conductor',
  reportadoPorNombre: string | null,
  ahoraISO: string,
): DanoActivo {
  const notaTrim = (input.nota ?? '').trim()
  return {
    nota: notaTrim ? notaTrim.slice(0, 500) : null,
    fotoPath: input.fotoPath ? input.fotoPath : null,
    reportadoPor,
    reportadoPorNombre: reportadoPorNombre ?? null,
    reportadoEn: ahoraISO,
  }
}
