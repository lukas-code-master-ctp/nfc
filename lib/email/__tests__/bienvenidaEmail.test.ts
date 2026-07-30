import { describe, it, expect } from 'vitest'
import { bienvenidaSubject, bienvenidaHtml } from '@/lib/email/bienvenidaEmail'
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

describe('asunto', () => {
  it('dice que la cuenta está lista, sin emojis', () => {
    expect(bienvenidaSubject()).toBe('Tu cuenta de TapCar está lista')
    expect(/\p{Extended_Pictographic}/u.test(bienvenidaSubject())).toBe(false)
  })
})

describe('contenido', () => {
  const html = bienvenidaHtml()

  it('va brandeado con el wordmark y el pie de TapCar', () => {
    expect(html).toContain('Tap<span')
    expect(html).toContain('app.tapcar.cl')
  })

  it('lleva un CTA al dashboard, como el resto de los correos', () => {
    expect(html).toContain('Abrir TapCar')
    expect(html).toMatch(/href="https?:\/\/[^"]+\/dashboard"/)
  })

  it('explica por qué le llega el correo', () => {
    expect(html).toContain('creaste una cuenta en TapCar')
  })

  it('el chip va en el llavero, no pegado al vehículo', () => {
    expect(html).toContain('llavero')
    expect(html).not.toContain('parabrisas')
  })
})

describe('coherencia con el checklist del dashboard', () => {
  it('enumera los mismos tres primeros pasos, y en el mismo orden', () => {
    // Si el onboarding reordena o renombra sus pasos iniciales, este correo
    // queda prometiendo otra cosa que la que el usuario va a ver al entrar.
    const tres = pasosDe('personal', VACIAS)
    expect(tres.map((p) => p.id)).toEqual(['vehiculo', 'documentos', 'chip'])

    const html = bienvenidaHtml()
    const posiciones = [
      html.indexOf('Agrega tu primer vehículo'),
      html.indexOf('Sube sus documentos'),
      html.indexOf('Vincula el chip NFC'),
    ]
    expect(posiciones.every((i) => i >= 0)).toBe(true)
    expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b))
    // Y son los títulos textuales de esos pasos, no una paráfrasis suelta.
    for (const p of tres) expect(html).toContain(p.titulo)
  })
})
