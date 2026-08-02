'use client'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { PromoCode } from '@/lib/types'
import { MAX_MESES_PROMO, MAX_VEHICULOS_PROMO } from '@/lib/types'

// Mensajes crudos que devuelve el servidor y que no alcanzan a ser legibles
// para el admin (los de `mesesGratis`/`vehiculosIncluidos` ya vienen como
// oración completa desde el endpoint y se muestran tal cual).
const ERRORES_SERVIDOR: Record<string, string> = {
  'codigo inválido': 'El código no puede quedar vacío tras normalizarlo (solo letras, números y guiones).',
  'cuerpo inválido': 'No se pudo leer la solicitud. Inténtalo de nuevo.',
  'maxCanjes inválido': 'El tope de canjes debe ser un número entero mayor o igual a 1.',
  'activo requerido': 'Falta indicar si el código queda activo o inactivo.',
}

function mensajeError(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  return ERRORES_SERVIDOR[raw] ?? raw
}

function queOtorga(c: Pick<PromoCode, 'mesesGratis' | 'vehiculosIncluidos'>): string {
  const partes: string[] = []
  if (c.mesesGratis > 0) partes.push(`${c.mesesGratis} ${c.mesesGratis === 1 ? 'mes' : 'meses'} gratis`)
  if (c.vehiculosIncluidos > 0) {
    partes.push(`${c.vehiculosIncluidos} ${c.vehiculosIncluidos === 1 ? 'vehículo' : 'vehículos'}`)
  }
  return partes.join(' + ') || 'No otorga nada'
}

function Row({ c }: { c: PromoCode }) {
  // Copia local del estado del servidor: nunca se muta el prop `c`.
  const [activo, setActivo] = useState(c.activo)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    const siguiente = !activo
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/promo-codes/${c.codigo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: siguiente }),
      })
      if (!res.ok) {
        setError('No se pudo actualizar el código.')
        return
      }
      setActivo(siguiente)
    } catch {
      // El fetch puede RECHAZAR (sin conexión, timeout, DNS), no solo devolver
      // !ok: sin este catch, ese camino dejaría el switch colgado "guardando".
      setError('No se pudo conectar con el servidor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold text-tinta">{c.codigo}</p>
          <p className="truncate text-sm text-acero">{queOtorga(c)}</p>
          {c.descripcion && <p className="truncate text-xs text-acero">{c.descripcion}</p>}
        </div>

        <div className="flex items-center gap-4 text-sm text-acero">
          <div className="text-right">
            <p className="text-tinta tabular-nums">
              {c.canjes} / {c.maxCanjes ?? 'sin tope'}
            </p>
            <p className="text-xs">canjes</p>
          </div>
          <div className="text-right">
            <p className="text-tinta tabular-nums">{c.expiraEn ?? 'Sin vencimiento'}</p>
            <p className="text-xs">vence</p>
          </div>

          <div className="flex items-center gap-2">
            <span className={activo ? 'text-sm font-medium text-[#15803D]' : 'text-sm font-medium text-acero'}>
              {activo ? 'Activo' : 'Inactivo'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={activo}
              aria-label={activo ? `Desactivar ${c.codigo}` : `Activar ${c.codigo}`}
              onClick={toggle}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                activo ? 'bg-azul' : 'bg-linea'
              }`}
            >
              <span
                className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                  activo ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-right text-xs text-vencido">{error}</p>}
    </li>
  )
}

export default function PromoCodesPanel({ codigos }: { codigos: PromoCode[] }) {
  // Estado local en vez de mutar el prop `codigos`; los códigos nuevos se
  // agregan acá arriba, los existentes se leen tal cual llegaron del servidor.
  const [rows, setRows] = useState(codigos)

  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [mesesGratis, setMesesGratis] = useState('1')
  const [vehiculosIncluidos, setVehiculosIncluidos] = useState('1')
  const [expiraEn, setExpiraEn] = useState('')
  const [maxCanjes, setMaxCanjes] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const meses = Number(mesesGratis)
  const vehiculos = Number(vehiculosIncluidos)
  // Mínimo 1 en los dos campos, no un OR entre ellos: con `vehiculosIncluidos:
  // 0` la fase promo no cubre nada (se cobra igual que sin canjear), y con
  // `mesesGratis: 0` la ventana de promoción dura cero días. Un código así no
  // otorga nada aunque la UI lo anuncie — ver C1 de la revisión final.
  const mesesInvalido = !Number.isFinite(meses) || meses < 1 || meses > MAX_MESES_PROMO
  const vehiculosInvalido = !Number.isFinite(vehiculos) || vehiculos < 1 || vehiculos > MAX_VEHICULOS_PROMO
  const invalido = codigo.trim() === '' || mesesInvalido || vehiculosInvalido

  async function crear(e: FormEvent) {
    e.preventDefault()
    if (invalido) return
    setCreando(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo,
          descripcion,
          mesesGratis: meses,
          vehiculosIncluidos: vehiculos,
          expiraEn: expiraEn || null,
          maxCanjes: maxCanjes === '' ? null : Number(maxCanjes),
        }),
      })
      if (!res.ok) {
        // Igual que el resto del panel: si el cuerpo no es JSON válido, no se
        // puede dejar la pantalla sin ningún mensaje.
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (res.status === 409 && data.error === 'codigo_existe') {
          setError('Ya existe un código con ese nombre.')
        } else {
          setError(mensajeError(data.error, 'No se pudo crear el código.'))
        }
        return
      }
      const data = (await res.json()) as { codigo: string }
      setRows((prev) => [
        {
          codigo: data.codigo,
          descripcion,
          mesesGratis: Math.floor(meses),
          vehiculosIncluidos: Math.floor(vehiculos),
          activo: true,
          expiraEn: expiraEn || null,
          maxCanjes: maxCanjes === '' ? null : Math.floor(Number(maxCanjes)),
          canjes: 0,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ])
      setCodigo('')
      setDescripcion('')
      setMesesGratis('1')
      setVehiculosIncluidos('1')
      setExpiraEn('')
      setMaxCanjes('')
    } catch {
      // Igual que el switch: un fetch rechazado no puede dejar el formulario
      // colgado en "Creando…" sin decir nada.
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <section className="mt-8">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-tinta">Códigos promocionales</h2>
        <p className="mt-1 text-sm text-acero">
          Crea campañas y actívalas o desactívalas. No se pueden eliminar: el registro queda como historial.
        </p>
      </div>

      <form onSubmit={crear} className="mb-4 rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="promo-codigo" className="text-sm text-acero">Código</label>
            <input
              id="promo-codigo"
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="TAPCAR-AGOSTO"
              className="mt-1 w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
            />
            <p className="mt-1 text-xs text-acero">Se guarda en mayúsculas, sin espacios ni símbolos.</p>
          </div>

          <div>
            <label htmlFor="promo-descripcion" className="text-sm text-acero">Descripción</label>
            <input
              id="promo-descripcion"
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Campaña de lanzamiento"
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
            />
          </div>

          <div>
            <label htmlFor="promo-expira" className="text-sm text-acero">Vence (opcional)</label>
            <input
              id="promo-expira"
              type="date"
              value={expiraEn}
              onChange={(e) => setExpiraEn(e.target.value)}
              className="mt-1 w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
            />
          </div>

          <div>
            <label htmlFor="promo-meses" className="text-sm text-acero">Meses gratis</label>
            <input
              id="promo-meses"
              type="number"
              min={1}
              max={MAX_MESES_PROMO}
              inputMode="numeric"
              value={mesesGratis}
              onChange={(e) => setMesesGratis(e.target.value)}
              className="mt-1 w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta tabular-nums focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
            />
            {mesesInvalido && <p className="mt-1 text-xs text-vencido">Entre 1 y {MAX_MESES_PROMO}.</p>}
          </div>

          <div>
            <label htmlFor="promo-vehiculos" className="text-sm text-acero">Vehículos incluidos</label>
            <input
              id="promo-vehiculos"
              type="number"
              min={1}
              max={MAX_VEHICULOS_PROMO}
              inputMode="numeric"
              value={vehiculosIncluidos}
              onChange={(e) => setVehiculosIncluidos(e.target.value)}
              className="mt-1 w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta tabular-nums focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
            />
            {vehiculosInvalido && <p className="mt-1 text-xs text-vencido">Entre 1 y {MAX_VEHICULOS_PROMO}.</p>}
            <p className="mt-1 text-xs text-acero">
              Para cubrir cualquier flota usa {MAX_VEHICULOS_PROMO} (el tope self-service de un plan es 30).
            </p>
          </div>

          <div>
            <label htmlFor="promo-tope" className="text-sm text-acero">Tope de canjes (opcional)</label>
            <input
              id="promo-tope"
              type="number"
              min={1}
              inputMode="numeric"
              value={maxCanjes}
              onChange={(e) => setMaxCanjes(e.target.value)}
              placeholder="Sin tope"
              className="mt-1 w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-sm text-tinta tabular-nums placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-vencido">{error}</p>}

        <button
          type="submit"
          disabled={creando || invalido}
          className="mt-4 rounded-lg bg-azul px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-azul"
        >
          {creando ? 'Creando…' : 'Crear código'}
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-linea bg-superficie/60 px-6 py-12 text-center">
          <p className="text-sm text-acero">No hay códigos todavía.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => (
            <Row key={c.codigo} c={c} />
          ))}
        </ul>
      )}
    </section>
  )
}
