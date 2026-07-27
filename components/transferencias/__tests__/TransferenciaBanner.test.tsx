import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import TransferenciaBanner from '@/components/transferencias/TransferenciaBanner'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TransferenciaBanner', () => {
  it('nombra la patente, la empresa y el correo con el que hay que entrar', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        patente: 'ABCD-12', deCompanyNombre: 'Transportes Uno',
        paraEmail: 'nuevo@dos.cl', status: 'pendiente',
      }),
    })
    render(<TransferenciaBanner token="tok" />)

    await waitFor(() => expect(screen.getByText(/ABCD-12/)).toBeDefined())
    expect(screen.getByText(/Transportes Uno/)).toBeDefined()
    expect(screen.getByText(/nuevo@dos\.cl/)).toBeDefined()
  })

  it('no muestra nada si el token ya no sirve', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })
    const { container } = render(<TransferenciaBanner token="tok" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
