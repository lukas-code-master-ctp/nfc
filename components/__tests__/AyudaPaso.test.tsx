import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AyudaPaso from '@/components/onboarding/AyudaPaso'
import { AYUDA } from '@/lib/onboarding/ayuda'
import type { PasoId } from '@/lib/onboarding/pasos'

const IDS = Object.keys(AYUDA) as PasoId[]

describe('AyudaPaso', () => {
  it('los nueve pasos renderizan sin explotar y con su mockup', () => {
    for (const id of IDS) {
      const { unmount, container } = render(<AyudaPaso pasoId={id} />)
      expect(container.querySelector('svg')).toBeTruthy()
      unmount()
    }
  })

  it('lista el cómo hacerlo del paso, en orden y como lista numerada', () => {
    const { container } = render(<AyudaPaso pasoId="documentos" />)
    const items = Array.from(container.querySelectorAll('ol li')).map((li) => li.textContent)
    expect(items).toEqual(AYUDA.documentos.comoHacerlo)
  })

  it('el mockup de formulario dibuja el campo y el botón del paso', () => {
    render(<AyudaPaso pasoId="equipo" />)
    expect(screen.getByText(AYUDA.equipo.campo!)).toBeTruthy()
    expect(screen.getByText(AYUDA.equipo.boton!)).toBeTruthy()
  })

  it('el mockup es decorativo: lo que enseña ya está escrito al lado', () => {
    const { container } = render(<AyudaPaso pasoId="chip" />)
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('todo el movimiento va con motion-safe, para respetar prefers-reduced-motion', () => {
    for (const id of IDS) {
      const { unmount, container } = render(<AyudaPaso pasoId={id} />)
      const animados = container.querySelectorAll('[class*="animate-mock-"]')
      for (const el of animados) {
        // OJO: en SVG `className` es un SVGAnimatedString, no un string.
        expect(el.getAttribute('class')).toContain('motion-safe:animate-mock-')
      }
      unmount()
    }
  })

  it('cada mockup animado tiene al menos un elemento en movimiento', () => {
    for (const id of IDS) {
      const { unmount, container } = render(<AyudaPaso pasoId={id} />)
      expect(container.querySelectorAll('[class*="animate-mock-"]').length).toBeGreaterThan(0)
      unmount()
    }
  })
})
