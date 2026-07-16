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
  background_image_path: string | null
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
  start_date: string | null
  end_date: string | null
  cover_attachment_id: string | null
  complete: boolean
  created_at: string
  updated_at: string
}

export interface ListWithCards extends List {
  cards: Card[]
}

export interface Label {
  id: string
  board_id: string
  name: string
  color: string
}

export interface CardLabel {
  card_id: string
  label_id: string
}

export interface Checklist {
  id: string
  card_id: string
  title: string
  position: number
}

export interface ChecklistItem {
  id: string
  checklist_id: string
  text: string
  is_complete: boolean
  position: number
}

export interface ChecklistWithItems extends Checklist {
  items: ChecklistItem[]
}

export interface Comment {
  id: string
  card_id: string
  author_id: string
  body: string
  created_at: string
}

export interface CommentWithAuthor extends Comment {
  profiles: { username: string | null } | null
}

export interface Attachment {
  id: string
  card_id: string
  user_id: string
  file_name: string
  file_type: string | null
  storage_path: string | null
  url: string | null
  size: number | null
  position: number
  created_at: string
}

export type BoardRole = 'owner' | 'member'

export interface BoardMember {
  board_id: string
  user_id: string
  role: BoardRole
  created_at: string
}

export interface BoardMemberWithProfile extends BoardMember {
  profiles: { username: string | null } | null
}

export type NotificationEventType = 'board_invite' | 'member_removed'

export interface Notification {
  id: string
  user_id: string
  event_type: NotificationEventType
  related_board_id: string | null
  related_user_id: string | null
  message: string
  read: boolean
  created_at: string
}
