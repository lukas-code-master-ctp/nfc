'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase/client'
import PasswordInput from '@/components/PasswordInput'

async function establishSession(user: User) {
  const idToken = await user.getIdToken()
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
}

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function afterAuth(user: User) {
    await establishSession(user)
    router.push('/dashboard')
    router.refresh()
  }

  async function handleGoogle() {
    setError(null)
    try {
      const { user } = await signInWithPopup(auth, new GoogleAuthProvider())
      await afterAuth(user)
    } catch {
      setError('No se pudo iniciar sesión con Google.')
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const cred = isRegister
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password)
      await afterAuth(cred.user)
    } catch {
      setError(isRegister ? 'No se pudo crear la cuenta.' : 'Credenciales inválidas.')
    }
  }

  const inputCls =
    'w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-tinta placeholder:text-acero/45 focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/20'

  return (
    <div className="space-y-4">
      <button
        onClick={handleGoogle}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-linea bg-superficie px-4 py-2.5 font-medium text-tinta transition-colors hover:bg-lienzo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
      >
        <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
        Continuar con Google
      </button>

      <div className="flex items-center gap-3 text-xs text-acero">
        <span className="h-px flex-1 bg-linea" />o<span className="h-px flex-1 bg-linea" />
      </div>

      <form onSubmit={handleEmail} className="space-y-3">
        <input className={inputCls} type="email" placeholder="Correo" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <PasswordInput placeholder="Contraseña"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button
          type="submit"
          className="w-full rounded-lg bg-azul px-4 py-2.5 font-semibold text-white transition-colors hover:bg-azul-press focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azul"
        >
          {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-[#FCE7E7] px-3 py-2 text-sm text-[#C81E1E]">
          {error}
        </p>
      )}

      <button
        onClick={() => setIsRegister(!isRegister)}
        className="w-full text-center text-sm font-medium text-azul hover:text-azul-press"
      >
        {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
      </button>
    </div>
  )
}
