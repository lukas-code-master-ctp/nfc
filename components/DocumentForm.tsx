'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_LABELS, tipoTieneVencimiento, type DocumentType } from '@/lib/types'
import { textoProgreso, type Pagina, type Progreso } from '@/lib/documentos/paginas'
import { subirPaginas, ErrorPagina } from '@/lib/documentos/subir'
import SelectorPaginas from '@/components/documento/SelectorPaginas'
import { useAvisoPaso } from '@/components/onboarding/AvisosOnboarding'
import { useLecturaFecha } from '@/components/documento/useLecturaFecha'

const TYPES = Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]

export default function DocumentForm({
  vehicleId,
  sinDocumentos = false,
}: {
  vehicleId: string
  /** El vehículo no tiene ningún documento todavía: el próximo completa el paso
   *  "Sube sus documentos" del onboarding. */
  sinDocumentos?: boolean
}) {
  const avisarPaso = useAvisoPaso()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<DocumentType>('permiso_circulacion')
  const [nombrePersonalizado, setNombre] = useState('')
  const [fechaVencimiento, setFecha] = useState('')
  const [paginas, setPaginas] = useState<Pagina[]>([])
  const [paginaConError, setPaginaConError] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Se activa la primera vez que el usuario edita el campo a mano — aunque lo
  // deje vacío a propósito (I2): de ahí en adelante el autorelleno queda
  // apagado para siempre en este formulario, y el aviso también, porque seguir
  // diciendo que la fecha la leyó una máquina sería mentir.
  const [campoTocado, setCampoTocado] = useState(false)
  // Procedencia del valor actual del campo: si lo puso la IA (y el usuario no
  // lo tocó desde entonces) hay que descartarlo al empezar una lectura nueva
  // (C1); si lo escribió el usuario, se conserva siempre. NO se puede derivar
  // de `campoTocado` solo: un valor de la IA puede convivir con el campo "no
  // tocado" (el usuario nunca lo editó a mano).
  const [fechaEsDeLaIA, setFechaEsDeLaIA] = useState(false)

  const estadoLectura = useLecturaFecha(paginas[0], {
    // Arranca una lectura nueva (cambió la página, o cambió a "sin página"): lo
    // que haya en el campo se descarta SOLO si lo puso la IA — es la fecha del
    // documento anterior, ya no corresponde. Lo que escribió el usuario queda
    // intacto. OJO: no simplificar a `actual || fecha` en `alLeer` de más abajo
    // ni borrar esto — es exactamente el bug que reintroduce el Critical.
    alEmpezar: () => {
      if (fechaEsDeLaIA) setFecha('')
      setFechaEsDeLaIA(false)
    },
    // Solo aplica si el usuario no tocó el campo todavía (I2: ni siquiera si lo
    // dejó vacío a propósito). Devuelve si aplicó, para que el aviso nunca
    // afirme algo que no pasó (I1).
    alLeer: (fecha) => {
      if (campoTocado) return false
      setFecha(fecha)
      setFechaEsDeLaIA(true)
      return true
    },
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPaginaConError(null)
    setLoading(true)
    try {
      const subida = await subirPaginas(vehicleId, paginas, setProgreso)
      const create = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId, tipo,
          nombrePersonalizado: tipo === 'otro' ? nombrePersonalizado : null,
          fechaVencimiento: tipoTieneVencimiento(tipo) ? fechaVencimiento || null : null,
          fileUrl: subida?.filePath ?? '', filePath: subida?.filePath ?? '',
        }),
      })
      if (!create.ok) throw new Error('create')
      // Primer documento del vehículo: ahí se completa el paso del onboarding.
      if (sinDocumentos) avisarPaso('documentos')
      setOpen(false)
      setPaginas([]); setFecha(''); setNombre(''); setCampoTocado(false); setFechaEsDeLaIA(false)
      router.refresh()
    } catch (err) {
      if (err instanceof ErrorPagina) {
        setPaginaConError(err.paginaId)
        setError('Una de las fotos no se pudo leer. Bórrala del listado y vuelve a intentarlo.')
      } else {
        setError('No se pudo agregar el documento.')
      }
    } finally {
      setLoading(false)
      setProgreso(null)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'
  const labelCls = 'block text-sm font-medium text-acero'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Agregar documento
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <div className="space-y-1.5">
        <label className={labelCls}>Tipo de documento</label>
        <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as DocumentType)}>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {tipo === 'otro' && (
        <input className={inputCls} placeholder="Nombre del documento"
          value={nombrePersonalizado} onChange={(e) => setNombre(e.target.value)} required />
      )}
      {tipoTieneVencimiento(tipo) && (
        <div className="space-y-1.5">
          <label htmlFor="fechaVencimiento" className={labelCls}>
            Fecha de vencimiento <span className="font-normal text-acero/70">(opcional)</span>
          </label>
          <input
            id="fechaVencimiento"
            type="date"
            className={inputCls}
            value={fechaVencimiento}
            aria-describedby="aviso-lectura-fecha"
            // Tocar el campo apaga el aviso y el autorelleno para siempre (I2):
            // de ahí en adelante la fecha es del usuario, y seguir diciendo que
            // la leyó una máquina —o pisarla con una lectura tardía— sería mentir.
            onChange={(e) => { setFecha(e.target.value); setCampoTocado(true); setFechaEsDeLaIA(false) }}
          />
          {/* `aria-live` para que un lector de pantalla se entere de que el campo
              lo llenó una máquina, no solo quien lo vea (M8). */}
          {!campoTocado && estadoLectura === 'leyendo' && (
            <p id="aviso-lectura-fecha" aria-live="polite" className="text-xs text-acero">Leyendo la fecha del documento…</p>
          )}
          {!campoTocado && estadoLectura === 'lista' && (
            <p id="aviso-lectura-fecha" aria-live="polite" className="text-xs text-acero">Fecha leída del documento — revísala.</p>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <label className={labelCls}>Archivo del documento</label>
        <SelectorPaginas
          paginas={paginas}
          onChange={(p) => { setPaginas(p); setPaginaConError(null); setError(null) }}
          paginaConError={paginaConError}
        />
      </div>
      {error && <p role="alert" className="rounded-lg bg-[#FCE7E7] px-3 py-2 text-sm text-[#C81E1E]">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading || paginas.length === 0}
          className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
          {loading ? textoProgreso(progreso) : 'Guardar'}
        </button>
        <button type="button" onClick={() => {
          // Cancelar deja el formulario como recién abierto: `open` es solo un
          // flag y NO desmonta nada, así que hay que limpiar la fecha y sus
          // marcas de procedencia a mano — si no, reabrir conserva la fecha
          // (y a veces sin ningún aviso que la explique).
          setOpen(false); setPaginas([]); setPaginaConError(null); setError(null)
          setFecha(''); setCampoTocado(false); setFechaEsDeLaIA(false)
        }}
          className="rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
          Cancelar
        </button>
      </div>
    </form>
  )
}
