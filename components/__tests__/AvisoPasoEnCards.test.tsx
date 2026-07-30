import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AvisosOnboarding from '@/components/onboarding/AvisosOnboarding'
import CategoriasCard from '@/components/company/CategoriasCard'
import CompanyCard from '@/components/company/CompanyCard'
import { EMPTY_COMPANY } from '@/lib/types'
import { TITULOS } from '@/lib/onboarding/pasos'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)))
  vi.stubGlobal('confirm', () => true)
})

const conAvisos = (ui: React.ReactNode) => render(<AvisosOnboarding activo>{ui}</AvisosOnboarding>)

describe('categorías', () => {
  it('avisa al crear la primera', async () => {
    conAvisos(<CategoriasCard initial={[]} />)
    fireEvent.change(screen.getByPlaceholderText('Nueva categoría'), { target: { value: 'Camionetas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(TITULOS.categorias))
  })

  it('NO avisa al editarlas después: el paso ya estaba completo', async () => {
    conAvisos(<CategoriasCard initial={[{ id: 'a', nombre: 'Camionetas' }]} />)
    fireEvent.change(screen.getByPlaceholderText('Nueva categoría'), { target: { value: 'Arriendo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('datos de la empresa', () => {
  it('avisa al llenar la razón social por primera vez', async () => {
    conAvisos(<CompanyCard initial={EMPTY_COMPANY} />)
    fireEvent.change(screen.getByPlaceholderText(/Transportes Ejemplo SpA/), { target: { value: 'Transportes Andes SpA' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(TITULOS.empresa))
  })

  it('NO avisa al corregir otros datos si la razón social ya estaba', async () => {
    conAvisos(<CompanyCard initial={{ ...EMPTY_COMPANY, razonSocial: 'Transportes Andes SpA' }} />)
    fireEvent.change(screen.getByPlaceholderText(/76\.123\.456-7/), { target: { value: '76.123.456-7' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
  })
})
