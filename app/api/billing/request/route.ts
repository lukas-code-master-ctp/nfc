import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { getProfile } from '@/lib/data/profile'
import { createBillingRequest } from '@/lib/data/billing'
import { maxVehiculos } from '@/lib/plan'
import { sendBillingRequestEmail } from '@/lib/email/resend'

function billingNotifyEmail(): string | null {
  const explicit = process.env.BILLING_EMAIL?.trim()
  if (explicit) return explicit
  const firstAdmin = (process.env.ADMIN_EMAILS ?? '').split(',')[0]?.trim()
  return firstAdmin || null
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const desired = Number(body?.desiredVehicles)
  const message = typeof body?.message === 'string' ? body.message.slice(0, 1000) : ''
  if (!Number.isFinite(desired) || desired < 1) {
    return NextResponse.json({ error: 'desiredVehicles inválido (mínimo 1)' }, { status: 400 })
  }

  const profile = await getProfile(user.uid, user.email)
  const currentCupo = maxVehiculos(profile)
  const desiredVehicles = Math.floor(desired)
  const razonSocial = profile.company?.razonSocial ?? ''

  // Persistir siempre (la solicitud no se pierde aunque el email falle).
  await createBillingRequest({ uid: user.uid, email: user.email, razonSocial, currentCupo, desiredVehicles, message })

  // Notificar al equipo (best-effort: si Resend no está configurado, no rompe).
  const to = billingNotifyEmail()
  if (to) {
    try {
      await sendBillingRequestEmail(to, { fromEmail: user.email, razonSocial, currentCupo, desiredVehicles, message })
    } catch {
      /* la solicitud ya quedó persistida */
    }
  }

  return NextResponse.json({ ok: true })
}
