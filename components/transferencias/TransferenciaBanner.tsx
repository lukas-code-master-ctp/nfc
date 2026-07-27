'use client'
import { useEffect, useState } from 'react'

type Info = {
  patente: string
  deCompanyNombre: string
  paraEmail: string
  status: string
}

export default function TransferenciaBanner({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      try {
        const res = await fetch('/api/transferencias/' + encodeURIComponent(token))
        if (!res.ok) return
        const data = (await res.json()) as Info
        if (!cancelado) setInfo(data)
      } catch {
        // sin conexión o error de red: no mostramos el aviso
      }
    }
    cargar()
    return () => {
      cancelado = true
    }
  }, [token])

  if (!info) return null

  return (
    <div className="mb-4 rounded-lg border border-azul/30 bg-azul/5 px-4 py-3 text-sm text-tinta">
      <strong>{info.deCompanyNombre || 'Otra empresa'}</strong> quiere transferirte el vehículo{' '}
      <strong>{info.patente}</strong>. Crea tu cuenta o inicia sesión con{' '}
      <strong>{info.paraEmail}</strong> para aceptarla.
    </div>
  )
}
