# Current goal

**Set:** 2026-07-15
**Status:** done

Confirmed via a HelmControl New Goal intake chat ("Start This Goal"): a one-to-one Trello clone backed by Supabase, with multi-user accounts and permissions layered on top of Supabase auth. Board creators can invite others by username or email. Boards support fully customizable backgrounds (color wheel or uploaded photo). Cards accept attachments of any type (images, scripts, zip files, links), with image thumbnails previewed inline. An in-app notification section surfaces invites and other events, and cards show a "created" timestamp. Card fronts display a cover image even when no card is open — defaulting to the most recently added image attachment, with the ability to explicitly pick a different attachment as the cover (Trello-style "Make cover"). Also includes fixes for two bugs: cards visually disappearing mid-drag before landing in a new list, and a stray white rectangle appearing when scrolling far right (no visual blockage of any kind, in any color other than the background, should occur).

## Done when
- Multi-user accounts and permissions work on top of Supabase auth: board creators can invite others by username or email, and non-owner members are correctly gated from owner-only actions.
- Boards support fully customizable backgrounds via both a color wheel and an uploaded photo.
- Cards accept attachments of any file type; image attachments show an inline thumbnail preview.
- An in-app notification section surfaces invites and other board events.
- Cards display their creation timestamp.
- Card fronts show a cover image without opening the card — defaulting to the most recently added image attachment — and a user can explicitly pick a different attachment as the cover via a "Make cover" action; the chosen cover persists and is reflected on the card front.
- Dragging a card between lists never makes it disappear mid-drag.
- Scrolling the board as far right as it goes never reveals a stray white (or any other non-background-colored) rectangle.
- All of the above verified live in a real browser against the live Supabase backend, not just via unit/type checks.

## Notes
- Origin: confirmed via HelmControl New Goal intake chat on 2026-07-15 ("Start This Goal").
- Per TASKS.md's Done section, most of this scope was already implemented and verified from prior sessions: accounts/permissions/RLS (T002-T011, T026-T030), username-or-email invites (T032, T035), customizable backgrounds (T034, T037), attachments with image thumbnails (T033, T036, T044-T046), notifications (T040-T043), created timestamp (T038-T039), and both drag-disappear and white-rectangle bugs (T047-T050). The one net-new capability, card-front cover images (T051/T052), is now also done and verified live — see TASKS.md.
- The migration (`cards.cover_attachment_id`) required explicit user authorization to push to the live database — the environment's auto-mode classifier correctly blocked a first attempt at `supabase db push` with no explicit go-ahead; user then explicitly approved it in a follow-up message and it was applied cleanly.
- User caught a real bug via a screenshot mid-build: the first cover-image pass used a fixed-height `object-cover` crop, which cut off non-standard aspect ratios. Fixed to `object-contain` with a `max-h-48` cap instead — the full image is always shown regardless of source ratio (verified with deliberately extreme 1600×300 and 300×1600 test images), only ever scaled down for outliers, never cropped.
- All "Done when" items verified live in a real browser against the live Supabase backend.
