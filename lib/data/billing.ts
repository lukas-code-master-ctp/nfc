import { adminDb } from '@/lib/firebase/admin'

const COL = 'billingRequests'

export interface BillingRequestInput {
  uid: string
  email: string
  razonSocial: string
  currentCupo: number
  desiredVehicles: number
  message: string
}

// Solicitud de plan/ampliación (modelo concierge: el cobro y la factura se
// coordinan a mano por ahora). Se persiste para que el equipo la atienda
// aunque el email no esté configurado.
export async function createBillingRequest(data: BillingRequestInput): Promise<void> {
  await adminDb.collection(COL).add({
    ...data,
    status: 'pendiente',
    createdAt: new Date().toISOString(),
  })
}
