import { NextRequest, NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth/membership'
import { can } from '@/lib/auth/roles'
import { getCompany } from '@/lib/data/companies'
import { createBillingRequest } from '@/lib/data/billing'
import { maxVehiculosDe } from '@/lib/plan'
import { sendBillingRequestEmail } from '@/lib/email/resend'

function billingNotifyEmail(): string | null {
  const explicit = process.env.BILLING_EMAIL?.trim()
  if (explicit) return explicit
  const firstAdmin = (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim()
  return firstAdmin || null
}

export async function POST(req: NextRequest) {
  const m = await getMembership()
  if (!m) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!can(m.role, 'billing:manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json()
  const desired = Number(body?.desiredVehicles)
  const message = typeof body?.message === 'string' ? body.message.slice(0, 1000) : ''
  if (!Number.isFinite(desired) || desired < 1) {
    return NextResponse.json({ error: 'desiredVehicles inválido (mínimo 1)' }, { status: 400 })
  }

  const company = await getCompany(m.companyId)
  const currentCupo = maxVehiculosDe(company?.plan)
  const desiredVehicles = Math.floor(desired)
  const razonSocial = company?.company.razonSocial ?? ''

  // Persistir siempre (la solicitud no se pierde aunque el email falle).
  await createBillingRequest({
    uid: m.uid,
    email: m.email,
    companyId: m.companyId,
    razonSocial,
    currentCupo,
    desiredVehicles,
    message,
  })

  // Notificar al equipo (best-effort: si Resend no está configurado, no rompe).
  const to = billingNotifyEmail()
  if (to) {
    try {
      await sendBillingRequestEmail(to, { fromEmail: m.email, razonSocial, currentCupo, desiredVehicles, message })
    } catch {
      /* la solicitud ya quedó persistida */
    }
  }

  return NextResponse.json({ ok: true })
}
