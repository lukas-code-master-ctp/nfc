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
