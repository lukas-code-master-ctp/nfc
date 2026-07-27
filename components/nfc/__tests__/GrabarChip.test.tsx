import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import GrabarChip from '@/components/nfc/GrabarChip'

const URL_CHIP = 'https://app.tapcar.cl/v/abc123'
const errorCon = (name: string) => Object.assign(new Error('falló'), { name })

let write: ReturnType<typeof vi.fn>

/** Instala un NDEFReader falso; sin esto el componente se considera no soportado. */
function conSoporteNfc() {
  window.NDEFReader = class {
    write = write
  } as unknown as typeof window.NDEFReader
}

function conPermiso(state: string) {
  Object.defineProperty(navigator, 'permissions', {
    value: { query: vi.fn().mockResolvedValue({ state }) },
    configurable: true,
  })
}

const pintar = () => render(<GrabarChip url={URL_CHIP} patente="ABCD-12" />)

beforeEach(() => {
  write = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete (window as { NDEFReader?: unknown }).NDEFReader
  vi.restoreAllMocks()
})

describe('GrabarChip', () => {
  it('no renderiza nada si el navegador no soporta NFC', () => {
    pintar()
    expect(screen.queryByRole('button', { name: /grabar chip/i })).toBeNull()
  })

  it('escribe la URL como record de tipo url, sin sobrescribir', async () => {
    conSoporteNfc()
    pintar()
    fireEvent.click(await screen.findByRole('button', { name: /grabar chip/i }))

    await waitFor(() => expect(screen.getByText('Chip grabado')).toBeDefined())
    expect(write).toHaveBeenCalledWith(
      { records: [{ recordType: 'url', data: URL_CHIP }] },
      expect.objectContaining({ overwrite: false }),
    )
    expect(screen.getByText('ABCD-12')).toBeDefined()
  })

  it('pide confirmación si el chip ya tenía datos y recién ahí sobrescribe', async () => {
    conSoporteNfc()
    conPermiso('granted')
    write.mockRejectedValueOnce(errorCon('NotAllowedError'))
    pintar()
    fireEvent.click(await screen.findByRole('button', { name: /grabar chip/i }))

    await waitFor(() => expect(screen.getByText(/ya tiene información grabada/i)).toBeDefined())
    expect(write).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /sobrescribir/i }))
    await waitFor(() => expect(screen.getByText('Chip grabado')).toBeDefined())
    expect(write).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ overwrite: true }))
  })

  it('con el permiso denegado muestra el error de permiso, no la confirmación', async () => {
    conSoporteNfc()
    conPermiso('prompt')
    write.mockRejectedValueOnce(errorCon('NotAllowedError'))
    pintar()
    fireEvent.click(await screen.findByRole('button', { name: /grabar chip/i }))

    await waitFor(() => expect(screen.getByText('Falta el permiso de NFC')).toBeDefined())
    expect(screen.queryByRole('button', { name: /sobrescribir/i })).toBeNull()
  })

  it('traduce un error del navegador a su mensaje', async () => {
    conSoporteNfc()
    write.mockRejectedValueOnce(errorCon('NotReadableError'))
    pintar()
    fireEvent.click(await screen.findByRole('button', { name: /grabar chip/i }))

    await waitFor(() => expect(screen.getByText('El NFC del teléfono está apagado')).toBeDefined())
  })

  it('cancelar aborta la escritura y vuelve al panel sin error', async () => {
    conSoporteNfc()
    write.mockImplementation((_msg: unknown, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(errorCon('AbortError')))
      }),
    )
    pintar()
    fireEvent.click(await screen.findByRole('button', { name: /grabar chip/i }))
    await waitFor(() => expect(screen.getByText(/acerca el chip/i)).toBeDefined())

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    await waitFor(() => expect(screen.queryByText(/acerca el chip/i)).toBeNull())
    expect(screen.queryByText(/no pudimos grabar/i)).toBeNull()
  })
})
