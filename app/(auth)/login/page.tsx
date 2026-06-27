import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold">Documentos Vehiculares</h1>
        <LoginForm />
      </div>
    </main>
  )
}
