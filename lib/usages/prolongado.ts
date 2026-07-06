// Lógica pura del aviso de "uso prolongado" (sin Firebase, testeable).

export function horasEnUso(tomadoEn: string, now: Date): number {
  return (now.getTime() - new Date(tomadoEn).getTime()) / 3_600_000
}

export function usoProlongado(tomadoEn: string, avisoUsoHoras: number, now: Date): boolean {
  return horasEnUso(tomadoEn, now) >= avisoUsoHoras
}

/**
 * Valida el `avisoUsoHoras` que llega en el body del PATCH de empresa.
 * `'absent'` = no vino (no tocar); `'invalid'` = no es entero o < 1 (400);
 * el número si es un entero >= 1.
 */
export function parseAvisoUsoHoras(raw: unknown): number | 'invalid' | 'absent' {
  if (raw === undefined || raw === null) return 'absent'
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return 'invalid'
  return n
}
