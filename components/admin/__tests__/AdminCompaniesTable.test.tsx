import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { AdminCompanyRow } from '@/lib/data/admin'

import AdminCompaniesTable from '@/components/admin/AdminCompaniesTable'

const empresa: AdminCompanyRow = {
  companyId: 'c1',
  razonSocial: 'Transportes Rencoret',
  ownerEmail: 'dueno@ejemplo.cl',
  vehicleCount: 2,
  maxVehiculos: 3,
}

const botonGuardar = () => screen.getByRole('button', { name: 'Guardar' })
const botonEliminar = () => screen.getByRole('button', { name: /Eliminar definitivamente/i })

// Deja el cupo distinto del guardado para habilitar "Guardar".
function cambiarCupo(valor: string) {
  fireEvent.change(screen.getByLabelText('Cupo'), { target: { value: valor } })
}

// Abre la confirmación de borrado y escribe la palabra exigida.
function confirmarBorrado() {
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
  fireEvent.change(screen.getByPlaceholderText(/Escribe ELIMINAR/i), { target: { value: 'ELIMINAR' } })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
})

describe('guardar el cupo', () => {
  it('llama al endpoint y confirma', async () => {
    render(<AdminCompaniesTable companies={[empresa]} />)
    cambiarCupo('7')
    fireEvent.click(botonGuardar())
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/admin/companies/c1', expect.objectContaining({ method: 'PATCH' })),
    )
    expect(await screen.findByText(/Guardado/)).toBeDefined()
  })

  it('avisa si el servidor responde con error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)))
    render(<AdminCompaniesTable companies={[empresa]} />)
    cambiarCupo('7')
    fireEvent.click(botonGuardar())
    expect(await screen.findByText('No se pudo guardar.')).toBeDefined()
    expect(botonGuardar().hasAttribute('disabled')).toBe(false)
  })

  // Un fetch RECHAZADO (sin conexión, timeout, DNS) no pasa por el camino !ok:
  // sin catch, `saving` queda encendido para siempre y el botón deshabilitado
  // sin ningún mensaje, así que no hay salida ni explicación.
  it('avisa y vuelve a habilitar el botón si el fetch rechaza', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    render(<AdminCompaniesTable companies={[empresa]} />)
    cambiarCupo('7')
    fireEvent.click(botonGuardar())
    expect(await screen.findByText('No se pudo conectar con el servidor.')).toBeDefined()
    expect(botonGuardar().hasAttribute('disabled')).toBe(false)
  })
})

describe('eliminar la empresa', () => {
  it('saca la fila de la lista al confirmar', async () => {
    render(<AdminCompaniesTable companies={[empresa]} />)
    confirmarBorrado()
    fireEvent.click(botonEliminar())
    await waitFor(() => expect(screen.getByText('No hay empresas todavía.')).toBeDefined())
  })

  it('avisa si el servidor responde con error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)))
    render(<AdminCompaniesTable companies={[empresa]} />)
    confirmarBorrado()
    fireEvent.click(botonEliminar())
    expect(await screen.findByText('No se pudo eliminar la empresa.')).toBeDefined()
    expect(botonEliminar().hasAttribute('disabled')).toBe(false)
  })

  // Mismo caso que en guardar: sin catch, "Eliminando…" queda para siempre.
  it('avisa y vuelve a habilitar el botón si el fetch rechaza', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    render(<AdminCompaniesTable companies={[empresa]} />)
    confirmarBorrado()
    fireEvent.click(botonEliminar())
    expect(await screen.findByText('No se pudo conectar con el servidor.')).toBeDefined()
    expect(botonEliminar().hasAttribute('disabled')).toBe(false)
    expect(screen.queryByText('No hay empresas todavía.')).toBeNull()
  })
})
