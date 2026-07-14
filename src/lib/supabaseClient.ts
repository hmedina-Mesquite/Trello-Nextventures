import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY env vars')
}

// ponytail: untyped client for now; regenerate with `supabase gen types typescript`
// (or the generate_typescript_types MCP tool) once the live project exists, then
// swap in `createClient<Database>(url, anonKey)`.
export const supabase = createClient(url, anonKey)
