import type { Role } from '@/lib/auth/roles'

export type DocumentType =
  | 'permiso_circulacion'
  | 'revision_tecnica'
  | 'soap'
  | 'certificado_gases'
  | 'padron'
  | 'otro'

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  permiso_circulacion: 'Permiso de Circulación',
  revision_tecnica: 'Revisión Técnica',
  soap: 'SOAP',
  certificado_gases: 'Certificado de Gases',
  padron: 'Padrón',
  otro: 'Otro',
}

export const REMINDER_MILESTONES = [30, 7, 0] as const

// Tipos de documento que no tienen fecha de vencimiento (p.ej. el Padrón).
export const DOCUMENT_TYPES_SIN_VENCIMIENTO = new Set<DocumentType>(['padron'])

export function tipoTieneVencimiento(tipo: DocumentType): boolean {
  return !DOCUMENT_TYPES_SIN_VENCIMIENTO.has(tipo)
}

export interface PautaMantencion {
  cadaKm?: number | null
  cadaMeses?: number | null
}

export interface Mantencion {
  id: string
  companyId: string
  vehicleId: string
  fecha: string // YYYY-MM-DD
  km: number | null
  nota?: string | null
  filePath?: string | null
  fileUrl?: string | null
  createdByUid?: string
  createdAt: string // ISO
}

// Información operativa del vehículo (para quien lo va a manejar). Todos
// los campos son opcionales; la ficha pública muestra solo los que estén.
export interface VehicleInfo {
  combustible?: string
  presionNeumaticos?: string
  medidaNeumaticos?: string
  transmision?: string
  aceite?: string
  estanque?: string
  notas?: string
}

export const VEHICLE_INFO_FIELDS: {
  key: keyof VehicleInfo
  label: string
  placeholder: string
  multiline?: boolean
}[] = [
  { key: 'combustible', label: 'Combustible', placeholder: 'Bencina 95 · Diésel · Eléctrico' },
  { key: 'presionNeumaticos', label: 'Presión de neumáticos', placeholder: '32 psi adelante · 35 psi atrás' },
  { key: 'medidaNeumaticos', label: 'Medida de neumáticos', placeholder: '205/55 R16' },
  { key: 'transmision', label: 'Transmisión', placeholder: 'Automática · Manual' },
  { key: 'aceite', label: 'Aceite', placeholder: '5W-30 sintético' },
  { key: 'estanque', label: 'Capacidad del estanque', placeholder: '50 L' },
  { key: 'notas', label: 'Notas', placeholder: 'Cualquier dato útil para quien maneje el vehículo', multiline: true },
]

export interface Vehicle {
  id: string
  patente: string
  marca: string
  modelo: string
  anio: number
  color: string
  info?: VehicleInfo
  publicToken: string
  createdAt: string // ISO
  companyId: string
  createdByUid?: string
  usoActual?: { driverId: string; driverNombre: string; tomadoEn: string } | null
  categoriaId?: string | null
  // Kilometraje del odómetro, denormalizado desde los usos (el máximo leído por
  // la IA en las entregas). `kmActualizadoEn` = fecha de la lectura que lo fijó.
  kmActual?: number | null
  kmActualizadoEn?: string | null
  pautaMantencion?: PautaMantencion | null
  mantencionReminders?: ('proxima' | 'vencida')[]
}

export interface CompanyData {
  razonSocial: string
  rut: string
  giro: string
  direccion: string
  telefono: string
}

export const EMPTY_COMPANY: CompanyData = {
  razonSocial: '',
  rut: '',
  giro: '',
  direccion: '',
  telefono: '',
}

export interface Categoria {
  id: string
  nombre: string
}

export interface PlanData {
  /** Máximo de vehículos permitidos por el plan (lo configura el admin). Mínimo 1. */
  maxVehiculos: number
}

export const DEFAULT_PLAN: PlanData = { maxVehiculos: 3 }

/** Horas por default antes de avisar que un vehículo lleva mucho en uso sin entregar. */
export const DEFAULT_AVISO_USO_HORAS = 12

export interface Company {
  id: string
  ownerUid: string // Administrador que la creó
  company: CompanyData
  plan: PlanData
  avisoUsoHoras?: number // horas antes de avisar "uso sin entregar" en /flota
  categorias?: Categoria[]
  pautaMantencion?: PautaMantencion
  createdAt: string | null
}

export interface UserProfile {
  email: string
  displayName: string
  createdAt: string | null
  companyId: string
  role: Role
  /** Si el miembro recibe las notificaciones por email (vencimientos + alertas de flota).
   *  Ausente = default: lo recibe solo el dueño de la empresa. */
  recibeAlertas?: boolean
}

export interface VehicleDocument {
  id: string
  vehicleId: string
  tipo: DocumentType
  nombrePersonalizado: string | null
  fechaVencimiento: string | null // ISO date (YYYY-MM-DD)
  fileUrl: string
  filePath: string
  remindersSent: string[] // p.ej. ['30','7','0']
  createdAt: string // ISO
  companyId: string
  createdByUid?: string
}

export const MAX_MIEMBROS_EQUIPO = 5

export interface Invitation {
  id: string
  companyId: string
  email: string // normalizado a minúsculas
  role: Role
  token: string
  status: 'pending' | 'accepted' | 'revoked'
  invitedByUid: string
  createdAt: string // ISO
  expiresAt: string // ISO
  acceptedByUid?: string
  acceptedAt?: string
}

export interface Driver {
  id: string
  companyId: string
  nombre: string
  rut?: string
  pinHash: string // hash del PIN de 4 dígitos; nunca se devuelve al cliente
  /** PIN recuperable para mostrarlo al Administrador (decisión de producto).
   *  Ausente en conductores creados antes de este campo. La verificación usa pinHash. */
  pin?: string
  activo: boolean
  createdAt: string // ISO
  createdByUid?: string
  intentosFallidos?: number
  bloqueadoHasta?: string | null
  stats?: { usos: number; danos: number; sinEntrega: number }
}

export interface VehicleUsage {
  id: string
  companyId: string
  vehicleId: string
  driverId: string
  driverNombre: string // denormalizado (el padrón puede cambiar)
  tomadoEn: string // ISO
  entregadoEn: string | null
  estado: 'abierto' | 'cerrado'
  cierreForzado?: boolean
  entregadoPorDriverId?: string
  entregadoPorNombre?: string
  fotos?: { tablero?: string; cabina?: string }
  dano?: {
    hay: boolean
    nota?: string
    fotoPath?: string
    revisadoPorUid?: string
    revisadoPorNombre?: string
    revisadoEn?: string
  }
  // Reservados para SP3 (IA) — vacíos en SP2:
  bencina?: string
  km?: number
  limpieza?: string
  iaAnalizadoEn?: string // ISO; cuándo corrió la IA
  datosConfirmados?: boolean // true cuando un gestor edita/confirma
  createdAt: string // ISO
}

export interface Alerta {
  id: string
  companyId: string
  vehicleId: string
  patente: string // denormalizado
  usageId: string
  tipo: 'dano' | 'sin_entrega'
  driverNombre: string
  nota?: string
  creadaEn: string // ISO
}
