import { isValidPinFormat } from '@/lib/drivers/pin'

export interface FilaImport {
  nombre: string
  rut?: string
  pin: string
  pinGenerado: boolean
  estado: 'ok' | 'sin_nombre' | 'pin_invalido' | 'duplicado'
}

function pinAleatorio(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

function separar(linea: string): string[] {
  const sep = linea.includes('\t') ? '\t' : linea.includes(';') ? ';' : ','
  return linea.split(sep).map((c) => c.trim())
}

/**
 * Parsea filas pegadas desde Excel/Sheets (`nombre ⇥ rut ⇥ pin`; rut y pin
 * opcionales). PIN vacío → se genera uno de 4 dígitos. Duplicado = nombre ya
 * en el padrón o repetido antes en el mismo pegado (case-insensitive).
 */
export function parseImportacion(
  texto: string,
  nombresExistentes: string[],
  genPin: () => string = pinAleatorio,
): FilaImport[] {
  const vistos = new Set(nombresExistentes.map((n) => n.trim().toLowerCase()))
  const filas: FilaImport[] = []
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue
    const [nombre = '', rut = '', pinDado = ''] = separar(linea)
    if (!nombre) {
      filas.push({ nombre: '', rut: undefined, pin: '', pinGenerado: false, estado: 'sin_nombre' })
      continue
    }
    if (pinDado && !isValidPinFormat(pinDado)) {
      filas.push({ nombre, rut: rut || undefined, pin: '', pinGenerado: false, estado: 'pin_invalido' })
      continue
    }
    const clave = nombre.toLowerCase()
    if (vistos.has(clave)) {
      filas.push({ nombre, rut: rut || undefined, pin: '', pinGenerado: false, estado: 'duplicado' })
      continue
    }
    vistos.add(clave)
    filas.push({
      nombre,
      rut: rut || undefined,
      pin: pinDado || genPin(),
      pinGenerado: !pinDado,
      estado: 'ok',
    })
  }
  return filas
}
