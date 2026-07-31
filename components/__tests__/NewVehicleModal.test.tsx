import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NewVehicleModal from '@/components/NewVehicleModal'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({}) }))
})

/**
 * Este es el test que faltaba: `MarcaInput` aislado nunca podía ver el bug,
 * porque el listener de Escape que cierra el modal vive en `NewVehicleModal`,
 * un nodo hermano (no ancestro) del que React usa para delegar sus propios
 * eventos. Solo montando el modal real se reproduce la carrera entre ambos
 * listeners de `document`.
 */
describe('Escape en el campo Marca, dentro del modal real', () => {
  it('con la lista de sugerencias desplegada, cierra la lista pero NO el modal', () => {
    const onClose = vi.fn()
    render(<NewVehicleModal open onClose={onClose} />)
    const marca = screen.getByPlaceholderText('Marca')

    fireEvent.change(marca, { target: { value: 'sub' } })
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)

    fireEvent.keyDown(marca, { key: 'Escape' })

    expect(screen.queryAllByRole('option')).toHaveLength(0) // la lista se cerró…
    expect(onClose).not.toHaveBeenCalled() // …pero el modal (y lo escrito) sigue en pie
    expect((marca as HTMLInputElement).value).toBe('sub')
  })

  it('un segundo Escape, con la lista ya cerrada, sí cierra el modal', () => {
    const onClose = vi.fn()
    render(<NewVehicleModal open onClose={onClose} />)
    const marca = screen.getByPlaceholderText('Marca')

    fireEvent.change(marca, { target: { value: 'sub' } })
    fireEvent.keyDown(marca, { key: 'Escape' }) // cierra la lista
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(marca, { key: 'Escape' }) // ahora sí cierra el modal

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sin lista desplegada, Escape cierra el modal directamente', () => {
    const onClose = vi.fn()
    render(<NewVehicleModal open onClose={onClose} />)
    const marca = screen.getByPlaceholderText('Marca')

    fireEvent.keyDown(marca, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
