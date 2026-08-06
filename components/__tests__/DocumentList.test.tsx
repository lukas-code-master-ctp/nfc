import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { VehicleDocument } from '@/lib/types'
import type { DocStatus } from '@/lib/documents/status'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

import DocumentList from '@/components/DocumentList'

type Item = VehicleDocument & { status: DocStatus; readUrl: string | null }

beforeEach(() => {
  push.mockReset()
  refresh.mockReset()
})

function documento(over: Partial<Item> = {}): Item {
  return {
    id: 'd1',
    vehicleId: 'v1',
    tipo: 'permiso_circulacion',
    nombrePersonalizado: null,
    fechaVencimiento: '2026-09-01',
    fileUrl: 'https://ejemplo.cl/archivo.jpg',
    filePath: 'documents/v1/d1.jpg',
    remindersSent: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    companyId: 'c1',
    status: 'al_dia' as DocStatus,
    readUrl: 'https://ejemplo.cl/leer.jpg',
    ...over,
  }
}

// Ver Fix 4 de la revisión final: sin este test, cambiar `fechaCalendario` por
// `fecha` en el render (que imprimiría el día ANTERIOR por la trampa de
// `new Date('YYYY-MM-DD')` siendo medianoche UTC) pasaba en silencio.
describe('DocumentList: formato de la fecha de vencimiento', () => {
  it('muestra la fecha en dd/mm/aaaa', () => {
    render(<DocumentList documents={[documento({ fechaVencimiento: '2026-09-01' })]} vehicleId="v1" canEdit={false} />)
    expect(screen.getByText('Vence el 01/09/2026')).toBeDefined()
  })

  it('sin fecha de vencimiento dice "Sin vencimiento"', () => {
    render(<DocumentList documents={[documento({ fechaVencimiento: null })]} vehicleId="v1" canEdit={false} />)
    expect(screen.getByText('Sin vencimiento')).toBeDefined()
  })

  // Fix 4(b): un documento cargado antes de que el servidor validara el
  // formato puede traer una fecha que no calza con YYYY-MM-DD. En blanco es
  // peor que en crudo, así que cae al valor original en vez de a ''.
  it('con una fecha que no calza con YYYY-MM-DD, muestra el valor crudo en vez de dejarlo en blanco', () => {
    render(<DocumentList documents={[documento({ fechaVencimiento: '01-09-2026' })]} vehicleId="v1" canEdit={false} />)
    expect(screen.getByText('Vence el 01-09-2026')).toBeDefined()
  })
})
