import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'

// Real enforcement is the `handle_new_user` DB trigger (a direct API call
// can't bypass it) - this is just so a wrong domain doesn't need a round
// trip to find out.
const ALLOWED_EMAIL_DOMAINS = [
  'nextventures.mx',
  'aerotower.mx',
  'binjamovil.com',
  'cordillera.io',
  'mesquite.mx',
  'mintakatech.mx',
  'ranchomiradorestelar.com',
  'rigelabs.mx',
]

export default function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    const domain = email.split('@')[1]?.toLowerCase()
    if (!domain || !ALLOWED_EMAIL_DOMAINS.includes(domain)) {
      setError('Los registros están restringidos a dominios de correo aprobados por la empresa.')
      return
    }

    setSubmitting(true)
    const { error: signUpError } = await signUp(email, password, username)
    if (signUpError) {
      setSubmitting(false)
      setError(signUpError)
      return
    }

    // signUp resolves before the auth-state listener necessarily fires, so
    // check the freshly-persisted session directly rather than racing it.
    const { data } = await supabase.auth.getSession()
    setSubmitting(false)

    if (data.session) {
      navigate('/', { replace: true })
    } else {
      setInfo('Cuenta creada. Si se requiere confirmación por correo, revisa tu bandeja de entrada y luego inicia sesión.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border-subtle bg-surface p-8 shadow-elevated">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
            T
          </div>
          <span className="text-lg font-bold text-slate-900">TAMS</span>
        </div>
        <h1 className="mb-6 text-center text-xl font-semibold text-slate-900">Registrarse</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-700">
              Nombre de usuario
            </label>
            <input
              id="username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
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
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border-subtle px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-danger-light px-3 py-2 text-sm text-danger">{error}</p>
          )}
          {info && (
            <p className="rounded-lg bg-success-light px-3 py-2 text-sm text-success">{info}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Registrando…' : 'Registrarse'}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          ¿Ya tienes una cuenta?{' '}
          <Link to="/login" className="font-medium text-primary hover:text-primary-hover">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
