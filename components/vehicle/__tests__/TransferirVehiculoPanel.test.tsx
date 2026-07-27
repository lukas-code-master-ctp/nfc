import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import TransferirVehiculoPanel from '@/components/vehicle/TransferirVehiculoPanel'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('confirm', () => true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TransferirVehiculoPanel', () => {
  it('sin transferencia pendiente pide el correo', () => {
    render(<TransferirVehiculoPanel vehicleId="v1" patente="ABCD-12" pendiente={null} />)
    expect(screen.getByLabelText(/correo/i)).toBeDefined()
  })

  it('envía el correo escrito al endpoint', async () => {
    render(<TransferirVehiculoPanel vehicleId="v1" patente="ABCD-12" pendiente={null} />)
    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'nuevo@dos.cl' } })
    fireEvent.click(screen.getByRole('button', { name: /transferir/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vehicles/v1/transferir', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'nuevo@dos.cl' }),
    })))
  })

  it('muestra el mensaje que devuelve el servidor cuando falla', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'sin_cuenta', mensaje: 'Ese correo no tiene cuenta en TapCar.' }),
    })
    render(<TransferirVehiculoPanel vehicleId="v1" patente="ABCD-12" pendiente={null} />)
    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'nadie@x.cl' } })
    fireEvent.click(screen.getByRole('button', { name: /transferir/i }))

    await waitFor(() => expect(screen.getByText(/no tiene cuenta en TapCar/i)).toBeDefined())
  })

  it('con una pendiente muestra a quién y ofrece cancelar', async () => {
    render(
      <TransferirVehiculoPanel
        vehicleId="v1"
        patente="ABCD-12"
        pendiente={{ paraEmail: 'nuevo@dos.cl', expiresAt: '2026-08-03T12:00:00.000Z' }}
      />,
    )
    expect(screen.getByText(/nuevo@dos.cl/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/vehicles/v1/transferir', { method: 'DELETE' }))
  })
})
