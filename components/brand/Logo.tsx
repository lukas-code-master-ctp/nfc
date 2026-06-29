// Logo de marca TapCar. El isotipo (auto + ondas NFC) va como SVG inline; el
// wordmark "TapCar" se renderiza con la tipografía real de la app (Geist) para
// máxima nitidez. Basado en Brand/tapcar-isotipo.svg y tapcar-lockup.svg.

export function TapCarIsotipo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 72" fill="none" className={className} aria-hidden="true">
      <g stroke="#2952e6" strokeWidth="3.4" strokeLinecap="round" fill="none">
        <path d="M44 22 A 14 14 0 0 1 58 36" />
        <path d="M44 14 A 22 22 0 0 1 66 36" />
      </g>
      <path
        d="M8 50 C8 43 11 41 15 41 L22 33 C24 31 26 30 29 30 L40 30 C43 30 45 31 47 34 L51 41 C56 41 58 44 58 50 L58 52 C58 53.1 57.1 54 56 54 L10 54 C8.9 54 8 53.1 8 52 Z"
        fill="#2952e6"
      />
      <path d="M25 40 L28 33 L33 33 L33 40 Z" fill="#ffffff" />
      <path d="M36 33 L40 33 C42 33 43.5 34 45 36 L48 40 L36 40 Z" fill="#ffffff" />
      <circle cx="23" cy="54" r="6.5" fill="#16191f" />
      <circle cx="23" cy="54" r="2.5" fill="#ffffff" />
      <circle cx="48" cy="54" r="6.5" fill="#16191f" />
      <circle cx="48" cy="54" r="2.5" fill="#ffffff" />
    </svg>
  )
}

export function TapCarWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      <span className="text-tinta">Tap</span>
      <span className="text-azul">Car</span>
    </span>
  )
}

export function TapCarLockup({
  iconClassName = 'size-8',
  wordClassName = 'text-xl',
  className = '',
}: {
  iconClassName?: string
  wordClassName?: string
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <TapCarIsotipo className={iconClassName} />
      <TapCarWordmark className={wordClassName} />
    </span>
  )
}
