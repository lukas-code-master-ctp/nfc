import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PanelPromo from '@/components/plan/PanelPromo'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

beforeEach(() => {
  refresh.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Aplica un código válido en el `CampoPromo` embebido, que dispara `canjear`
// automáticamente al validarse (a diferencia de `SelectorPlan`, acá el canje
// no espera un "Continuar" separado).
async function aplicarCodigoValido() {
  fireEvent.click(screen.getByText('¿Tienes un código promocional?'))
  fireEvent.change(screen.getByLabelText('Código promocional'), { target: { value: 'TAPCAR' } })
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(screen.getByText(/3 meses gratis/)).toBeTruthy())
}

describe('PanelPromo', () => {
  it('con un motivo de rechazo en el 409, muestra el motivo TRADUCIDO (no el genérico)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/promo/validar') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ valido: true, mesesGratis: 3, vehiculosIncluidos: 5 }),
          } as unknown as Response)
        }
        if (url === '/api/promo/canjear') {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'agotado' }),
          } as unknown as Response)
        }
        return Promise.resolve({ ok: true } as Response)
      }),
    )
    render(<PanelPromo />)
    await aplicarCodigoValido()

    // Sin leer el cuerpo del 409, este camino mostraba el genérico "No se
    // pudo canjear el código. Inténtalo de nuevo." — que es exactamente lo
    // mismo que ya había leído en /plan, sin enterarse nunca de que el
    // código se agotó (I3).
    await waitFor(() => expect(screen.getByText('Ese código ya se usó todas las veces disponibles.')).toBeTruthy())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('si el 409 no trae un cuerpo JSON válido, cae al mensaje genérico (no deja la pantalla sin respuesta)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/promo/validar') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ valido: true, mesesGratis: 3, vehiculosIncluidos: 5 }),
          } as unknown as Response)
        }
        if (url === '/api/promo/canjear') {
          return Promise.resolve({
            ok: false,
            json: () => Promise.reject(new Error('cuerpo no es JSON')),
          } as unknown as Response)
        }
        return Promise.resolve({ ok: true } as Response)
      }),
    )
    render(<PanelPromo />)
    await aplicarCodigoValido()

    await waitFor(() => expect(screen.getByText('No se pudo canjear el código. Inténtalo de nuevo.')).toBeTruthy())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('camino feliz: canjea y refresca', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/promo/validar') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ valido: true, mesesGratis: 3, vehiculosIncluidos: 5 }),
          } as unknown as Response)
        }
        return Promise.resolve({ ok: true } as Response)
      }),
    )
    render(<PanelPromo />)
    await aplicarCodigoValido()

    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})
