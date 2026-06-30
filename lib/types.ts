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

export interface Vehicle {
  id: string
  ownerUid: string
  patente: string
  marca: string
  modelo: string
  anio: number
  color: string
  publicToken: string
  createdAt: string // ISO
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

export interface PlanData {
  /** Máximo de vehículos permitidos por el plan (lo configura el admin). Mínimo 1. */
  maxVehiculos: number
}

export const DEFAULT_PLAN: PlanData = { maxVehiculos: 3 }

export interface UserProfile {
  email: string
  displayName: string
  company: CompanyData
  plan: PlanData
  createdAt: string | null
}

export interface VehicleDocument {
  id: string
  vehicleId: string
  ownerUid: string
  tipo: DocumentType
  nombrePersonalizado: string | null
  fechaVencimiento: string | null // ISO date (YYYY-MM-DD)
  fileUrl: string
  filePath: string
  remindersSent: string[] // p.ej. ['30','7','0']
  createdAt: string // ISO
}
