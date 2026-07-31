'use client'
import { useEffect, useRef, useState } from 'react'
import {
  resolverFalloNfc,
  nombreErrorNfc,
  MENSAJE_TIMEOUT,
  type MensajeNfc,
  type EstadoPermiso,
} from '@/lib/nfc/escritura'

type Estado = 'idle' | 'esperando' | 'confirmar' | 'ok' | 'error'

/** Si en un minuto no apareció ningún chip, cortamos y avisamos. */
const TIMEOUT_MS = 60_000

async function estadoPermisoNfc(): Promise<EstadoPermiso> {
  try {
    const st = await navigator.permissions.query({ name: 'nfc' as PermissionName })
    return st.state
  } catch {
    return 'desconocido'
  }
}

export default function GrabarChip({ url, patente }: { url: string; patente: string }) {
  const [soportado, setSoportado] = useState(false)
  const [estado, setEstado] = useState<Estado>('idle')
  const [error, setError] = useState<MensajeNfc | null>(null)
  // Este flujo solo existe en un celular Android que no tenemos a mano: sin una
  // pista en pantalla, un reporte de usuario llega como una foto sin diagnóstico.
  const [diagnostico, setDiagnostico] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Cancelar y timeout abortan con el mismo controller y ambos lanzan AbortError:
  // el motivo se lleva acá, no en el name de la excepción.
  const motivoRef = useRef<'cancelado' | 'timeout' | null>(null)

  useEffect(() => {
    setSoportado('NDEFReader' in window)
  }, [])

  async function grabar(overwrite: boolean) {
    setError(null)
    setDiagnostico(null)
    setEstado('esperando')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    motivoRef.current = null
    const timer = setTimeout(() => {
      motivoRef.current = 'timeout'
      ctrl.abort()
    }, TIMEOUT_MS)

    try {
      const lector = new window.NDEFReader!()
      await lector.write({ records: [{ recordType: 'url', data: url }] }, { overwrite, signal: ctrl.signal })
      setEstado('ok')
    } catch (err) {
      if (motivoRef.current === 'cancelado') {
        setEstado('idle')
        return
      }
      if (motivoRef.current === 'timeout') {
        setError(MENSAJE_TIMEOUT)
        setEstado('error')
        return
      }
      const permiso = await estadoPermisoNfc()
      const fallo = resolverFalloNfc(err, permiso, overwrite)
      if (fallo.confirmar) {
        setEstado('confirmar')
        return
      }
      console.error('nfc_write', err)
      setError(fallo.mensaje)
      setDiagnostico(`${nombreErrorNfc(err)} · permiso: ${permiso}`)
      setEstado('error')
    } finally {
      clearTimeout(timer)
      abortRef.current = null
    }
  }

  function cancelar() {
    motivoRef.current = 'cancelado'
    abortRef.current?.abort()
    setEstado('idle')
  }

  if (!soportado) return null

  return (
    <>
      <button
        type="button"
        onClick={() => grabar(false)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
          <rect x="3.5" y="3" width="9.5" height="18" rx="2.2" />
          <path d="M16.5 9.5a5 5 0 0 1 0 5" />
          <path d="M19.2 7.3a9 9 0 0 1 0 9.4" />
        </svg>
        Grabar chip
      </button>

      {estado !== 'idle' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Grabar chip NFC"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-lienzo/95 px-8 text-center backdrop-blur-sm"
        >
          {estado === 'esperando' && (
            <>
              <span className="relative flex size-20 items-center justify-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-azul/30" />
                <span className="relative flex size-20 items-center justify-center rounded-full bg-azul/10 text-azul">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-9" aria-hidden="true">
                    <rect x="3.5" y="3" width="9.5" height="18" rx="2.2" />
                    <path d="M16.5 9.5a5 5 0 0 1 0 5" />
                    <path d="M19.2 7.3a9 9 0 0 1 0 9.4" />
                  </svg>
                </span>
              </span>
              <p className="text-lg font-semibold text-tinta">Acerca el chip a la parte de arriba del teléfono</p>
              <p className="text-sm text-acero">Mantenlo apoyado hasta que aparezca el check.</p>
              <button type="button" onClick={cancelar} className="text-sm font-medium text-acero hover:underline">
                Cancelar
              </button>
            </>
          )}

          {estado === 'confirmar' && (
            <>
              <p className="text-lg font-semibold text-tinta">Este chip ya tiene información grabada</p>
              <p className="text-sm text-acero">
                Si pertenece a otro vehículo, ese vehículo se quedará sin chip.
              </p>
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => grabar(true)}
                  className="rounded-lg bg-azul px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press"
                >
                  Sobrescribir
                </button>
                <button type="button" onClick={() => setEstado('idle')} className="text-sm font-medium text-acero hover:underline">
                  Cancelar
                </button>
              </div>
            </>
          )}

          {estado === 'ok' && (
            <>
              <span className="flex size-20 items-center justify-center rounded-full bg-vigente/10 text-vigente">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-10" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <p className="text-lg font-semibold text-tinta">Chip grabado</p>
              <p className="text-2xl font-bold tracking-tight text-tinta">{patente}</p>
              <button
                type="button"
                onClick={() => setEstado('idle')}
                className="rounded-lg bg-azul px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press"
              >
                Listo
              </button>
            </>
          )}

          {estado === 'error' && error && (
            <>
              <span className="flex size-20 items-center justify-center rounded-full bg-[#FCE7E7] text-vencido">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-9" aria-hidden="true">
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
              </span>
              <p className="text-lg font-semibold text-tinta">{error.titulo}</p>
              <p className="text-sm text-acero">{error.detalle}</p>
              <div className="flex flex-col items-center gap-3">
                {/* Sin `reintentable` el botón no se ofrece: reintentar con el
                    permiso bloqueado da siempre el mismo error. */}
                {error.reintentable && (
                  <button
                    type="button"
                    onClick={() => grabar(false)}
                    className="rounded-lg bg-azul px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press"
                  >
                    Reintentar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEstado('idle')}
                  className={
                    error.reintentable
                      ? 'text-sm font-medium text-acero hover:underline'
                      : 'rounded-lg bg-azul px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press'
                  }
                >
                  Cerrar
                </button>
              </div>
              {diagnostico && <p className="text-xs text-acero/70">{diagnostico}</p>}
            </>
          )}
        </div>
      )}
    </>
  )
}
