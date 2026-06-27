export type DocStatus = 'al_dia' | 'por_vencer' | 'vencido' | 'sin_vencimiento'

const MS_PER_DAY = 1000 * 60 * 60 * 24

// Calcula días entre hoy y la fecha de vencimiento en zona horaria de Chile,
// comparando fechas calendario (sin horas) para evitar desfases de ±1 día.
function chileDateParts(d: Date): { y: number; m: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, m, day] = fmt.format(d).split('-').map(Number)
  return { y, m, day }
}

export function daysUntil(fechaVencimiento: string | null, now: Date): number | null {
  if (!fechaVencimiento) return null
  const { y, m, day } = chileDateParts(now)
  const today = Date.UTC(y, m - 1, day)
  const [vy, vm, vd] = fechaVencimiento.split('-').map(Number)
  const venc = Date.UTC(vy, vm - 1, vd)
  return Math.round((venc - today) / MS_PER_DAY)
}

export function documentStatus(fechaVencimiento: string | null, now: Date): DocStatus {
  const d = daysUntil(fechaVencimiento, now)
  if (d === null) return 'sin_vencimiento'
  if (d < 0) return 'vencido'
  if (d <= 30) return 'por_vencer'
  return 'al_dia'
}

const RANK: Record<DocStatus, number> = {
  vencido: 3,
  por_vencer: 2,
  al_dia: 1,
  sin_vencimiento: 0,
}

export function worstStatus(statuses: DocStatus[]): DocStatus {
  if (statuses.length === 0) return 'sin_vencimiento'
  return statuses.reduce((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'sin_vencimiento' as DocStatus)
}
