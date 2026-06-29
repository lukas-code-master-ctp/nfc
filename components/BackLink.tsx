import Link from 'next/link'

// Flecha de "volver" reutilizable. Por defecto regresa al dashboard.
export default function BackLink({ href = '/dashboard', label = 'Volver' }: { href?: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-acero transition-colors hover:text-tinta"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
      {label}
    </Link>
  )
}
