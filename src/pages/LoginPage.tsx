import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await signIn(email, password)
    setSubmitting(false)
    if (signInError) {
      setError(signInError)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface p-8 shadow-elevated">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            T
          </div>
          <span className="text-lg font-bold text-slate-900">Trello</span>
        </div>
        <h1 className="mb-6 text-center text-xl font-semibold text-slate-900">Iniciar sesión</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          ¿No tienes una cuenta?{' '}
          <Link to="/signup" className="font-medium text-primary hover:text-primary-hover">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}
