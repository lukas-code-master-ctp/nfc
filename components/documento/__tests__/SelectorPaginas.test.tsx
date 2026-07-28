import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import SelectorPaginas from '@/components/documento/SelectorPaginas'
import { MAX_PAGINAS, type Pagina } from '@/lib/documentos/paginas'

beforeAll(() => {
  // Una URL distinta por archivo: así el src de la miniatura delata QUÉ foto es,
  // que es lo único que hace observable el reordenamiento desde afuera.
  URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name}`)
  URL.revokeObjectURL = vi.fn()
})

beforeEach(() => {
  vi.mocked(URL.createObjectURL).mockClear()
  vi.mocked(URL.revokeObjectURL).mockClear()
})

/** El componente es controlado; el test necesita un padre que guarde el estado. */
function Host({ inicial = [], error = null }: { inicial?: Pagina[]; error?: string | null }) {
  const [paginas, setPaginas] = useState<Pagina[]>(inicial)
  return <SelectorPaginas paginas={paginas} onChange={setPaginas} paginaConError={error} />
}

function foto(nombre: string): File {
  return new File(['x'], nombre, { type: 'image/jpeg' })
}

function elegir(archivos: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: archivos, configurable: true })
  fireEvent.change(input)
}

function paginaFalsa(i: number): Pagina {
  return { id: `p${i}`, file: foto(`f${i}.jpg`), url: 'blob:falso' }
}

describe('SelectorPaginas', () => {
  it('parte vacío, invitando a agregar', () => {
    render(<Host />)
    expect(screen.getByRole('button', { name: /agregar archivo o foto/i })).toBeDefined()
  })

  it('acumula las fotos elegidas como miniaturas', () => {
    render(<Host />)
    elegir([foto('a.jpg')])
    expect(screen.getAllByRole('img')).toHaveLength(1)
    elegir([foto('b.jpg'), foto('c.jpg')])
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByText(new RegExp(`3 de ${MAX_PAGINAS} páginas`))).toBeDefined()
  })

  it('borrar una página la saca de la lista', () => {
    render(<Host />)
    elegir([foto('a.jpg'), foto('b.jpg')])
    fireEvent.click(screen.getAllByRole('button', { name: /quitar página/i })[0])
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('al borrar una página revoca exactamente su objectURL', () => {
    render(<Host />)
    elegir([foto('a.jpg'), foto('b.jpg')])
    fireEvent.click(screen.getAllByRole('button', { name: /quitar página/i })[0])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg')
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:b.jpg')
  })

  it('al desmontar el componente revoca las objectURL de todas las páginas', () => {
    const { unmount } = render(<Host />)
    elegir([foto('a.jpg'), foto('b.jpg')])
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:a.jpg')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:b.jpg')
  })

  it('al llegar al tope desactiva el botón y avisa cuántas quedaron fuera', () => {
    render(<Host inicial={Array.from({ length: 9 }, (_, i) => paginaFalsa(i))} />)
    elegir([foto('x.jpg'), foto('y.jpg'), foto('z.jpg')])
    expect(screen.getAllByRole('img')).toHaveLength(MAX_PAGINAS)
    expect(screen.getByRole('button', { name: /agregar otra página/i })).toHaveProperty('disabled', true)
    expect(screen.getByText(/2 quedaron fuera/i)).toBeDefined()
  })

  it('un PDF ocupa la lista completa y bloquea agregar más', () => {
    render(<Host />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'permiso.pdf', { type: 'application/pdf' })],
      configurable: true,
    })
    fireEvent.change(input)
    expect(screen.getByText('permiso.pdf')).toBeDefined()
    expect(screen.getByRole('button', { name: /agregar otra página/i })).toHaveProperty('disabled', true)
  })

  it('si se eligen fotos junto con un PDF, se queda solo con el PDF y avisa', () => {
    render(<Host />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', {
      value: [foto('a.jpg'), new File(['x'], 'permiso.pdf', { type: 'application/pdf' }), foto('b.jpg')],
      configurable: true,
    })
    fireEvent.change(input)
    expect(screen.getByText('permiso.pdf')).toBeDefined()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.getByText('Un PDF se sube solo, sin más páginas.')).toBeDefined()
  })

  it('reordena con las flechas', () => {
    render(<Host />)
    elegir([foto('a.jpg'), foto('b.jpg')])
    const orden = () => screen.getAllByRole('img').map((i) => i.getAttribute('src'))
    expect(orden()).toEqual(['blob:a.jpg', 'blob:b.jpg'])
    fireEvent.click(screen.getByRole('button', { name: /mover página 1 a la derecha/i }))
    expect(orden()).toEqual(['blob:b.jpg', 'blob:a.jpg'])
  })

  it('reordenar con las flechas no revoca ninguna objectURL', () => {
    render(<Host />)
    elegir([foto('a.jpg'), foto('b.jpg')])
    fireEvent.click(screen.getByRole('button', { name: /mover página 1 a la derecha/i }))
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('marca con un aviso solo la página que no se pudo leer', () => {
    const paginas = [paginaFalsa(0), paginaFalsa(1)]
    const { container } = render(<Host inicial={paginas} error="p1" />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0].textContent).not.toMatch(/no pudimos leer esta foto/i)
    expect(items[1].textContent).toMatch(/no pudimos leer esta foto/i)
  })
})
