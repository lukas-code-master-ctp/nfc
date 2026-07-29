'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Paso } from '@/lib/onboarding/pasos'
import type { TipoCuenta } from '@/lib/types'

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

export default function TarjetaProgreso({ pasos, tipoCuenta }: { pasos: Paso[]; tipoCuenta: TipoCuenta }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const hechos = pasos.filter((p) => p.listo).length

  async function patch(body: Record<string, unknown>) {
    setOcupado(true)
    // Si el fetch rechaza (sin conexión, timeout, DNS — común en celular) el
    // catch libera "ocupado" igual que el camino !ok, para que los botones no
    // queden inhabilitados para siempre y el usuario pueda reintentar.
    try {
      const res = await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setOcupado(false)
      if (res.ok) router.refresh()
    } catch {
      setOcupado(false)
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-tinta">Configura tu cuenta</h2>
          <p className="mt-0.5 text-sm text-acero">
            <span className="font-medium text-tinta">{hechos} de {pasos.length}</span> · Puedes hacerlo cuando quieras.
          </p>
        </div>
        <button
          type="button"
          onClick={() => patch({ descartado: true })}
          disabled={ocupado}
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-acero hover:bg-lienzo disabled:opacity-60"
        >
          Ocultar
        </button>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-lienzo" aria-hidden="true">
        <div className="h-full rounded-full bg-azul transition-all" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
      </div>

      <ul className="mt-4 space-y-1">
        {pasos.map((p) => (
          <li key={p.id} className="flex items-start gap-3 rounded-xl px-2 py-2">
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${
                p.listo ? 'border-vigente bg-vigente text-white' : 'border-linea text-transparent'
              }`}
              aria-hidden="true"
            >
              <CheckIcon className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              {p.listo ? (
                <p className="text-sm font-medium text-acero line-through">{p.titulo}</p>
              ) : (
                <>
                  <Link href={p.href} className="text-sm font-medium text-azul hover:underline">
                    {p.titulo}
                  </Link>
                  <p className="mt-0.5 text-sm text-acero">{p.detalle}</p>
                  {p.informativo && (
                    <button
                      type="button"
                      onClick={() => patch({ visto: p.id })}
                      disabled={ocupado}
                      className="mt-1.5 rounded-lg border border-linea px-2.5 py-1 text-xs font-medium text-acero hover:bg-lienzo disabled:opacity-60"
                    >
                      Entendido
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {tipoCuenta === 'personal' && (
        <button
          type="button"
          onClick={() => patch({ tipoCuenta: 'empresa' })}
          disabled={ocupado}
          className="mt-3 text-sm text-acero underline hover:text-tinta disabled:opacity-60"
        >
          En realidad administro una flota
        </button>
      )}
    </section>
  )
}
