-- T085: cards isn't broadcasting postgres_changes until it's added to the
-- supabase_realtime publication -- RLS (already in place from T010, any
-- board member) still gates who actually receives each change.
alter publication supabase_realtime add table public.cards;
