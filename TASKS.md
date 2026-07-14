# Tasks

## Pending

### Phase 1: Project Setup

- **T002** | Set up Supabase project and install CLI locally | Backend-Developer | Depends on T001 | **BLOCKED**: org member "desarrolloapp-boop" (co-admin of hmedina-Mesquite's Org) is at their 2-free-project cap in an org we can't see into; pausing our own org's other free project (WhatsApp Test XCIEN) didn't clear it. User is resolving directly with Supabase (upgrade plan or free a slot), will tell us when to retry `create_project`. Local CLI (`supabase`) is already installed and `supabase init` has been run; migrations for T004-T011 are written and ready to apply once a project exists.

### Phase 4: Authentication

- **T012** | Integrate Supabase Auth (signup and login endpoints) | Backend-Developer | Depends on T004
- **T013** | Create login/signup UI components | Frontend-Developer | Depends on T003, T012
- **T014** | Implement session persistence and logged-in state management | Frontend-Developer | Depends on T013

### Phase 5: Core UI — Boards, Lists, Cards

- **T015** | Create board dashboard/list view (show all user's boards) | Frontend-Developer | Depends on T014
- **T016** | Create board view component with lists and cards layout | Frontend-Developer | Depends on T015, T005
- **T017** | Implement create board UI and logic (call Supabase API) | Frontend-Developer | Depends on T015, T009
- **T018** | Implement create list UI and logic within a board | Frontend-Developer | Depends on T016
- **T019** | Implement create card UI and logic within a list | Frontend-Developer | Depends on T016
- **T020** | Implement edit and delete for boards, lists, and cards | Frontend-Developer | Depends on T017, T018, T019

### Phase 6: Drag-and-Drop

- **T021** | Implement card drag-and-drop between lists with persistence | Frontend-Developer | Depends on T007, T020
- **T022** | Implement list drag-and-drop with position persistence (stretch goal) | Frontend-Developer | Depends on T007, T021

### Phase 7: Additional Features

- **T023** | Implement labels feature (create, assign to cards, display) | Frontend-Developer | Depends on T020
- **T024** | Implement checklists feature (create, add items, mark complete) | Frontend-Developer | Depends on T020
- **T025** | Implement comments feature (add, view, delete on cards) | Frontend-Developer | Depends on T020

### Phase 8: Collaboration & Permissions

- **T026** | Create board membership/invite UI (add user to board with role) | Frontend-Developer | Depends on T017, T008
- **T027** | Implement role-based permission enforcement in UI (hide/disable owner-only actions for members) | Frontend-Developer | Depends on T026, T011
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

