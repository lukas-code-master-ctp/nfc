import { countMembers } from '@/lib/data/members'
import { countPendingInvitations } from '@/lib/data/invitations'
import { listActiveDrivers } from '@/lib/data/drivers'
import type { Company, TipoCuenta } from '@/lib/types'
import type { Senales } from '@/lib/onboarding/pasos'

/**
 * Completa las señales del onboarding con lo que el render del dashboard no
 * tiene a mano.
 *
 * En cuenta personal no consulta nada: sus tres pasos se resuelven con los
 * vehículos y los documentos que el dashboard ya cargó. Las tres consultas
 * extra son solo de cuenta empresa, y desaparecen al completarse el onboarding
 * (ver `completadoEn`).
 */
export async function cargarSenales(args: {
  companyId: string
  company: Company | null
  tipoCuenta: TipoCuenta
  vehiculos: number
  documentos: number
  primerVehiculoId: string | null
  vistos: string[]
}): Promise<Senales> {
  const [miembros, invitacionesPendientes, conductores] =
    args.tipoCuenta === 'empresa'
      ? await Promise.all([
          countMembers(args.companyId),
          countPendingInvitations(args.companyId),
          listActiveDrivers(args.companyId).then((d) => d.length),
        ])
      : [0, 0, 0]

  const pauta = args.company?.pautaMantencion
  return {
    vehiculos: args.vehiculos,
    documentos: args.documentos,
    primerVehiculoId: args.primerVehiculoId,
    razonSocial: args.company?.company.razonSocial ?? '',
    categorias: args.company?.categorias?.length ?? 0,
    pautaConfigurada: Boolean(pauta && ((pauta.cadaKm ?? 0) > 0 || (pauta.cadaMeses ?? 0) > 0)),
    miembros,
    invitacionesPendientes,
    conductores,
    vistos: args.vistos,
  }
}
