'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

async function establishSession() {
  const idToken = await auth.currentUser!.getIdToken()
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

  async function afterAuth() {
    await establishSession()
    router.push('/dashboard')
    router.refresh()
  }

  async function handleGoogle() {
    setError(null)
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
      await afterAuth()
    } catch (e) {
      setError('No se pudo iniciar sesión con Google.')
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (isRegister) await createUserWithEmailAndPassword(auth, email, password)
      else await signInWithEmailAndPassword(auth, email, password)
      await afterAuth()
    } catch {
      setError(isRegister ? 'No se pudo crear la cuenta.' : 'Credenciales inválidas.')
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <button onClick={handleGoogle} className="w-full rounded border p-2 font-medium">
        Continuar con Google
      </button>
      <div className="text-center text-sm text-gray-400">o</div>
      <form onSubmit={handleEmail} className="space-y-3">
        <input className="w-full rounded border p-2" type="email" placeholder="Correo"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full rounded border p-2" type="password" placeholder="Contraseña"
          value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button type="submit" className="w-full rounded bg-blue-600 p-2 text-white">
          {isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={() => setIsRegister(!isRegister)} className="w-full text-sm text-blue-600">
        {isRegister ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
      </button>
    </div>
  )
}
