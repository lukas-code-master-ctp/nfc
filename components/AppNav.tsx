'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/reportes', label: 'Reportes' },
]

export default function AppNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-6 text-sm font-medium">
      {LINKS.map(({ href, label }) => {
        const activo = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? 'page' : undefined}
            className={
              activo
                ? 'font-semibold text-azul'
                : 'text-acero transition-colors hover:text-tinta'
            }
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
