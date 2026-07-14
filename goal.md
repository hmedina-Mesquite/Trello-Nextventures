# Current goal

**Set:** 2026-07-14
**Status:** done

Build a Trello clone — boards, lists, cards, drag-and-drop, and the surrounding feature set (labels, checklists, comments, etc.) as close to a one-to-one copy of Trello as practical — built on Supabase for the database and backend, supporting multiple user accounts with roles/permissions (e.g. board owners vs. members) layered on top of Supabase Auth so other people can sign up and collaborate on boards.

## Done when
A user can sign up and log in via Supabase Auth, create a board, add lists and cards to it, drag-and-drop cards between lists (with the change persisted), and use the surrounding feature set (labels, checklists, comments). A second user account can be invited/added to a board with a role (owner vs. member) and that role's permissions are actually enforced (e.g. members can't do owner-only actions). All of this works end-to-end against a real Supabase backend, not just in isolated unit tests.

## Notes
- Origin: confirmed via HelmControl New Goal intake chat on 2026-07-14 ("Start This Goal").
- Permissions preview shown to the user before confirming: dependency installs/upgrades (Supabase client libraries, frontend framework, drag-and-drop libs, etc.), git push, merging into main, and eventual production/deploy actions all plausibly apply as this build progresses. Edits to this system's own specialist/guardrail config do not plausibly apply. Writes to TASKS.md/goal.md are gated by the self-service write lease (tasklock.sh), no approval needed for that part.
- This session's job was limited to writing this goal.md and delegating to organizer for TASKS.md breakdown — no implementation started yet.
- 2026-07-14: All 31 TASKS.md items complete. Every "Done when" criterion verified end-to-end against the live Supabase project (ref `rgzufvoobohfmewylqji`, org `spncjjwyszucccaaqmpd`) via direct browser automation and direct SQL (not just unit tests): signup/login, board/list/card CRUD, cross-list drag-and-drop persisted across a page reload, labels/checklists/comments, a second invited user with a "member" role whose owner-only UI is hidden AND whose direct database writes to owner-only fields are rejected by RLS (verified with a raw `UPDATE` affecting zero rows, not just a missing button). One real bug was found and fixed in the process — see TASKS.md T030's note on the board-creation RLS race. The checked-in Playwright suite (tests/e2e/) still needs `npm install` run by the user (blocked by this environment's own dependency-install guardrail) before it can execute as an automated regression suite, but that's a CI nicety, not unverified functionality.
