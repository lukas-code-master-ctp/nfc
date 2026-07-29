// Lógica pura de la lista de páginas de un documento: sin DOM, sin red, sin Firebase.
// El único tipo del navegador que aparece acá es File, y solo como tipo.

/** Una página de la lista: el archivo elegido. La miniatura crea y revoca su propio objectURL. */
export type Pagina = { id: string; file: File }

/** Qué se termina subiendo a Storage. */
export type Salida = 'ninguno' | 'archivo' | 'pdf'

/** Avance visible en el botón mientras se prepara y sube el documento. */
export type Progreso = { hechas: number; total: number } | 'subiendo'

/** Tope de páginas por documento. Con la compresión, ~300 KB por página. */
export const MAX_PAGINAS = 10

/** Lado largo al que se reescalan las fotos. Un permiso de circulación se lee de sobra. */
export const LADO_MAX = 2000

/** Calidad del JPEG al recomprimir. */
export const CALIDAD_JPEG = 0.8

export function esImagen(contentType: string): boolean {
  return contentType.startsWith('image/')
}

/** Cuántas de las que eligió el usuario caben bajo el tope, y cuántas quedan fuera. */
export function cabenPaginas(actuales: number, nuevas: number): { acepta: number; rechaza: number } {
  const libres = Math.max(0, MAX_PAGINAS - actuales)
  const acepta = Math.min(libres, nuevas)
  return { acepta, rechaza: nuevas - acepta }
}

export function decidirSalida(paginas: Pagina[]): Salida {
  if (paginas.length === 0) return 'ninguno'
  // Un PDF del usuario se sube tal cual, y la UI garantiza que va solo. Si igual se
  // colara junto a fotos, `subirPaginas` rechaza la lista con `lista_mixta` en vez de
  // descartar páginas en silencio.
  if (paginas.some((p) => !esImagen(p.file.type))) return 'archivo'
  return paginas.length === 1 ? 'archivo' : 'pdf'
}

export function dimensionesReescaladas(w: number, h: number, ladoMax: number): { w: number; h: number } {
  const largo = Math.max(w, h)
  if (largo <= ladoMax) return { w, h }
  const factor = ladoMax / largo
  return { w: Math.round(w * factor), h: Math.round(h * factor) }
}

export function textoProgreso(p: Progreso | null): string {
  if (p === 'subiendo') return 'Subiendo…'
  if (p) return `Preparando página ${p.hechas + 1} de ${p.total}…`
  return 'Guardando…'
}
