// Piezas grises que laten mientras el servidor arma la página. Van marcadas
// aria-hidden: son decorativas. Lo único anunciable a un lector de pantalla es
// el `<p className="sr-only" role="status">` que cada loading.tsx agrega como
// primer hijo del `<main>` (poner role="status" en el propio `<main>` reemplaza
// el landmark "main" y no tiene contenido anunciable adentro, porque todo lo
// demás es aria-hidden).

/** Un rectángulo. Para cards, iconos y bloques de contenido. */
export function Bloque({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-linea ${className}`} aria-hidden="true" />
}

/** Una línea de texto. Más baja y con las puntas redondeadas. */
export function Linea({ className = '' }: { className?: string }) {
  return <div className={`h-3 animate-pulse rounded-full bg-linea ${className}`} aria-hidden="true" />
}
