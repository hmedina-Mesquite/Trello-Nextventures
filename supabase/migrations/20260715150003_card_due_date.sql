-- T057: due date for the calendar view. Nullable -- most cards won't have
-- one. Same existing "members manage cards" RLS policy already covers it.
--
-- if not exists: a prior session already added this column live (visible in
-- src/types/index.ts's Card interface before this migration file existed)
-- but never committed a migration for it, so the remote schema is ahead of
-- this repo's tracked history for this one column.
alter table cards add column if not exists due_date timestamptz;
