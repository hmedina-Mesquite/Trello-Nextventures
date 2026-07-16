-- T053: visual-only completion checkmark on cards. The existing "members
-- manage cards" RLS policy (20260714120007_rls_content.sql) is a `for all`
-- clause keyed on board membership, so it already covers this column with no
-- new policy needed.
alter table cards add column complete boolean not null default false;
