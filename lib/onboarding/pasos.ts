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
 * El título de cada paso, en un solo lugar.
 *
 * Lo consumen `pasosDe` (el checklist) y el toast que avisa al completar un
 * paso desde otra página: si estuvieran duplicados, el aviso podría nombrar el
 * paso de una forma y la lista de otra. Hay un test que fija que coincidan.
 */
export const TITULOS: Record<PasoId, string> = {
  vehiculo: 'Agrega tu primer vehículo',
  documentos: 'Sube sus documentos',
  chip: 'Vincula el chip NFC',
  empresa: 'Completa los datos de tu empresa',
  categorias: 'Crea tus categorías',
  mantencion: 'Define la pauta de mantención',
  equipo: 'Suma a tu equipo',
  conductores: 'Registra a tus conductores',
  reportes: 'Dashboard y Reportes: en qué se diferencian',
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
      titulo: TITULOS.vehiculo,
      detalle: 'Con la patente, la marca y el modelo basta para partir.',
      // Respaldo si el paso se renderiza fuera del dashboard: ahí TarjetaProgreso
      // ignora este href y abre el modal de alta directamente.
      href: '/dashboard',
      listo: s.vehiculos > 0,
      informativo: false,
    },
    {
      id: 'documentos',
      titulo: TITULOS.documentos,
      detalle: 'Permiso de circulación, revisión técnica y SOAP. Te avisamos por correo antes de que venzan.',
      href: ficha('documentos'),
      listo: s.documentos > 0,
      informativo: false,
    },
    {
      id: 'chip',
      titulo: TITULOS.chip,
      detalle: 'Va en el llavero del auto: al acercarle un celular se abre la ficha del vehículo con sus documentos.',
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
      titulo: TITULOS.empresa,
      detalle: 'Razón social, RUT y giro. Los usamos para la facturación.',
      href: '/configuracion',
      listo: s.razonSocial.trim().length > 0,
      informativo: false,
    },
    {
      id: 'categorias',
      titulo: TITULOS.categorias,
      detalle: 'Agrupa la flota como la piensas tú: camionetas, arriendo, reparto.',
      href: '/configuracion#categorias',
      listo: s.categorias > 0,
      informativo: false,
    },
    {
      id: 'mantencion',
      titulo: TITULOS.mantencion,
      detalle: 'Cada cuántos kilómetros o meses toca mantención. En esa misma página ajustas el aviso de uso prolongado.',
      href: '/configuracion#mantencion',
      listo: s.pautaConfigurada,
      informativo: false,
    },
    {
      id: 'equipo',
      titulo: TITULOS.equipo,
      detalle: 'Invita por correo con rol de Administrador, Editor o Visor. Hasta 5 miembros.',
      href: '/configuracion#equipo',
      listo: s.miembros >= 2 || s.invitacionesPendientes > 0,
      informativo: false,
    },
    {
      id: 'conductores',
      titulo: TITULOS.conductores,
      detalle: 'No necesitan cuenta: entran con un PIN de 4 dígitos para tomar y entregar vehículos.',
      href: '/configuracion#conductores',
      listo: s.conductores > 0,
      informativo: false,
    },
    {
      id: 'reportes',
      titulo: TITULOS.reportes,
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

/**
 * El paso en el que toca trabajar ahora: el primero que todavía no está listo.
 *
 * La tarjeta del dashboard muestra solo este paso y esconde el resto detrás de
 * un chevron — con nueve pasos, la lista completa empuja la flota fuera de la
 * pantalla. Como el progreso se deriva de los datos, al completar un paso el
 * siguiente pasa a ser el actual sin que nadie lleve un índice.
 *
 * Devuelve `null` cuando no queda ninguno: es el render transitorio en el que
 * `todosListos` dispara el estampado de `completadoEn`.
 */
export function primerPendiente(pasos: Paso[]): Paso | null {
  return pasos.find((p) => !p.listo) ?? null
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
