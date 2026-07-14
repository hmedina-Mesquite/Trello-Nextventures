// Plain TS interfaces mirroring the Supabase schema (supabase/migrations/).
// The client is untyped (see src/lib/supabaseClient.ts) until a live project
// exists to generate `Database` types from, so query results are cast/shaped
// against these by hand.

export interface Profile {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface Board {
  id: string
  name: string
  owner_id: string
  background_color: string
  created_at: string
  updated_at: string
}

export interface List {
  id: string
  board_id: string
  name: string
  position: number
  created_at: string
}

export interface Card {
  id: string
  list_id: string
  title: string
  description: string | null
  position: number
  due_date: string | null
  created_at: string
  updated_at: string
}

export interface ListWithCards extends List {
  cards: Card[]
}
