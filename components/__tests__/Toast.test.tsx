import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Toast from '@/components/Toast'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast', () => {
  it('muestra su contenido', () => {
    render(<Toast onCerrar={() => {}}>Ocultamos la guía</Toast>)
    expect(screen.getByText('Ocultamos la guía')).toBeTruthy()
  })

  it('es una región de estado para que un lector de pantalla lo anuncie', () => {
    render(<Toast onCerrar={() => {}}>Aviso</Toast>)
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
  })

  it('el botón de cerrar avisa al padre', () => {
    const onCerrar = vi.fn()
    render(<Toast onCerrar={onCerrar}>Aviso</Toast>)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('se cierra solo al cumplirse la duración', () => {
    const onCerrar = vi.fn()
    render(<Toast onCerrar={onCerrar} duracionMs={5000}>Aviso</Toast>)
    expect(onCerrar).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(4999) })
    expect(onCerrar).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(onCerrar).toHaveBeenCalledTimes(1)
  })

  it('al desmontarse cancela el temporizador, para no avisar sobre un padre que ya no está', () => {
    const onCerrar = vi.fn()
    const { unmount } = render(<Toast onCerrar={onCerrar} duracionMs={5000}>Aviso</Toast>)
    unmount()
    act(() => { vi.advanceTimersByTime(10000) })
    expect(onCerrar).not.toHaveBeenCalled()
  })
})
