-- T051: card front cover image. Nullable FK, so a card can fall back to
-- "most recently added image attachment" client-side when unset.
-- on delete set null: deleting the attachment used as a cover shouldn't
-- delete or lock the card, just fall back to the default again.
alter table public.cards
  add column cover_attachment_id uuid references public.attachments (id) on delete set null;

-- No new RLS policy: "members manage cards" (20260714120007_rls_content.sql)
-- already covers every column via a row-level `for all` policy, and this is
-- a plain column on that same row.
