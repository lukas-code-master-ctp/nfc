import { estadoMantencion } from '@/lib/mantencion/status'
import { hitoMantencion } from '@/lib/mantencion/reminders'
import { resolverUltimaMantencion } from '@/lib/vehicles/resumen'
import type { PautaMantencion, Vehicle } from '@/lib/types'

export interface MantencionReminderDeps {
  allCompanies: () => Promise<{ id: string; ownerUid: string; pauta: PautaMantencion | null }[]>
  vehiclesOf: (companyId: string) => Promise<Vehicle[]>
  /** Solo se llama para los vehículos **sin** resumen guardado. Ver abajo. */
  ultimaMantencion: (vehicleId: string) => Promise<{ km: number | null; fecha: string } | null>
  recipients: (companyId: string, ownerUid: string) => Promise<string[]>
  sendMantencionEmail: (to: string, p: { patente: string; vehicleId: string; estado: 'proxima' | 'vencida'; detalle: string }) => Promise<void>
  markHito: (vehicleId: string, companyId: string, hitos: string[]) => Promise<void>
}

export async function processMantencionReminders(deps: MantencionReminderDeps, now: Date): Promise<{ sent: number }> {
  const companies = await deps.allCompanies()
  let sent = 0
  for (const c of companies) {
    const vehicles = await deps.vehiclesOf(c.id)
    let emails: string[] | null = null
    for (const v of vehicles) {
      const pauta = v.pautaMantencion ?? c.pauta ?? null
      // El resumen que el vehículo ya trae, y solo se consulta si falta. Antes
      // esto era una consulta por vehículo **por día**, y `ultimaMantencion`
      // lee el historial completo para quedarse con el primero: un vehículo con
      // 30 mantenciones registradas costaba 30 lecturas diarias en vez de cero.
      const ultima = await resolverUltimaMantencion(v, deps.ultimaMantencion)
      const { estado, detalle } = estadoMantencion({ pauta, ultima, kmActual: v.kmActual ?? null, now })
      if (estado !== 'proxima' && estado !== 'vencida') continue
      const enviados = v.mantencionReminders ?? []
      const hito = hitoMantencion(estado, enviados)
      if (!hito) continue
      try {
        if (emails === null) emails = await deps.recipients(c.id, c.ownerUid)
        if (emails.length === 0) continue
        const texto = detalle.kmRestantes != null && detalle.kmRestantes <= 0 ? 'kilometraje cumplido'
          : detalle.diasRestantes != null && detalle.diasRestantes < 0 ? 'fecha cumplida' : 'pronto'
        for (const to of emails) {
          await deps.sendMantencionEmail(to, { patente: v.patente, vehicleId: v.id, estado: hito, detalle: texto })
        }
        await deps.markHito(v.id, c.id, [...enviados, hito])
        sent++
      } catch (err) {
        console.error('[processMantencionReminders]', v.id, err)
      }
    }
  }
  return { sent }
}
