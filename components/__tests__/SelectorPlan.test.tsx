import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SelectorPlan from '@/components/plan/SelectorPlan'
import { LANZAMIENTO_HASTA } from '@/lib/plan/prueba'
import { fechaCalendario } from '@/lib/fecha'

// Dentro de la ventana de la promoción de lanzamiento, para no acoplar todos
// los tests existentes (que no le interesan a esta fecha) a la rama que sí se
// prueba aparte más abajo: `hoy` después de la ventana.
const HOY = '2026-08-06'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SelectorPlan', () => {
  it('arranca en mensual y muestra el cargo mensual del inicial', () => {
    render(<SelectorPlan inicial={3} hoy={HOY} />)
    const mensual = screen.getByRole('button', { name: /^Mensual/ })
    expect(mensual.getAttribute('aria-pressed')).toBe('true')
    // 3 vehículos × $2.990/mes = $8.970
    expect(screen.getByText('$8.970')).toBeTruthy()
  })

  it('al tocar "Anual" el monto cambia al anual y aparece "Ahorras al año"', () => {
    render(<SelectorPlan inicial={3} hoy={HOY} />)
    fireEvent.click(screen.getByRole('button', { name: /^Anual/ }))
    // 3 vehículos × $1.944 × 12 meses = $69.984
    expect(screen.getByText('$69.984')).toBeTruthy()
    expect(screen.getByText('Ahorras al año')).toBeTruthy()
  })

  it('los botones − y + cambian la cantidad; no baja de 1', () => {
    render(<SelectorPlan inicial={1} hoy={HOY} />)
    const input = screen.getByLabelText(/Cuántos vehículos/) as HTMLInputElement
    fireEvent.click(screen.getByRole('button', { name: 'Quitar un vehículo' }))
    expect(input.value).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Agregar un vehículo' }))
    expect(input.value).toBe('2')
  })

  it('con menos de 5 vehículos muestra el precio del chip; con 5 o más dice "Incluido"', () => {
    render(<SelectorPlan inicial={3} hoy={HOY} />)
    expect(screen.getByText(/\+ envío c\/u/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    expect(screen.getByText(/Incluido \(pagas el envío\)/)).toBeTruthy()
  })

  it('con 31 vehículos desaparece "Continuar" y aparece el botón de solicitud', () => {
    render(<SelectorPlan inicial={3} hoy={HOY} />)
    const input = screen.getByLabelText(/Cuántos vehículos/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '31' } })
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Solicitar plan para 31 vehículos' })).toBeTruthy()
  })

  it('"Continuar" hace POST a /api/plan con { periodicidad, maxVehiculos }', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
    render(<SelectorPlan inicial={3} hoy={HOY} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/plan', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ periodicidad: 'mensual', maxVehiculos: 3 }),
      }))
    })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(refresh).toHaveBeenCalled()
  })

  it('sobre el tope, el botón de solicitud hace POST con solicitados y navega igual al dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)))
    render(<SelectorPlan inicial={3} hoy={HOY} />)
    const input = screen.getByLabelText(/Cuántos vehículos/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar plan para 45 vehículos' }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/plan', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ periodicidad: 'mensual', maxVehiculos: 45, solicitados: 45 }),
      }))
    })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    expect(refresh).toHaveBeenCalled()
  })

  it('si el POST responde !ok con un error genérico, muestra el mensaje genérico y el botón vuelve a estar habilitado', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: 'cantidad inválida' }),
    } as unknown as Response)))
    render(<SelectorPlan inicial={3} hoy={HOY} />)
    const boton = screen.getByRole('button', { name: 'Continuar' })
    fireEvent.click(boton)
    await waitFor(() => expect(screen.getByText(/No se pudo guardar/)).toBeTruthy())
    expect(boton).not.toBeDisabled()
    expect(push).not.toHaveBeenCalled()
  })

  it('si el POST responde 409 cupo_menor_al_uso, muestra cuántos vehículos ya tiene', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: 'cupo_menor_al_uso', vehiculos: 10 }),
    } as unknown as Response)))
    render(<SelectorPlan inicial={3} hoy={HOY} />)
    const boton = screen.getByRole('button', { name: 'Continuar' })
    fireEvent.click(boton)
    await waitFor(() => expect(screen.getByText(/Ya tienes 10 vehículos cargados/)).toBeTruthy())
    expect(boton).not.toBeDisabled()
    expect(push).not.toHaveBeenCalled()
  })

  // /plan es un embudo obligatorio sin navegación: si el fetch rechaza (sin
  // conexión, timeout, DNS) el try/catch tiene que liberar el botón o el usuario
  // queda sin salida. Este es el caso que ningún test cubría.
  it('si el fetch rechaza (sin conexión), el botón vuelve a habilitarse', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin conexión'))))
    render(<SelectorPlan inicial={3} hoy={HOY} />)
    const boton = screen.getByRole('button', { name: 'Continuar' })
    fireEvent.click(boton)
    await waitFor(() => expect(boton).not.toBeDisabled())
    expect(screen.getByText(/No se pudo guardar/)).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  // El clamp del campo de entrada: escribir un valor menor a 1 debe quedarse en 1.
  it('escribir un valor negativo en el input lo clampa a 1', () => {
    render(<SelectorPlan inicial={3} hoy={HOY} />)
    const input = screen.getByLabelText(/Cuántos vehículos/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '-5' } })
    expect(input.value).toBe('1')
  })

  it('con un código validado, "Continuar" hace primero POST a /api/plan y después POST a /api/promo/canjear, en ese orden', async () => {
    const llamadas: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        llamadas.push(url)
        if (url === '/api/promo/validar') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ valido: true, mesesGratis: 3, vehiculosIncluidos: 5 }),
          } as unknown as Response)
        }
        return Promise.resolve({ ok: true } as Response)
      }),
    )
    render(<SelectorPlan inicial={3} hoy={HOY} />)

    fireEvent.click(screen.getByText('¿Tienes un código promocional?'))
    fireEvent.change(screen.getByLabelText('Código promocional'), { target: { value: 'TAPCAR' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.getByText(/3 meses gratis/)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    // La validación ocurre antes (al aplicar el código); lo que importa acá es
    // el orden relativo entre guardar el plan y canjear el código.
    const planIdx = llamadas.indexOf('/api/plan')
    const canjearIdx = llamadas.indexOf('/api/promo/canjear')
    expect(planIdx).toBeGreaterThanOrEqual(0)
    expect(canjearIdx).toBeGreaterThan(planIdx)
    expect(fetch).toHaveBeenCalledWith('/api/promo/canjear', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ codigo: 'TAPCAR' }),
    }))
  })

  it('si el canje falla, se muestra el mensaje que dice que el plan quedó guardado y NO se navega', async () => {
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
    render(<SelectorPlan inicial={3} hoy={HOY} />)

    fireEvent.click(screen.getByText('¿Tienes un código promocional?'))
    fireEvent.change(screen.getByLabelText('Código promocional'), { target: { value: 'TAPCAR' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.getByText(/3 meses gratis/)).toBeTruthy())

    const boton = screen.getByRole('button', { name: 'Continuar' })
    fireEvent.click(boton)

    // El plan sí quedó guardado (I3): el mensaje lo aclara. Y ya no es el
    // genérico de antes: trae el MOTIVO real ("agotado") traducido, porque
    // sin él el usuario reintenta el mismo código agotado para siempre sin
    // enterarse nunca de por qué falla — la carrera exacta para la que existe
    // la transacción del servidor.
    await waitFor(() => expect(screen.getByText(/Tu plan quedó guardado\./)).toBeTruthy())
    expect(screen.getByText(/Ese código ya se usó todas las veces disponibles\./)).toBeTruthy()
    expect(boton).not.toBeDisabled()
    expect(push).not.toHaveBeenCalled()
  })

  it('si el 409 del canje no trae un cuerpo JSON válido, igual muestra un mensaje (no deja la pantalla sin respuesta)', async () => {
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
    render(<SelectorPlan inicial={3} hoy={HOY} />)

    fireEvent.click(screen.getByText('¿Tienes un código promocional?'))
    fireEvent.change(screen.getByLabelText('Código promocional'), { target: { value: 'TAPCAR' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.getByText(/3 meses gratis/)).toBeTruthy())

    const boton = screen.getByRole('button', { name: 'Continuar' })
    fireEvent.click(boton)

    await waitFor(() => expect(screen.getByText(/Tu plan quedó guardado\./)).toBeTruthy())
    expect(boton).not.toBeDisabled()
    expect(push).not.toHaveBeenCalled()
  })

  // El pie del formulario depende de si `hoy` cae dentro de la ventana de la
  // promoción de lanzamiento (`gratisHastaDeAlta`). `hoy` llega como prop desde
  // el servidor y no se calcula en el cliente (ver comentario en el componente).
  describe('pie según la ventana de la promoción de lanzamiento', () => {
    it('con hoy dentro de la ventana, anuncia la promoción y la fecha límite', () => {
      render(<SelectorPlan inicial={3} hoy={LANZAMIENTO_HASTA} />)
      expect(
        screen.getByText(`Promoción de lanzamiento: no se cobra nada hasta el ${fechaCalendario(LANZAMIENTO_HASTA)}.`),
      ).toBeTruthy()
    })

    // Es la rama que nadie va a mirar hasta septiembre, y exactamente donde
    // una condición invertida (`<` en vez de `<=`, o mirar el prop al revés)
    // se escondería sin que ningún test la note.
    it('con hoy después de la ventana, dice que el cobro empieza al contratar (no promociona nada)', () => {
      const despues = '2026-09-02' // un día después de LANZAMIENTO_HASTA, inclusive
      render(<SelectorPlan inicial={3} hoy={despues} />)
      expect(screen.getByText('El cobro empieza al contratar.')).toBeTruthy()
      expect(screen.queryByText(/Promoción de lanzamiento: no se cobra nada/)).toBeNull()
    })
  })
})
