import { describe, it, expect } from 'vitest'
import {
  COLUMNAS,
  SEPARADOR,
  BOM,
  escaparCampo,
  filaDeEmpresa,
  construirCsv,
  nombreArchivo,
  type FilaExport,
} from '@/lib/admin/exportar'
import { PRICE_PER_VEHICLE, PRICE_PER_VEHICLE_ANUAL_MES, MESES_ANUAL } from '@/lib/billing'

const HOY = '2026-08-05'

function empresa(over: Partial<FilaExport> = {}): FilaExport {
  return {
    razonSocial: 'Transportes Lira SpA',
    ownerEmail: 'lira@ejemplo.cl',
    rut: '76.123.456-7',
    telefono: '+56912345678',
    tipoCuenta: 'empresa',
    maxVehiculos: 10,
    vehicleCount: 8,
    periodicidad: 'mensual',
    gratisHasta: null,
    promo: null,
    createdAt: '2026-01-15T10:30:00.000Z',
    ultimaConexion: '2026-08-04',
    ...over,
  }
}

/** El índice de una columna por su nombre, para no contar posiciones a mano. */
function col(nombre: (typeof COLUMNAS)[number]): number {
  return COLUMNAS.indexOf(nombre)
}

describe('escaparCampo', () => {
  it('deja pasar un texto simple sin tocarlo', () => {
    expect(escaparCampo('Transportes Lira')).toBe('Transportes Lira')
  })

  it('entrecomilla si el texto trae el separador', () => {
    expect(escaparCampo('Lira; Hermanos')).toBe('"Lira; Hermanos"')
  })

  it('duplica las comillas internas', () => {
    expect(escaparCampo('Bus "El Rápido"')).toBe('"Bus ""El Rápido"""')
  })

  it('entrecomilla los saltos de línea', () => {
    expect(escaparCampo('Av. Siempre Viva\n1234')).toBe('"Av. Siempre Viva\n1234"')
  })

  // Excel ejecuta como fórmula cualquier celda que empiece así, y la razón
  // social la escribe el cliente: es entrada hostil que abre un administrador.
  describe('inyección de fórmulas', () => {
    it.each(['=1+1', '+1', '-1+1', '@SUM(A1)'])('neutraliza %s con un apóstrofo', (raw) => {
      expect(escaparCampo(raw)).toBe(`'${raw}`)
    })

    it('neutraliza el clásico HYPERLINK aunque además lleve separador', () => {
      expect(escaparCampo('=HYPERLINK("http://x";"a")')).toBe(
        '"\'=HYPERLINK(""http://x"";""a"")"',
      )
    })

    // Sin esta rama un monto negativo se volvería el texto `'-500` y la
    // columna dejaría de poder sumarse en Excel.
    it('un número NO lleva la guarda, ni siquiera negativo', () => {
      expect(escaparCampo(-500)).toBe('-500')
      expect(escaparCampo(8970)).toBe('8970')
    })
  })
})

describe('filaDeEmpresa', () => {
  it('tiene exactamente una celda por columna', () => {
    expect(filaDeEmpresa(empresa(), HOY)).toHaveLength(COLUMNAS.length)
  })

  it('los montos son números crudos, no texto con $', () => {
    const fila = filaDeEmpresa(empresa(), HOY)
    expect(fila[col('Valor del ticket (CLP)')]).toBe(10 * PRICE_PER_VEHICLE)
    expect(typeof fila[col('Cobro actual (CLP)')]).toBe('number')
  })

  it('el plan anual se valoriza al precio anual', () => {
    const fila = filaDeEmpresa(empresa({ periodicidad: 'anual' }), HOY)
    expect(fila[col('Periodicidad')]).toBe('Anual')
    expect(fila[col('Valor del ticket (CLP)')]).toBe(10 * PRICE_PER_VEHICLE_ANUAL_MES * MESES_ANUAL)
  })

  it('el cupo del plan manda sobre los vehículos registrados', () => {
    // Se cobra el cupo contratado, no lo que el cliente alcanzó a cargar.
    const fila = filaDeEmpresa(empresa({ maxVehiculos: 10, vehicleCount: 2 }), HOY)
    expect(fila[col('Valor del ticket (CLP)')]).toBe(10 * PRICE_PER_VEHICLE)
  })

  describe('fases de cobro', () => {
    it('en prueba el cobro actual es 0 pero el ticket sigue a la vista', () => {
      const fila = filaDeEmpresa(empresa({ gratisHasta: '2026-09-01' }), HOY)
      expect(fila[col('Fase')]).toBe('Prueba')
      expect(fila[col('Cobro actual (CLP)')]).toBe(0)
      expect(fila[col('Valor del ticket (CLP)')]).toBe(10 * PRICE_PER_VEHICLE)
      expect(fila[col('Fin de prueba')]).toBe('01/09/2026')
    })

    it('el último día de la prueba todavía es prueba', () => {
      expect(filaDeEmpresa(empresa({ gratisHasta: HOY }), HOY)[col('Fase')]).toBe('Prueba')
    })

    it('con promoción vigente se descuentan los vehículos cubiertos', () => {
      const fila = filaDeEmpresa(
        empresa({
          gratisHasta: '2026-07-01',
          promo: {
            codigo: 'LANZAMIENTO',
            mesesGratis: 3,
            vehiculosIncluidos: 4,
            canjeadoEn: '2026-06-01T00:00:00.000Z',
            hasta: '2026-10-01',
          },
        }),
        HOY,
      )
      expect(fila[col('Fase')]).toBe('Promoción')
      expect(fila[col('Cobro actual (CLP)')]).toBe(6 * PRICE_PER_VEHICLE)
      expect(fila[col('Valor del ticket (CLP)')]).toBe(10 * PRICE_PER_VEHICLE)
      expect(fila[col('Código promocional')]).toBe('LANZAMIENTO')
      expect(fila[col('Promoción hasta')]).toBe('01/10/2026')
    })

    // Es el bug que `coberturaDe` existe para evitar: la promoción es una
    // copia congelada que no se borra sola, así que leerla sin mirar la fecha
    // dejaría a esta empresa pagando de menos para siempre.
    it('con la promoción VENCIDA se cobra el plan completo', () => {
      const fila = filaDeEmpresa(
        empresa({
          gratisHasta: '2026-01-01',
          promo: {
            codigo: 'LANZAMIENTO',
            mesesGratis: 3,
            vehiculosIncluidos: 4,
            canjeadoEn: '2025-12-01T00:00:00.000Z',
            hasta: '2026-04-01',
          },
        }),
        HOY,
      )
      expect(fila[col('Fase')]).toBe('Plena')
      expect(fila[col('Cobro actual (CLP)')]).toBe(10 * PRICE_PER_VEHICLE)
      // El código sigue en la planilla: es el rastro de qué campaña la trajo.
      expect(fila[col('Código promocional')]).toBe('LANZAMIENTO')
    })

    it('sin prueba ni promoción cobra el ticket completo', () => {
      const fila = filaDeEmpresa(empresa(), HOY)
      expect(fila[col('Fase')]).toBe('Plena')
      expect(fila[col('Cobro actual (CLP)')]).toBe(fila[col('Valor del ticket (CLP)')])
    })
  })

  describe('datos que pueden faltar', () => {
    // Es el estado real de las cuentas anteriores al onboarding: no se
    // inventa "Empresa", se dice que no está definido.
    it('sin tipo de cuenta dice "Sin definir"', () => {
      expect(filaDeEmpresa(empresa({ tipoCuenta: null }), HOY)[col('Tipo de cuenta')]).toBe('Sin definir')
    })

    it('sin periodicidad dice "Sin elegir" y valoriza al precio mensual', () => {
      const fila = filaDeEmpresa(empresa({ periodicidad: null }), HOY)
      expect(fila[col('Periodicidad')]).toBe('Sin elegir')
      expect(fila[col('Valor del ticket (CLP)')]).toBe(10 * PRICE_PER_VEHICLE)
    })

    it('los campos ausentes quedan vacíos, nunca en "null"', () => {
      const fila = filaDeEmpresa(
        empresa({ gratisHasta: null, promo: null, createdAt: null, ultimaConexion: null, razonSocial: '' }),
        HOY,
      )
      for (const c of ['Fin de prueba', 'Código promocional', 'Promoción hasta', 'Fecha de alta', 'Última conexión'] as const) {
        expect(fila[col(c)]).toBe('')
      }
      // El nombre queda vacío en vez de repetir el correo: la columna de al
      // lado ya lo trae, y duplicarlo esconde a quién le falta la razón social.
      expect(fila[col('Nombre del cliente')]).toBe('')
    })

    it('la fecha de alta se muestra en dd/mm/aaaa', () => {
      expect(filaDeEmpresa(empresa(), HOY)[col('Fecha de alta')]).toBe('15/01/2026')
    })

    it('la última conexión se muestra en dd/mm/aaaa', () => {
      expect(filaDeEmpresa(empresa(), HOY)[col('Última conexión')]).toBe('04/08/2026')
    })
  })
})

describe('construirCsv', () => {
  it('abre con el BOM, o Excel rompe las tildes', () => {
    expect(construirCsv([], HOY).startsWith(BOM)).toBe(true)
  })

  it('la primera línea son los encabezados', () => {
    const [encabezado] = construirCsv([empresa()], HOY).slice(BOM.length).split('\r\n')
    expect(encabezado).toBe(COLUMNAS.join(SEPARADOR))
  })

  it('una línea por empresa, terminadas en CRLF', () => {
    const csv = construirCsv([empresa(), empresa({ ownerEmail: 'otra@ejemplo.cl' })], HOY)
    const lineas = csv.slice(BOM.length).split('\r\n').filter(Boolean)
    expect(lineas).toHaveLength(3) // encabezado + 2
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('sin empresas deja igual el encabezado, no un archivo vacío', () => {
    expect(construirCsv([], HOY).slice(BOM.length)).toBe(COLUMNAS.join(SEPARADOR) + '\r\n')
  })

  it('un nombre con el separador no corre las columnas', () => {
    const csv = construirCsv([empresa({ razonSocial: 'Lira; Hermanos' })], HOY)
    const fila = csv.slice(BOM.length).split('\r\n')[1]
    expect(fila.startsWith('"Lira; Hermanos";')).toBe(true)
    // 16 columnas ⇒ 15 separadores fuera de comillas.
    expect(fila.replace(/"[^"]*"/g, '').split(SEPARADOR)).toHaveLength(COLUMNAS.length)
  })
})

describe('nombreArchivo', () => {
  it('lleva la fecha, para que dos descargas no se pisen', () => {
    expect(nombreArchivo(HOY)).toBe('tapcar-clientes-2026-08-05.csv')
  })
})
