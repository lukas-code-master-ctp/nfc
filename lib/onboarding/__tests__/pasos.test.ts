import { describe, it, expect } from 'vitest'
import {
  pasosDe,
  todosListos,
  primerPendiente,
  esPasoInformativo,
  debeElegirTipo,
  debeMostrarTarjeta,
  type Senales,
} from '@/lib/onboarding/pasos'

// Cuenta recién creada: nada hecho todavía.
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

const con = (parcial: Partial<Senales>): Senales => ({ ...VACIAS, ...parcial })
const listo = (pasos: ReturnType<typeof pasosDe>, id: string) =>
  pasos.find((p) => p.id === id)!.listo

describe('pasosDe — cuántos pasos según el tipo de cuenta', () => {
  it('personal tiene 3 pasos', () => {
    const pasos = pasosDe('personal', VACIAS)
    expect(pasos.map((p) => p.id)).toEqual(['vehiculo', 'documentos', 'chip'])
  })

  it('empresa tiene 9 pasos y empieza por los mismos 3', () => {
    const pasos = pasosDe('empresa', VACIAS)
    expect(pasos.map((p) => p.id)).toEqual([
      'vehiculo', 'documentos', 'chip',
      'empresa', 'categorias', 'mantencion', 'equipo', 'conductores', 'reportes',
    ])
  })

  it('el vehículo va primero incluso en cuenta de empresa', () => {
    expect(pasosDe('empresa', VACIAS)[0].id).toBe('vehiculo')
  })
})

describe('pasosDe — cada señal marca su propio paso y ningún otro', () => {
  it('con las señales vacías no hay ningún paso listo', () => {
    expect(pasosDe('empresa', VACIAS).some((p) => p.listo)).toBe(false)
  })

  it('un vehículo marca solo "vehiculo"', () => {
    const pasos = pasosDe('empresa', con({ vehiculos: 1, primerVehiculoId: 'v1' }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['vehiculo'])
  })

  it('un documento marca solo "documentos"', () => {
    const pasos = pasosDe('empresa', con({ documentos: 2 }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['documentos'])
  })

  it('la razón social marca solo "empresa", y en blanco no cuenta', () => {
    expect(listo(pasosDe('empresa', con({ razonSocial: 'Transportes SpA' })), 'empresa')).toBe(true)
    expect(listo(pasosDe('empresa', con({ razonSocial: '   ' })), 'empresa')).toBe(false)
  })

  it('una categoría marca solo "categorias"', () => {
    const pasos = pasosDe('empresa', con({ categorias: 1 }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['categorias'])
  })

  it('la pauta marca solo "mantencion"', () => {
    const pasos = pasosDe('empresa', con({ pautaConfigurada: true }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['mantencion'])
  })

  it('un conductor marca solo "conductores"', () => {
    const pasos = pasosDe('empresa', con({ conductores: 1 }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['conductores'])
  })
})

describe('pasosDe — el paso de equipo acepta dos señales distintas', () => {
  it('estar solo no basta', () => {
    expect(listo(pasosDe('empresa', con({ miembros: 1 })), 'equipo')).toBe(false)
  })

  it('un segundo miembro lo marca', () => {
    expect(listo(pasosDe('empresa', con({ miembros: 2 })), 'equipo')).toBe(true)
  })

  it('una invitación pendiente también lo marca, aunque nadie la haya aceptado', () => {
    expect(listo(pasosDe('empresa', con({ invitacionesPendientes: 1 })), 'equipo')).toBe(true)
  })
})

describe('pasosDe — los pasos informativos dependen solo de "vistos"', () => {
  it('el chip se marca al reconocerlo, sin importar los datos', () => {
    expect(listo(pasosDe('personal', VACIAS), 'chip')).toBe(false)
    expect(listo(pasosDe('personal', con({ vistos: ['chip'] })), 'chip')).toBe(true)
  })

  it('reportes se marca al reconocerlo', () => {
    expect(listo(pasosDe('empresa', con({ vistos: ['reportes'] })), 'reportes')).toBe(true)
  })

  it('reconocer un paso no marca ningún otro', () => {
    const pasos = pasosDe('empresa', con({ vistos: ['chip'] }))
    expect(pasos.filter((p) => p.listo).map((p) => p.id)).toEqual(['chip'])
  })

  it('esPasoInformativo solo acepta los dos conocidos', () => {
    expect(esPasoInformativo('chip')).toBe(true)
    expect(esPasoInformativo('reportes')).toBe(true)
    expect(esPasoInformativo('vehiculo')).toBe(false)
    expect(esPasoInformativo('cualquier-cosa')).toBe(false)
  })
})

describe('pasosDe — los enlaces a la ficha necesitan un vehículo', () => {
  it('con vehículo apuntan a su ficha, en la pestaña correcta', () => {
    const pasos = pasosDe('personal', con({ vehiculos: 1, primerVehiculoId: 'abc' }))
    expect(pasos.find((p) => p.id === 'documentos')!.href).toBe('/vehiculos/abc#documentos')
    expect(pasos.find((p) => p.id === 'chip')!.href).toBe('/vehiculos/abc#ajustes')
  })

  it('sin vehículo todavía no tienen destino', () => {
    const pasos = pasosDe('personal', VACIAS)
    expect(pasos.find((p) => p.id === 'documentos')!.href).toBeNull()
    expect(pasos.find((p) => p.id === 'chip')!.href).toBeNull()
  })
})

describe('todosListos — es lo que dispara el enganche de completadoEn', () => {
  it('es falso mientras quede un paso pendiente', () => {
    expect(todosListos(pasosDe('personal', con({ vehiculos: 1, documentos: 1, primerVehiculoId: 'v1' })))).toBe(false)
  })

  it('es verdadero con todos los pasos de cuenta personal listos', () => {
    const pasos = pasosDe('personal', con({
      vehiculos: 1, documentos: 1, primerVehiculoId: 'v1', vistos: ['chip'],
    }))
    expect(todosListos(pasos)).toBe(true)
  })

  it('es verdadero con todos los pasos de cuenta empresa listos', () => {
    const pasos = pasosDe('empresa', con({
      vehiculos: 1, documentos: 1, primerVehiculoId: 'v1',
      razonSocial: 'Transportes SpA', categorias: 1, pautaConfigurada: true,
      miembros: 2, conductores: 1, vistos: ['chip', 'reportes'],
    }))
    expect(todosListos(pasos)).toBe(true)
  })
})

describe('primerPendiente — el paso que la tarjeta muestra contraída', () => {
  it('sin nada hecho es el primero de la lista', () => {
    expect(primerPendiente(pasosDe('empresa', VACIAS))!.id).toBe('vehiculo')
  })

  it('salta los que ya están listos, aunque estén intercalados', () => {
    // vehiculo y documentos listos, chip pendiente: el siguiente es chip.
    const pasos = pasosDe('empresa', con({ vehiculos: 1, documentos: 1, primerVehiculoId: 'v1' }))
    expect(primerPendiente(pasos)!.id).toBe('chip')
  })

  it('respeta el orden de la lista y no devuelve un pendiente posterior', () => {
    // Con las categorías hechas pero el vehículo no, sigue tocando el vehículo.
    const pasos = pasosDe('empresa', con({ categorias: 1 }))
    expect(primerPendiente(pasos)!.id).toBe('vehiculo')
  })

  it('es null cuando no queda ninguno', () => {
    const pasos = pasosDe('personal', con({
      vehiculos: 1, documentos: 1, primerVehiculoId: 'v1', vistos: ['chip'],
    }))
    expect(todosListos(pasos)).toBe(true)
    expect(primerPendiente(pasos)).toBeNull()
  })
})

describe('debeElegirTipo — el portero', () => {
  it('sin onboarding y siendo Administrador, hay que elegir', () => {
    expect(debeElegirTipo(undefined, true)).toBe(true)
  })

  it('sin onboarding pero sin permisos (Editor o Visor), no se le pregunta', () => {
    expect(debeElegirTipo(undefined, false)).toBe(false)
  })

  it('con tipo ya elegido, no se vuelve a preguntar', () => {
    expect(debeElegirTipo({ tipoCuenta: 'personal', vistos: [] }, true)).toBe(false)
  })
})

describe('debeMostrarTarjeta — cuándo se renderiza el checklist', () => {
  it('con tipo elegido y sin terminar, se muestra', () => {
    expect(debeMostrarTarjeta({ tipoCuenta: 'empresa', vistos: [] }, true)).toBe(true)
  })

  it('no se muestra a quien no puede configurar', () => {
    expect(debeMostrarTarjeta({ tipoCuenta: 'empresa', vistos: [] }, false)).toBe(false)
  })

  it('no se muestra sin onboarding: primero hay que elegir tipo', () => {
    expect(debeMostrarTarjeta(undefined, true)).toBe(false)
  })

  it('no se muestra una vez completado', () => {
    expect(debeMostrarTarjeta({ tipoCuenta: 'empresa', vistos: [], completadoEn: '2026-07-29T00:00:00.000Z' }, true)).toBe(false)
  })

  it('no se muestra si se descartó a mano', () => {
    expect(debeMostrarTarjeta({ tipoCuenta: 'empresa', vistos: [], descartadoEn: '2026-07-29T00:00:00.000Z' }, true)).toBe(false)
  })

  it('descartadoEn en null significa que se volvió a mostrar', () => {
    expect(debeMostrarTarjeta({ tipoCuenta: 'empresa', vistos: [], descartadoEn: null }, true)).toBe(true)
  })
})
