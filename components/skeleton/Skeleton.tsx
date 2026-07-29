// Piezas grises que laten mientras el servidor arma la página. Van marcadas
// aria-hidden: quien usa lector de pantalla escucha el "Cargando" del contenedor,
// no una lista de rectángulos vacíos.

/** Un rectángulo. Para cards, iconos y bloques de contenido. */
export function Bloque({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-linea ${className}`} aria-hidden="true" />
}

/** Una línea de texto. Más baja y con las puntas redondeadas. */
export function Linea({ className = '' }: { className?: string }) {
  return <div className={`h-3 animate-pulse rounded-full bg-linea ${className}`} aria-hidden="true" />
}
