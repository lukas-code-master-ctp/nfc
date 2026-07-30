import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import AvisosOnboarding, { useAvisoPaso } from '@/components/onboarding/AvisosOnboarding'
import { TITULOS, type PasoId } from '@/lib/onboarding/pasos'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

/** Un formulario cualquiera que avisa haber completado su paso al guardar. */
function FormularioFalso({ paso = 'categorias' }: { paso?: PasoId }) {
  const avisarPaso = useAvisoPaso()
  return <button onClick={() => avisarPaso(paso)}>Guardar</button>
}

beforeEach(() => {
  vi.useFakeTimers()
})

const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

describe('con el onboarding en curso', () => {
  it('avisa el paso por su título, el mismo que usa el checklist', () => {
    render(<AvisosOnboarding activo><FormularioFalso /></AvisosOnboarding>)
    expect(screen.queryByRole('status')).toBeNull()
    guardar()
    expect(screen.getByRole('status').textContent).toContain(TITULOS.categorias)
  })

  it('ofrece volver al dashboard a ver el progreso', () => {
    render(<AvisosOnboarding activo><FormularioFalso /></AvisosOnboarding>)
    guardar()
    expect(screen.getByRole('link', { name: /Ver tu progreso/ }).getAttribute('href')).toBe('/dashboard')
  })

  it('se cierra solo, como cualquier toast', () => {
    render(<AvisosOnboarding activo><FormularioFalso /></AvisosOnboarding>)
    guardar()
    expect(screen.getByRole('status')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(7000) })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('nombra el paso que se completó, no siempre el mismo', () => {
    render(<AvisosOnboarding activo><FormularioFalso paso="conductores" /></AvisosOnboarding>)
    guardar()
    expect(screen.getByRole('status').textContent).toContain(TITULOS.conductores)
  })
})

describe('con el onboarding terminado u oculto', () => {
  it('no avisa nada: el paso ya no es novedad', () => {
    render(<AvisosOnboarding activo={false}><FormularioFalso /></AvisosOnboarding>)
    guardar()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('fuera del proveedor', () => {
  it('el formulario puede llamar a avisarPaso sin romperse', () => {
    // Los formularios de Configuración también se montan en otras páginas; el
    // hook devuelve una función inerte para que no tengan que preguntar.
    expect(() => {
      render(<FormularioFalso />)
      guardar()
    }).not.toThrow()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
