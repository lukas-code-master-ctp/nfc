import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-lienzo p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-azul/10 text-azul">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-7" aria-hidden="true">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
              <circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" />
            </svg>
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-tinta">Documentos Vehiculares</h1>
          <p className="mt-1 text-sm text-acero">Ingresa para gestionar la documentación de tus vehículos.</p>
        </div>
        <div className="rounded-2xl border border-linea bg-superficie p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
