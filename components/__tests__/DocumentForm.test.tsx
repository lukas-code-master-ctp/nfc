import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Pagina } from '@/lib/documentos/paginas'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

const subirPaginas = vi.fn()
vi.mock('@/lib/documentos/subir', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/documentos/subir')>()),
  subirPaginas: (...a: unknown[]) => subirPaginas(...a),
}))

import DocumentForm from '@/components/DocumentForm'
import AvisosOnboarding from '@/components/onboarding/AvisosOnboarding'
import { TITULOS } from '@/lib/onboarding/pasos'
import { ErrorPagina } from '@/lib/documentos/subir'

beforeAll(() => {
  URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name}`)
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  push.mockReset(); refresh.mockReset()
  subirPaginas.mockReset()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function foto(nombre: string): File {
  return new File(['x'], nombre, { type: 'image/jpeg' })
}

/** Asigna archivos al input de SelectorPaginas: en jsdom `files` es de solo lectura. */
function elegir(archivos: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: archivos, configurable: true })
  fireEvent.change(input)
}

function abrirFormulario() {
  fireEvent.click(screen.getByRole('button', { name: /agregar documento/i }))
}

describe('aviso del paso "Sube sus documentos"', () => {
  const subirYGuardar = async () => {
    abrirFormulario()
    elegir([foto('a.jpg')])
    subirPaginas.mockResolvedValue({ filePath: 'vehicles/v1/doc.jpg' })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  }

  it('avisa al subir el primero del vehículo', async () => {
    render(
      <AvisosOnboarding activo>
        <DocumentForm vehicleId="v1" sinDocumentos />
      </AvisosOnboarding>,
    )
    await subirYGuardar()
    expect(screen.getByRole('status').textContent).toContain(TITULOS.documentos)
  })

  it('NO avisa si el vehículo ya tenía documentos: el paso estaba completo', async () => {
    render(
      <AvisosOnboarding activo>
        <DocumentForm vehicleId="v1" sinDocumentos={false} />
      </AvisosOnboarding>,
    )
    await subirYGuardar()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('NO avisa con el onboarding terminado u oculto', async () => {
    render(
      <AvisosOnboarding activo={false}>
        <DocumentForm vehicleId="v1" sinDocumentos />
      </AvisosOnboarding>,
    )
    await subirYGuardar()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('DocumentForm', () => {
  it('al cancelar con páginas agregadas, reabrir no deja miniaturas ni contador fantasma (regresión)', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrirFormulario()
    elegir([foto('a.jpg'), foto('b.jpg')])
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByText(/2 de \d+ páginas/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    abrirFormulario()

    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.queryByText(/de \d+ páginas/)).toBeNull()
  })

  it('guardar está deshabilitado sin archivo y se habilita al agregar una foto', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrirFormulario()
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveProperty('disabled', true)

    elegir([foto('a.jpg')])
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveProperty('disabled', false)
  })

  it('una foto ilegible marca su miniatura y muestra el error del formulario', async () => {
    render(<DocumentForm vehicleId="v1" />)
    abrirFormulario()
    elegir([foto('a.jpg'), foto('b.jpg')])

    subirPaginas.mockImplementation((_vehicleId: string, paginas: Pagina[]) =>
      Promise.reject(new ErrorPagina(paginas[1].id)),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/una de las fotos no se pudo leer/i)

    const paginasLlamada = subirPaginas.mock.calls[0][1] as Pagina[]
    expect(paginasLlamada[1].id).toBeTruthy()

    const items = document.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).not.toMatch(/no pudimos leer esta foto/i)
    expect(items[1].textContent).toMatch(/no pudimos leer esta foto/i)
  })

  it('al borrar la página marcada, el error del formulario desaparece', async () => {
    render(<DocumentForm vehicleId="v1" />)
    abrirFormulario()
    elegir([foto('a.jpg'), foto('b.jpg')])

    subirPaginas.mockImplementation((_vehicleId: string, paginas: Pagina[]) =>
      Promise.reject(new ErrorPagina(paginas[1].id)),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: /quitar página 2/i }))

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('el selector no ofrece tipos que el vehículo ya tiene', () => {
  const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Agregar documento/i }))
  const opciones = () =>
    [...(screen.getByLabelText(/Tipo de documento/i) as HTMLSelectElement).options].map((o) => o.text)

  it('un tipo ya cargado desaparece de la lista', () => {
    render(<DocumentForm vehicleId="v1" tiposUsados={['soap']} />)
    abrir()
    expect(opciones()).not.toContain('SOAP')
    expect(opciones()).toContain('Permiso de Circulación')
  })

  // `otro` es el cajón para todo lo demás: tiene que poder repetirse.
  it('"Otro" sigue disponible aunque ya haya uno', () => {
    render(<DocumentForm vehicleId="v1" tiposUsados={['otro']} />)
    abrir()
    expect(opciones()).toContain('Otro')
  })

  // Si el formulario abriera en un tipo ya usado, el <select> mostraría un
  // valor que no está entre sus opciones: en blanco.
  it('abre en el primer tipo disponible, no en uno ya usado', () => {
    render(<DocumentForm vehicleId="v1" tiposUsados={['permiso_circulacion']} />)
    abrir()
    const select = screen.getByLabelText(/Tipo de documento/i) as HTMLSelectElement
    expect(select.value).not.toBe('permiso_circulacion')
    expect(opciones()).toContain(select.selectedOptions[0].text)
  })

  it('el Certificado de Gases ya no se ofrece y el de Homologación sí', () => {
    render(<DocumentForm vehicleId="v1" />)
    abrir()
    expect(opciones()).not.toContain('Certificado de Gases')
    expect(opciones()).toContain('Certificado de Homologación')
  })

  it('con todos los tipos cargados queda solo "Otro"', () => {
    render(
      <DocumentForm
        vehicleId="v1"
        tiposUsados={['permiso_circulacion', 'revision_tecnica', 'soap', 'certificado_homologacion', 'padron']}
      />,
    )
    abrir()
    expect(opciones()).toEqual(['Otro'])
  })
})
