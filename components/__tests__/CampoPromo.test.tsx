import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CampoPromo from '@/components/plan/CampoPromo'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CampoPromo', () => {
  it('arranca colapsado: solo se ve el enlace "¿Tienes un código promocional?"', () => {
    render(<CampoPromo onValidada={vi.fn()} />)
    expect(screen.getByText('¿Tienes un código promocional?')).toBeTruthy()
    expect(screen.queryByLabelText('Código promocional')).toBeNull()
  })

  it('al abrirlo y validar un código bueno, muestra lo que otorga y llama a onValidada con el código, los meses y los vehículos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ valido: true, mesesGratis: 3, vehiculosIncluidos: 5 }),
        } as unknown as Response),
      ),
    )
    const onValidada = vi.fn()
    render(<CampoPromo onValidada={onValidada} />)
    fireEvent.click(screen.getByText('¿Tienes un código promocional?'))
    fireEvent.change(screen.getByLabelText('Código promocional'), { target: { value: 'tapcar-agosto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    await waitFor(() => expect(screen.getByText(/3 meses gratis/)).toBeTruthy())
    expect(screen.getByText(/cubre 5 vehículos/)).toBeTruthy()
    expect(onValidada).toHaveBeenLastCalledWith({
      codigo: 'tapcar-agosto',
      mesesGratis: 3,
      vehiculosIncluidos: 5,
    })
    expect(fetch).toHaveBeenCalledWith('/api/promo/validar', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ codigo: 'tapcar-agosto' }),
    }))
  })

  it('con un motivo de rechazo, muestra el mensaje en español y llama a onValidada(null)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ valido: false, motivo: 'expirado' }),
        } as unknown as Response),
      ),
    )
    const onValidada = vi.fn()
    render(<CampoPromo onValidada={onValidada} />)
    fireEvent.click(screen.getByText('¿Tienes un código promocional?'))
    fireEvent.change(screen.getByLabelText('Código promocional'), { target: { value: 'VENCIDO' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    await waitFor(() => expect(screen.getByText('Ese código venció.')).toBeTruthy())
    expect(onValidada).toHaveBeenLastCalledWith(null)
  })

  it('si el fetch RECHAZA (red caída), muestra el error y el botón vuelve a estar habilitado', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sin conexión'))))
    render(<CampoPromo onValidada={vi.fn()} />)
    fireEvent.click(screen.getByText('¿Tienes un código promocional?'))
    fireEvent.change(screen.getByLabelText('Código promocional'), { target: { value: 'CODIGO' } })
    const boton = screen.getByRole('button', { name: 'Aplicar' })
    fireEvent.click(boton)

    await waitFor(() => expect(boton).not.toBeDisabled())
    expect(screen.getByText('No se pudo revisar el código. Inténtalo de nuevo.')).toBeTruthy()
  })

  it('validar de nuevo limpia el resultado anterior antes de pedir (no se queda el "3 meses gratis" de un código que ya no está aplicado)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valido: true, mesesGratis: 3, vehiculosIncluidos: 5 }),
      } as unknown as Response)
      // Segunda llamada se queda pendiente para poder inspeccionar el estado
      // justo después de disparar la validación, antes de que resuelva.
      .mockImplementationOnce(() => new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)

    render(<CampoPromo onValidada={vi.fn()} />)
    fireEvent.click(screen.getByText('¿Tienes un código promocional?'))
    const input = screen.getByLabelText('Código promocional')
    fireEvent.change(input, { target: { value: 'BUENO' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.getByText(/3 meses gratis/)).toBeTruthy())

    fireEvent.change(input, { target: { value: 'OTRO' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

    await waitFor(() => expect(screen.queryByText(/3 meses gratis/)).toBeNull())
  })

  it('editar el código DESPUÉS de validar limpia el resultado sin apretar Aplicar (si no, "Continuar" canjearía el código viejo)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ valido: true, mesesGratis: 3, vehiculosIncluidos: 5 }),
        } as unknown as Response),
      ),
    )
    const onValidada = vi.fn()
    render(<CampoPromo onValidada={onValidada} />)
    fireEvent.click(screen.getByText('¿Tienes un código promocional?'))
    const input = screen.getByLabelText('Código promocional')
    fireEvent.change(input, { target: { value: 'CODIGOA' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(screen.getByText(/3 meses gratis/)).toBeTruthy())
    expect(onValidada).toHaveBeenLastCalledWith(
      expect.objectContaining({ codigo: 'CODIGOA' }),
    )

    // Escribe CODIGOB SIN apretar Aplicar de nuevo.
    fireEvent.change(input, { target: { value: 'CODIGOB' } })

    expect(screen.queryByText(/3 meses gratis/)).toBeNull()
    expect(onValidada).toHaveBeenLastCalledWith(null)
  })
})
