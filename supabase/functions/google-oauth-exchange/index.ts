// T063: exchanges a Google OAuth authorization code for tokens and stores
// them. Runs as the authenticated user (auth: 'user') so we know whose
// credentials these are, but writes via supabaseAdmin since
// google_oauth_credentials deliberately has no client-facing insert policy
// (see supabase/migrations/20260715160001_google_oauth_credentials.sql).
import { withSupabase } from 'npm:@supabase/server'
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, withCors } from '../_shared/google.ts'

const handler = withSupabase({ auth: 'user' }, async (req, ctx) => {
  const { code, redirect_uri: redirectUri } = await req.json()
  if (!code || !redirectUri) {
    return Response.json({ error: 'missing code/redirect_uri' }, { status: 400 })
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenRes.ok || !tokenData.access_token || !tokenData.refresh_token) {
    return Response.json(
      { error: tokenData.error_description ?? 'Google token exchange failed' },
      { status: 400 },
    )
  }

  let googleEmail: string | null = null
  const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  if (userinfoRes.ok) {
    const userinfo = await userinfoRes.json()
    googleEmail = userinfo.email ?? null
  }

  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  const { error } = await ctx.supabaseAdmin.from('google_oauth_credentials').upsert({
    user_id: ctx.userClaims.id,
    google_email: googleEmail,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true, email: googleEmail })
})

export default { fetch: withCors(handler) }
