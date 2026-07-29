'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_LABELS, tipoTieneVencimiento, type DocumentType, type VehicleDocument } from '@/lib/types'
import { textoProgreso, type Pagina, type Progreso } from '@/lib/documentos/paginas'
import { subirPaginas, ErrorPagina } from '@/lib/documentos/subir'
import SelectorPaginas from '@/components/documento/SelectorPaginas'

const TYPES = Object.entries(DOCUMENT_TYPE_LABELS) as [DocumentType, string][]

export default function DocumentEditForm({
  vehicleId,
  document,
  onClose,
}: {
  vehicleId: string
  document: VehicleDocument
  onClose: () => void
}) {
  const router = useRouter()
  const [tipo, setTipo] = useState<DocumentType>(document.tipo)
  const [nombrePersonalizado, setNombre] = useState(document.nombrePersonalizado ?? '')
  const [fechaVencimiento, setFecha] = useState(document.fechaVencimiento ?? '')
  const [paginas, setPaginas] = useState<Pagina[]>([])
  const [paginaConError, setPaginaConError] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPaginaConError(null)
    setLoading(true)
    try {
      const patch: Record<string, unknown> = {
        tipo,
        nombrePersonalizado: tipo === 'otro' ? nombrePersonalizado : null,
        fechaVencimiento: tipoTieneVencimiento(tipo) ? fechaVencimiento || null : null,
      }
      const subida = await subirPaginas(vehicleId, paginas, setProgreso)
      if (subida) {
        patch.filePath = subida.filePath
        patch.fileUrl = subida.filePath
      }
      const update = await fetch(`/api/documents/${document.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!update.ok) throw new Error('update')
      onClose()
      router.refresh()
    } catch (err) {
      if (err instanceof ErrorPagina) {
        setPaginaConError(err.paginaId)
        setError('Una de las fotos no se pudo leer. Bórrala del listado y vuelve a intentarlo.')
      } else {
        setError('No se pudo actualizar el documento.')
      }
    } finally {
      setLoading(false)
      setProgreso(null)
    }
  }

  const inputCls =
    'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'
  const labelCls = 'block text-sm font-medium text-acero'

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-linea bg-lienzo p-4">
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
          <label className={labelCls}>Fecha de vencimiento <span className="font-normal text-acero/70">(opcional)</span></label>
          <input type="date" className={inputCls} value={fechaVencimiento} onChange={(e) => setFecha(e.target.value)} />
        </div>
      )}
      <div className="space-y-1.5">
        <label className={labelCls}>Reemplazar archivo <span className="font-normal text-acero/70">(opcional)</span></label>
        <SelectorPaginas
          paginas={paginas}
          onChange={(p) => { setPaginas(p); setPaginaConError(null); setError(null) }}
          paginaConError={paginaConError}
        />
      </div>
      {error && <p role="alert" className="rounded-lg bg-[#FCE7E7] px-3 py-2 text-sm text-[#C81E1E]">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={loading}
          className="rounded-lg bg-azul px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-azul-press disabled:opacity-50">
          {loading ? textoProgreso(progreso) : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onClose}
          className="rounded-lg border border-linea bg-superficie px-4 py-2.5 text-sm font-medium text-tinta transition-colors hover:bg-lienzo">
          Cancelar
        </button>
      </div>
    </form>
  )
}
