import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NfcTokenPanel from '@/components/NfcTokenPanel'

const URL_CHIP = 'https://app.tapcar.cl/v/abc123'

afterEach(() => {
  delete (window as { NDEFReader?: unknown }).NDEFReader
})

describe('NfcTokenPanel', () => {
  it('muestra la URL pública del vehículo', () => {
    render(<NfcTokenPanel vehicleId="v1" initialUrl={URL_CHIP} patente="ABCD-12" />)
    expect(screen.getByText(URL_CHIP)).toBeDefined()
  })

  it('sin soporte de Web NFC no ofrece grabar y mantiene las instrucciones', () => {
    render(<NfcTokenPanel vehicleId="v1" initialUrl={URL_CHIP} patente="ABCD-12" />)
    expect(screen.queryByRole('button', { name: /grabar chip/i })).toBeNull()
    expect(screen.getByRole('button', { name: /cómo grabar el chip/i })).toBeDefined()
  })

  it('con soporte de Web NFC ofrece grabar el chip', async () => {
    window.NDEFReader = class {
      write = vi.fn()
    } as unknown as typeof window.NDEFReader

    render(<NfcTokenPanel vehicleId="v1" initialUrl={URL_CHIP} patente="ABCD-12" />)
    expect(await screen.findByRole('button', { name: /grabar chip/i })).toBeDefined()
  })
})
