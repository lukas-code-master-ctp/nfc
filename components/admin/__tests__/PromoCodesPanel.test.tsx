import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PromoCodesPanel from '@/components/admin/PromoCodesPanel'

afterEach(() => {
  vi.unstubAllGlobals()
})

// C1: los dos campos son obligatorios (mínimo 1), no un OR/AND entre ellos —
// ver app/api/__tests__/admin-promo-codes.test.ts para la misma regla del
// lado del servidor. Acá se prueba que el botón "Crear código" nunca se
// habilita con un valor en 0 en cualquiera de los dos.
describe('PromoCodesPanel', () => {
  function llenarCodigo() {
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'TAPCAR-AGOSTO' } })
  }

  it('arranca con mesesGratis=1 y vehiculosIncluidos=1 (ambos válidos por default)', () => {
    render(<PromoCodesPanel codigos={[]} />)
    expect((screen.getByLabelText('Meses gratis') as HTMLInputElement).value).toBe('1')
    expect((screen.getByLabelText('Vehículos incluidos') as HTMLInputElement).value).toBe('1')
  })

  it('con mesesGratis en 0, el botón queda deshabilitado (aunque vehiculosIncluidos sea válido)', () => {
    render(<PromoCodesPanel codigos={[]} />)
    llenarCodigo()
    fireEvent.change(screen.getByLabelText('Meses gratis'), { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Crear código' })).toBeDisabled()
  })

  it('con vehiculosIncluidos en 0, el botón queda deshabilitado (aunque mesesGratis sea válido)', () => {
    render(<PromoCodesPanel codigos={[]} />)
    llenarCodigo()
    fireEvent.change(screen.getByLabelText('Vehículos incluidos'), { target: { value: '0' } })
    expect(screen.getByRole('button', { name: 'Crear código' })).toBeDisabled()
  })

  it('con ambos en 1 y el código lleno, el botón se habilita', () => {
    render(<PromoCodesPanel codigos={[]} />)
    llenarCodigo()
    expect(screen.getByRole('button', { name: 'Crear código' })).not.toBeDisabled()
  })

  it('muestra la ayuda de "vehículos incluidos" con el máximo (100) para cubrir cualquier flota', () => {
    render(<PromoCodesPanel codigos={[]} />)
    expect(screen.getByText(/usa 100/i)).toBeTruthy()
    expect(screen.getByText(/tope self-service de un plan es 30/)).toBeTruthy()
  })

  it('un error crudo del servidor ("codigo inválido") se muestra traducido, no tal cual', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'codigo inválido' }),
        } as unknown as Response),
      ),
    )
    render(<PromoCodesPanel codigos={[]} />)
    llenarCodigo()
    fireEvent.click(screen.getByRole('button', { name: 'Crear código' }))

    await screen.findByText(/El código no puede quedar vacío tras normalizarlo/)
    expect(screen.queryByText('codigo inválido')).toBeNull()
  })
})
