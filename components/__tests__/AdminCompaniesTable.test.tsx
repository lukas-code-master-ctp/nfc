import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdminCompaniesTable from '@/components/admin/AdminCompaniesTable'
import type { AdminCompanyResumen } from '@/lib/data/admin'

const empresa: AdminCompanyResumen = {
  companyId: 'c1',
  razonSocial: 'Transportes Andes',
  ownerEmail: 'duenio@andes.cl',
  vehicleCount: 4,
  maxVehiculos: 5,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// El panel es interno y se usa poco, así que un botón colgado ahí pasa
// inadvertido mucho tiempo. Estos dos tests fijan el camino del fetch que
// RECHAZA (sin conexión, timeout, DNS), distinto del que responde !ok: es el
// único que puede dejar el estado de carga encendido para siempre.
describe('AdminCompaniesTable · el fetch que rechaza', () => {
  it('guardar el cupo con la red caída muestra el error y deja el botón usable', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<AdminCompaniesTable companies={[empresa]} />)

    // El botón parte deshabilitado porque el valor no cambió: hay que ensuciarlo.
    fireEvent.change(screen.getByLabelText('Cupo'), { target: { value: '9' } })
    const guardar = screen.getByRole('button', { name: 'Guardar' })
    expect((guardar as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(guardar)

    await waitFor(() => expect(screen.getByText(/No se pudo guardar/)).toBeTruthy())
    expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('eliminar con la red caída muestra el error, deja el botón usable y no borra la fila', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<AdminCompaniesTable companies={[empresa]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    fireEvent.change(screen.getByPlaceholderText('Escribe ELIMINAR para confirmar'), {
      target: { value: 'ELIMINAR' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))

    await waitFor(() => expect(screen.getByText(/No se pudo eliminar la empresa/)).toBeTruthy())
    const boton = screen.getByRole('button', { name: 'Eliminar definitivamente' }) as HTMLButtonElement
    expect(boton.disabled).toBe(false)
    // La empresa sigue en la lista: un fallo de red no la puede hacer
    // desaparecer. Se comprueba por el estado vacío y no por el nombre, que
    // aparece dos veces con el panel de confirmación abierto.
    expect(screen.queryByText('No hay empresas todavía.')).toBeNull()
  })
})

describe('AdminCompaniesTable · caminos que ya funcionaban', () => {
  it('un !ok al guardar sigue mostrando su error', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<AdminCompaniesTable companies={[empresa]} />)

    fireEvent.change(screen.getByLabelText('Cupo'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(screen.getByText('No se pudo guardar.')).toBeTruthy())
  })

  it('un borrado exitoso saca la empresa de la lista', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
    render(<AdminCompaniesTable companies={[empresa]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    fireEvent.change(screen.getByPlaceholderText('Escribe ELIMINAR para confirmar'), {
      target: { value: 'ELIMINAR' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))

    await waitFor(() => expect(screen.getByText('No hay empresas todavía.')).toBeTruthy())
  })

  it('un guardado exitoso llama al PATCH y confirma en pantalla', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
    render(<AdminCompaniesTable companies={[empresa]} />)

    fireEvent.change(screen.getByLabelText('Cupo'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/admin/companies/c1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    // La confirmación importa tanto como la llamada: el cupo se edita a ciegas
    // y sin ese "Guardado ✓" no hay forma de saber si el número quedó puesto.
    await waitFor(() => expect(screen.getByText('Guardado ✓')).toBeTruthy())
  })

  it('un !ok al eliminar avisa y deja la empresa en la lista', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<AdminCompaniesTable companies={[empresa]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    fireEvent.change(screen.getByPlaceholderText('Escribe ELIMINAR para confirmar'), {
      target: { value: 'ELIMINAR' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar definitivamente' }))

    await waitFor(() => expect(screen.getByText('No se pudo eliminar la empresa.')).toBeTruthy())
    const boton = screen.getByRole('button', { name: 'Eliminar definitivamente' }) as HTMLButtonElement
    expect(boton.disabled).toBe(false)
    expect(screen.queryByText('No hay empresas todavía.')).toBeNull()
  })
})
