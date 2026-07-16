import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { consumeGoogleOAuthState, exchangeGoogleCode } from '../lib/googleCalendar'

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const oauthError = searchParams.get('error')
    if (oauthError) {
      setError(`Google rechazó la conexión: ${oauthError}`)
      return
    }
    if (!code) {
      setError('Falta el código de autorización de Google.')
      return
    }
    if (!consumeGoogleOAuthState(searchParams.get('state'))) {
      setError('La conexión con Google no pudo verificarse (state inválido). Intenta de nuevo.')
      return
    }
    void exchangeGoogleCode(code).then(({ error: exchangeError }) => {
      if (exchangeError) {
        setError(exchangeError)
        return
      }
      navigate('/calendar', { replace: true })
    })
  }, [searchParams, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg text-slate-600">
      {error ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-danger">{error}</p>
          <a href="/calendar" className="font-medium text-primary hover:text-primary-hover">
            Volver al calendario
          </a>
        </div>
      ) : (
        <p>Conectando con Google…</p>
      )}
    </div>
  )
}
