import { describe, it, expect } from 'vitest'
import { AYUDA, ayudaDe } from '@/lib/onboarding/ayuda'
import { pasosDe, type Senales } from '@/lib/onboarding/pasos'

const VACIAS: Senales = {
  vehiculos: 0,
  documentos: 0,
  primerVehiculoId: null,
  razonSocial: '',
  categorias: 0,
  pautaConfigurada: false,
  miembros: 1,
  invitacionesPendientes: 0,
  conductores: 0,
  vistos: [],
}

// La lista de cuenta empresa contiene los nueve pasos que existen.
const TODOS = pasosDe('empresa', VACIAS)

describe('cobertura', () => {
  it('los nueve pasos tienen ayuda', () => {
    for (const p of TODOS) expect(ayudaDe(p.id)).toBeDefined()
  })

  it('no hay ayuda de sobra para un paso que no existe', () => {
    expect(Object.keys(AYUDA).sort()).toEqual(TODOS.map((p) => p.id).sort())
  })
})

describe('contenido', () => {
  it('cada paso explica el cómo en al menos dos pasos concretos', () => {
    for (const p of TODOS) {
      const a = ayudaDe(p.id)
      expect(a.comoHacerlo.length).toBeGreaterThanOrEqual(2)
      for (const linea of a.comoHacerlo) expect(linea.trim().length).toBeGreaterThan(0)
    }
  })

  it('el mockup de formulario siempre trae qué campo y qué botón dibujar', () => {
    const conFormulario = TODOS.filter((p) => ayudaDe(p.id).mock === 'formulario')
    // Si esto queda en cero, el mockup reutilizable dejó de usarse y algo se rompió.
    expect(conFormulario.length).toBeGreaterThan(0)
    for (const p of conFormulario) {
      const a = ayudaDe(p.id)
      expect(a.campo && a.campo.trim().length).toBeTruthy()
      expect(a.boton && a.boton.trim().length).toBeTruthy()
    }
  })

  it('los mockups que no son formulario no traen campo ni botón: no los dibujan', () => {
    for (const p of TODOS) {
      const a = ayudaDe(p.id)
      if (a.mock === 'formulario') continue
      expect(a.campo).toBeUndefined()
      expect(a.boton).toBeUndefined()
    }
  })

  it('los pasos que enseñan un gesto físico o comparan pantallas no usan el formulario', () => {
    expect(ayudaDe('chip').mock).toBe('chip')
    expect(ayudaDe('documentos').mock).toBe('subida')
    expect(ayudaDe('vehiculo').mock).toBe('modal')
    expect(ayudaDe('reportes').mock).toBe('pantallas')
  })
})
