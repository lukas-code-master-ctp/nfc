import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { VehicleDocument, Vehicle } from '@/lib/types'
import type { DocStatus } from '@/lib/documents/status'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import PublicVehicleView from '@/components/PublicVehicleView'

type Item = VehicleDocument & { status: DocStatus; readUrl: string | null }

function vehiculo(over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'v1',
    patente: 'ABCD12',
    marca: 'Toyota',
    modelo: 'Corolla',
    anio: 2026,
    color: 'Azul',
    publicToken: 'token123',
    companyId: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

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

// La ficha pública es lo que lee un carabinero en una revisión, así que
// debe mostrar la fecha de vencimiento en el formato consistente.
// Ver Fix 4 de la revisión final: sin este test, cambiar `fechaCalendario` por
// `fecha` en el render (que imprimiría el día ANTERIOR por la trampa de
// `new Date('YYYY-MM-DD')` siendo medianoche UTC) pasaba en silencio.
describe('PublicVehicleView: formato de la fecha de vencimiento', () => {
  it('muestra la fecha en dd/mm/aaaa', () => {
    render(
      <PublicVehicleView
        vehicle={vehiculo()}
        documents={[documento({ fechaVencimiento: '2026-09-01' })]}
        token="abc123"
        drivers={[]}
        enUso={null}
        danoFotoUrl={null}
      />
    )
    fireEvent.click(screen.getByText('Documentos del vehículo'))
    expect(screen.getByText('Vence el 01/09/2026')).toBeDefined()
  })

  // Fix 4(b): un documento cargado antes de que el servidor validara el
  // formato puede traer una fecha que no calza con YYYY-MM-DD. En blanco es
  // peor que en crudo, así que cae al valor original en vez de a ''.
  it('con una fecha que no calza con YYYY-MM-DD, muestra el valor crudo en vez de dejarlo en blanco', () => {
    render(
      <PublicVehicleView
        vehicle={vehiculo()}
        documents={[documento({ fechaVencimiento: '01-09-2026' })]}
        token="abc123"
        drivers={[]}
        enUso={null}
        danoFotoUrl={null}
      />
    )
    fireEvent.click(screen.getByText('Documentos del vehículo'))
    expect(screen.getByText('Vence el 01-09-2026')).toBeDefined()
  })
})
