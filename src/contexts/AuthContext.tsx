import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signUp: (email: string, password: string, username: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// Supabase Auth errors come back in English with no locale option; translate
// the small set we actually see, fall back to the raw message otherwise.
const AUTH_ERROR_TRANSLATIONS: Record<string, string> = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'El correo no ha sido confirmado.',
  'User already registered': 'Ya existe una cuenta con este correo.',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
  'Signups not allowed for this instance': 'Los registros no están permitidos en este momento.',
}

function translateAuthError(message: string): string {
  return AUTH_ERROR_TRANSLATIONS[message] ?? message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // T146: supabase-js's onAuthStateChange fires (handing back a brand-new
  // Session object each time, even when nothing meaningful changed) on every
  // tab focus/visibility check it does internally, not just on an actual
  // sign-in, sign-out, or token refresh. Every `useEffect([..., user])`
  // downstream (BoardPage's board load chief among them) keys off `user`'s
  // object identity to decide whether to refetch, so every plain tab refocus
  // was masquerading as a fresh sign-in and triggering a full data refetch.
  // Keep `user` referencing the same object across renders as long as the
  // signed-in user's id hasn't actually changed -- this is React's documented
  // "adjust state during render" pattern (see "You Might Not Need an Effect"),
  // not an Effect, so it settles before paint with no extra flicker. `session`
  // itself is left updating freely: nothing reads its identity, only
  // ProtectedRoute's `!session` truthiness check, which this doesn't affect.
  const [user, setUser] = useState<User | null>(null)
  if ((session?.user?.id ?? null) !== (user?.id ?? null)) {
    setUser(session?.user ?? null)
  }

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setLoading(false)
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signUp(email: string, password: string, username: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })
    return { error: error ? translateAuthError(error.message) : null }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? translateAuthError(error.message) : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const value: AuthContextValue = {
    session,
    user,
    loading,
    signUp,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
