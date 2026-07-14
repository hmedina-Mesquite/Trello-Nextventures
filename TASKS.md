# Tasks

## Pending

### Phase 1: Project Setup

- **T002** | Set up Supabase project and install CLI locally | Backend-Developer | Depends on T001 | **STILL BLOCKED** (retried after user paused Orion Capital and resumed WhatsApp Test XCIEN): Supabase now reports org member "desarrolloapp-boop" (co-admin of hmedina-Mesquite's Org, not an account we have visibility into) is at their 2-free-project cap somewhere outside this org — unaffected by which of our own projects are active/paused. User is resolving directly with Supabase or that account holder. Local CLI is installed, `supabase init` done, migrations for T004-T011 ready to apply the moment a project exists.

### Phase 8: Collaboration & Permissions

- **T028** | Test end-to-end permission scenarios (member vs owner behavior) | Tester | Depends on T027, all UI features complete

### Phase 9: Validation & Testing

- **T029** | Create and run end-to-end tests for critical user flows | Tester | Depends on T028
- **T030** | Verify all RLS policies work correctly in production data | Tester | Depends on T011, T028

### Phase 10: Deployment (Lower Priority)

- **T031** | Set up basic deployment configuration (Vercel or similar) | DevOps | Depends on T030

## Done

- **T001** | Initialize git repo, package.json, and project structure | Vite+React+TS scaffold via `npm create vite`, Tailwind v4 wired into vite.config.ts, deps installed (@supabase/supabase-js, react-router-dom, @dnd-kit/*). package.json renamed to "trello-clone".
- **T003** | Set up frontend framework (React + build tools) | Covered by the Vite scaffold above; folder structure (src/lib, src/contexts, src/pages, src/components, src/hooks) created.
- **T004** | Schema: profiles table + auth.users trigger | supabase/migrations/20260714120001_profiles.sql
- **T005** | Schema: boards, lists, cards | supabase/migrations/20260714120002_boards_lists_cards.sql
- **T006** | Schema: labels, card_labels, checklists, checklist_items, comments | supabase/migrations/20260714120004_labels_checklists_comments.sql
- **T007** | Position fields for drag-and-drop | Included directly in T005's migration (lists.position, cards.position, both double precision for fractional-index reordering)
- **T008** | board_members table with owner/member role | supabase/migrations/20260714120003_board_members.sql, auto-enrolls board creator as owner via trigger
- **T009** | RLS: board access by membership | supabase/migrations/20260714120005_rls_helpers.sql (is_board_member/is_board_owner/card_board_id helpers) + 20260714120006_rls_profiles_boards.sql
- **T010** | RLS: lists/cards/labels/checklists/comments (any board member) | supabase/migrations/20260714120007_rls_content.sql
- **T011** | RLS: owner-only board settings + membership management | supabase/migrations/20260714120008_rls_owner_only.sql
  - Note on T004-T011: written and reviewed locally, not yet applied or verified against a live database — blocked on T002. Will run `supabase link` + push these migrations (or apply_migration via MCP) as soon as the project exists.
- **T012** | Integrate Supabase Auth | src/contexts/AuthContext.tsx — signup/login/signout via supabase.auth, session persisted (supabase-js default localStorage) and kept live via onAuthStateChange
- **T013** | Login/signup UI | src/pages/LoginPage.tsx, src/pages/SignupPage.tsx
- **T014** | Session persistence/logged-in state | Covered by AuthContext + src/components/ProtectedRoute.tsx (redirects to /login when no session)
- **T015** | Board dashboard view | src/pages/DashboardPage.tsx — lists boards the user is a member of (RLS-scoped), create-board form
- **T016** | Board view component | src/pages/BoardPage.tsx — lists ordered by position, each with its cards
- **T017** | Create board UI/logic | Part of DashboardPage.tsx, inserts into boards with owner_id; membership row comes from the DB trigger (T008)
- **T018** | Create list UI/logic | BoardPage.tsx add-list form, position computed as max+1
- **T019** | Create card UI/logic | src/components/ListColumn.tsx add-card form, position computed per-list
- **T020** | Edit/delete boards/lists/cards | Inline rename (board/list/card title), delete with window.confirm, card detail modal (src/components/CardDetailModal.tsx) for description
  - Note on T012-T020: `npm run build` and lint pass clean; not yet smoke-tested against a live backend (still blocked on T002). Needs a real .env with VITE_SUPABASE_URL/ANON_KEY to verify signup trigger, RLS, and position math actually behave against real data.
- **T021** | Card drag-and-drop, persisted | dnd-kit multi-container pattern in BoardPage.tsx; fractional-midpoint position math on drop, single supabase update per move (includes list_id on cross-list moves)
- **T022** | List drag-and-drop, persisted | Same fractional-position approach, horizontal SortableContext of ListColumn (grip-handle `⠿` to avoid fighting inline-rename/delete click targets)
- **T023** | Labels feature | src/components/LabelsPanel.tsx (board-scoped create/delete, 8-color palette); toggle assignment in CardDetailModal; pills shown on CardItem; card_labels for all board cards fetched once (no N+1)
- **T024** | Checklists feature | CardDetailModal.tsx — create/delete checklist, add/toggle/delete items, x/y progress
- **T025** | Comments feature | CardDetailModal.tsx — supabase.from('comments').select('*, profiles(username)'), delete gated to author or board owner (RLS-backed)
- **T026** | Board membership/invite UI | src/components/MembersPanel.tsx — invite by username lookup, owner-only role change/remove, self-service "leave board" for members
- **T027** | Role-based UI enforcement | BoardPage.tsx fetches caller's board_members.role; gates board-rename and MembersPanel's owner-only controls; list/card CRUD intentionally stays open to all members (matches T010's RLS, not an owner-only action)
  - Note on T021-T027: `npm run build` and lint pass clean; still blocked on a live backend for interactive/visual verification. Known simplifications: no live onDragOver cross-container preview (resolves on drop only); a drop anywhere in a list's region other than directly on a card appends to that list's end rather than a precise index — both acceptable given T022 is an explicit stretch goal and neither is testable without T002 unblocked anyway.

