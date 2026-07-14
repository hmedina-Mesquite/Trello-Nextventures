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
      setError('Signups are restricted to approved company email domains.')
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
      setInfo('Account created. If email confirmation is required, check your inbox, then log in.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">Sign up</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-green-700">{info}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Signing up…' : 'Sign up'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
