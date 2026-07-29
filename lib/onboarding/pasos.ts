import type { Onboarding, TipoCuenta } from '@/lib/types'

export type PasoId =
  | 'vehiculo'
  | 'documentos'
  | 'chip'
  | 'empresa'
  | 'categorias'
  | 'mantencion'
  | 'equipo'
  | 'conductores'
  | 'reportes'

/**
 * Pasos que no dejan rastro en los datos y por eso se marcan con "Entendido".
 * El `publicToken` se crea junto con el vehículo, así que la app no tiene forma
 * de saber si el chip llegó a grabarse; y "Dashboard vs Reportes" es una
 * explicación, no una configuración.
 */
export const PASOS_INFORMATIVOS: readonly PasoId[] = ['chip', 'reportes']

export function esPasoInformativo(id: string): boolean {
  return (PASOS_INFORMATIVOS as readonly string[]).includes(id)
}

/**
 * Todo lo que hace falta para saber qué pasos están listos. Van inyectadas
 * (y no consultadas acá) para que esta lógica se pruebe sin Firebase.
 */
export interface Senales {
  vehiculos: number
  documentos: number
  /** Para armar los enlaces a la ficha; null si todavía no hay ningún vehículo. */
  primerVehiculoId: string | null
  razonSocial: string
  categorias: number
  pautaConfigurada: boolean
  miembros: number
  invitacionesPendientes: number
  conductores: number
  vistos: string[]
}

export interface Paso {
  id: PasoId
  titulo: string
  detalle: string
  /** null = todavía no hay destino (p.ej. "documentos"/"chip" sin vehículo). */
  href: string | null
  listo: boolean
  informativo: boolean
}

/**
 * Devuelve los pasos del tipo de cuenta con su estado ya resuelto.
 *
 * El progreso se DERIVA de las señales y no se guarda por paso: así el
 * checklist no puede mentir, refleja lo que se hizo desde otro lugar de la app
 * (los formularios existían antes que el onboarding) y no se desincroniza si
 * alguien borra el dato.
 */
export function pasosDe(tipoCuenta: TipoCuenta, s: Senales): Paso[] {
  const visto = (id: PasoId) => s.vistos.includes(id)
  // Sin vehículo todavía no hay ficha a la que ir: TarjetaProgreso abre el
  // modal de alta en su lugar para el paso "vehiculo"; "documentos" y "chip"
  // quedan sin destino (null) hasta que exista un primer vehículo.
  const ficha = (hash: string) => (s.primerVehiculoId ? `/vehiculos/${s.primerVehiculoId}#${hash}` : null)

  const comunes: Paso[] = [
    {
      id: 'vehiculo',
      titulo: 'Agrega tu primer vehículo',
      detalle: 'Con la patente, la marca y el modelo basta para partir.',
      // Respaldo si el paso se renderiza fuera del dashboard: ahí TarjetaProgreso
      // ignora este href y abre el modal de alta directamente.
      href: '/dashboard',
      listo: s.vehiculos > 0,
      informativo: false,
    },
    {
      id: 'documentos',
      titulo: 'Sube sus documentos',
      detalle: 'Permiso de circulación, revisión técnica y SOAP. Te avisamos por correo antes de que venzan.',
      href: ficha('documentos'),
      listo: s.documentos > 0,
      informativo: false,
    },
    {
      id: 'chip',
      titulo: 'Vincula el chip NFC',
      detalle: 'Pégalo en el parabrisas: al acercarle un celular se abre la ficha del vehículo con sus documentos.',
      href: ficha('ajustes'),
      listo: visto('chip'),
      informativo: true,
    },
  ]

  if (tipoCuenta === 'personal') return comunes

  return [
    ...comunes,
    {
      id: 'empresa',
      titulo: 'Completa los datos de tu empresa',
      detalle: 'Razón social, RUT y giro. Los usamos para la facturación.',
      href: '/configuracion',
      listo: s.razonSocial.trim().length > 0,
      informativo: false,
    },
    {
      id: 'categorias',
      titulo: 'Crea tus categorías',
      detalle: 'Agrupa la flota como la piensas tú: camionetas, arriendo, reparto.',
      href: '/configuracion#categorias',
      listo: s.categorias > 0,
      informativo: false,
    },
    {
      id: 'mantencion',
      titulo: 'Define la pauta de mantención',
      detalle: 'Cada cuántos kilómetros o meses toca mantención. En esa misma página ajustas el aviso de uso prolongado.',
      href: '/configuracion#mantencion',
      listo: s.pautaConfigurada,
      informativo: false,
    },
    {
      id: 'equipo',
      titulo: 'Suma a tu equipo',
      detalle: 'Invita por correo con rol de Administrador, Editor o Visor. Hasta 5 miembros.',
      href: '/configuracion#equipo',
      listo: s.miembros >= 2 || s.invitacionesPendientes > 0,
      informativo: false,
    },
    {
      id: 'conductores',
      titulo: 'Registra a tus conductores',
      detalle: 'No necesitan cuenta: entran con un PIN de 4 dígitos para tomar y entregar vehículos.',
      href: '/configuracion#conductores',
      listo: s.conductores > 0,
      informativo: false,
    },
    {
      id: 'reportes',
      titulo: 'Dashboard y Reportes: en qué se diferencian',
      detalle: 'El Dashboard es el estado de hoy: qué vence, qué está en uso, qué tiene daño. Reportes es el historial: quién usó cada vehículo y con qué resultado.',
      href: '/reportes',
      listo: visto('reportes'),
      informativo: true,
    },
  ]
}

export function todosListos(pasos: Paso[]): boolean {
  return pasos.every((p) => p.listo)
}

/** ¿Hay que mandarlo a /bienvenida a elegir tipo de cuenta? */
export function debeElegirTipo(o: Onboarding | undefined, puedeConfigurar: boolean): boolean {
  return puedeConfigurar && !o?.tipoCuenta
}

/** ¿Se renderiza la tarjeta de progreso en el dashboard? */
export function debeMostrarTarjeta(o: Onboarding | undefined, puedeConfigurar: boolean): boolean {
  if (!puedeConfigurar || !o?.tipoCuenta) return false
  return !o.completadoEn && !o.descartadoEn
}
