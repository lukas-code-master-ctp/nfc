/**
 * Armado del CSV de clientes del panel de administración. **Puro**: sin
 * Firebase y sin reloj (el día entra por parámetro), para poder testearlo.
 *
 * Es CSV y no un `.xlsx` de verdad a propósito: se abre con doble clic en
 * Excel igual, y un xlsx obligaría a sumar una dependencia de ~1 MB al
 * servidor para generar un archivo que nadie edita en la app.
 */

import { cargoDe } from '@/lib/billing'
import { faseDelPlan, coberturaDe, type FasePlan } from '@/lib/plan/fase'
import { fecha, fechaCalendario } from '@/lib/fecha'
import type { Periodicidad, PromoAplicada, TipoCuenta } from '@/lib/types'

/** Lo que el export necesita saber de una empresa. */
export interface FilaExport {
  razonSocial: string
  ownerEmail: string
  rut: string
  telefono: string
  tipoCuenta: TipoCuenta | null
  maxVehiculos: number
  vehicleCount: number
  periodicidad: Periodicidad | null
  gratisHasta: string | null
  promo: PromoAplicada | null
  /** ISO completo o `null`: cuándo se creó la empresa. */
  createdAt: string | null
  /** `YYYY-MM-DD` o `null`: la conexión más reciente de cualquier miembro. */
  ultimaConexion: string | null
}

export const COLUMNAS = [
  'Nombre del cliente',
  'Correo del titular',
  'Tipo de cuenta',
  'Vehículos en el plan',
  'Vehículos registrados',
  'Periodicidad',
  'Valor del ticket (CLP)',
  'Cobro actual (CLP)',
  'Fase',
  'Fin de prueba',
  'Código promocional',
  'Promoción hasta',
  'RUT',
  'Teléfono',
  'Fecha de alta',
  'Última conexión',
] as const

const ETIQUETA_FASE: Record<FasePlan, string> = {
  prueba: 'Prueba',
  promo: 'Promoción',
  plena: 'Plena',
}

const ETIQUETA_TIPO: Record<TipoCuenta, string> = {
  empresa: 'Empresa',
  personal: 'Personal',
}

/**
 * Separador de campos. Punto y coma y **no** coma: Excel en configuración
 * chilena espera el punto y coma como separador de listas, y con coma deja
 * las 16 columnas apretadas en una sola celda.
 */
export const SEPARADOR = ';'

/**
 * Marca de orden de bytes. Sin ella Excel abre el archivo en su codificación
 * local y las tildes y las eñes salen rotas ("Vehículos").
 */
export const BOM = '﻿'

/**
 * Excel interpreta como fórmula todo campo que empiece con `=`, `+`, `-`, `@`
 * o un control de tabulación. La razón social, el giro y el teléfono los
 * escribe el cliente, así que un valor hostil ahí se ejecutaría al abrir el
 * archivo en la máquina de un administrador. El apóstrofo lo neutraliza y
 * Excel no lo muestra en la celda.
 *
 * Los números pasan por otra rama y NO llevan la guarda: si no, un valor
 * negativo se convertiría en texto y dejaría de poder sumarse.
 */
export function escaparCampo(valor: string | number): string {
  if (typeof valor === 'number') return String(valor)

  const seguro = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

/**
 * Las 16 celdas de una empresa, en el orden de `COLUMNAS`.
 *
 * Los montos van como número crudo (sin `$` ni separador de miles): con el
 * formato puesto Excel los lee como texto y la columna deja de poder sumarse,
 * que es lo primero que uno hace con este archivo.
 */
export function filaDeEmpresa(e: FilaExport, hoy: string): (string | number)[] {
  const fase = faseDelPlan({ gratisHasta: e.gratisHasta, promoHasta: e.promo?.hasta }, hoy)
  const cobertura = coberturaDe({ gratisHasta: e.gratisHasta, promo: e.promo }, hoy)
  // Una cuenta que todavía no eligió periodicidad se valoriza a la tarifa
  // mensual —igual que la recaudación estimada del panel— y la columna
  // "Periodicidad" dice "Sin elegir", para que el supuesto quede a la vista.
  const cargo = cargoDe({
    vehiculos: e.maxVehiculos,
    periodicidad: e.periodicidad ?? 'mensual',
    vehiculosIncluidos: cobertura,
  })

  return [
    e.razonSocial,
    e.ownerEmail,
    e.tipoCuenta ? ETIQUETA_TIPO[e.tipoCuenta] : 'Sin definir',
    e.maxVehiculos,
    e.vehicleCount,
    e.periodicidad === 'anual' ? 'Anual' : e.periodicidad === 'mensual' ? 'Mensual' : 'Sin elegir',
    cargo.montoPleno,
    // En prueba no se cobra nada, y `coberturaDe` devuelve 0 en esa fase (la
    // cobertura promocional no aplica donde no hay cobro), así que sin este
    // caso explícito una cuenta en prueba aparecería pagando el ticket completo.
    fase === 'prueba' ? 0 : cargo.monto,
    ETIQUETA_FASE[fase],
    fechaCalendario(e.gratisHasta),
    e.promo?.codigo ?? '',
    fechaCalendario(e.promo?.hasta),
    e.rut,
    e.telefono,
    fecha(e.createdAt),
    // `ultimaConexion` es una fecha calendario `YYYY-MM-DD` (ver JSDoc en
    // `AdminCompanyRow`), NO un instante ISO: usar `fecha()` acá reintroduciría
    // el desfase de huso horario que este módulo existe para evitar.
    fechaCalendario(e.ultimaConexion),
  ]
}

/**
 * El archivo completo. Las líneas terminan en CRLF, que es lo que espera
 * Excel en Windows.
 */
export function construirCsv(empresas: FilaExport[], hoy: string): string {
  const lineas = [
    COLUMNAS.map(escaparCampo).join(SEPARADOR),
    ...empresas.map((e) => filaDeEmpresa(e, hoy).map(escaparCampo).join(SEPARADOR)),
  ]
  return BOM + lineas.join('\r\n') + '\r\n'
}

export function nombreArchivo(hoy: string): string {
  return `tapcar-clientes-${hoy}.csv`
}
