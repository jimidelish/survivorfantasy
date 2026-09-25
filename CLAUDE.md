# Survivor Fantasy Draft — Project Context

This is a multi-season fantasy draft web app for the TV show Survivor. Users
draft survivors each episode and split a multiplier budget between them;
points come from admin/user-logged in-episode events. Built with Claude in
a chat interface across many iterations — this file summarizes decisions and
conventions so work can continue smoothly in Claude Code.

## Stack

Next.js (App Router, TypeScript) + Supabase (Postgres) + Tailwind + Recharts,
deployed on Vercel's free tier, connected to a GitHub repo for auto-deploy on push.

## Read these first

- `README.md` — full setup instructions, admin page docs, game rules, project structure
- `sql/schema.sql` — the whole database schema, with inline comments explaining
  design choices and manual-entry SQL examples
- `lib/types.ts` — shared types and game constants (multiplier budget numbers, etc.)

## Core game logic (the parts most likely to need touching)

- **"Current season"** is always whichever row in `seasons` has the highest
  `number` — every page uses this except Admin > Season Control, which has
  its own season picker (see below). Resolved server-side by
  `lib/currentSeason.ts`. Currently on **Season 51**.
- **Auth stays name-only** (pick from a list, `localStorage`, no per-user
  passwords) **except selecting an admin account**, which requires a single
  shared passphrase (`ADMIN_ACCESS_PASSWORD` env var, checked server-side by
  `POST /api/admin/verify-password`, prompted inline on the login page
  before `localStorage` is set to that identity). It's a deterrent, not
  real per-user auth — one password unlocks every admin account, and if the
  env var isn't set, nobody can sign in as an admin at all.
- **Multiplier budget** (`lib/multiplierBudget.ts`): every user gets a base of
  7 points to split across survivors each episode, +1 bonus for every full
  100 points they trailed the season point leader as of the *previous*
  episode. Max 3× on any single survivor, no cap on how many survivors.
  Computed live, never stored — depends on `user_episode_points` view.
- **Points** are SQL views, computed fresh on every read, never
  materialized. `survivor_episode_points` is the base. `user_episode_points`
  / `user_season_points` are **weekly picks only, deliberately excluding
  the winner-pick bonus** — this is what `lib/multiplierBudget.ts`'s
  trailing-leader calculation reads, and it's also the "without winner
  pick" baseline, kept queryable on its own since that feature is still
  being balanced/may change. `winner_pick_episode_points` isolates just the
  bonus component. `user_episode_points_with_winner_pick` /
  `user_season_points_with_winner_pick` (both `full outer join`s, since
  either side can have a row the other lacks) are the **real totals** —
  what `/api/standings` (Home) and `/api/points?by=user` (Scores) actually
  query. If this feature is ever removed or reworked, those are the two
  routes to repoint back at the plain views. See schema comments for the
  exact joins.
- **Winner picks** (`winner_picks` table, one row per `user_id`+`season_id`):
  a user's single season-long bet on who wins, set/changed freely on My
  Picks until an admin locks it (`seasons.winner_picks_locked`, toggled
  from Season Control, enforced server-side by `POST /api/winner-pick` the
  same way `episodes.locked` gates `POST /api/picks`). Worth a flat +1x
  that survivor's points every episode of the season — retroactively for
  episodes before the pick was made, and continuing after the survivor is
  eliminated — **on top of** whatever the user separately picks them at
  that week (stacks, uncapped). Can't be an eliminated survivor or the
  host.
- **Events snapshot their point value** at the moment they're logged
  (`events.point_value` is a copy of `event_types.point_value` at insert
  time), so later balance changes to `event_types` never rewrite history.
  Episode Events (`/events`) logs in bulk: checking N survivors and M event
  types and clicking "Log event(s)" creates N×M individual event rows in
  one call to `POST /api/events/bulk` (one scene, multiple people and/or
  multiple things at once) — there's no grouping concept above the
  individual `events` rows, so each one still undoes independently.
  Episode Events is readable by every signed-in user, but logging/undo/
  Clear all events are gated to `user.is_admin` client-side (same pattern
  as Update Survivors, Assign Tribes, Scoring Guide's edit controls) — no
  server-side check on the API routes themselves, consistent with the rest
  of the app's admin gating.
- **Trigger events** (`lib/eventTriggers.ts`) are a fixed set of 21
  (category, name) pairs that, beyond just logging, also automatically
  change the survivor's row (add/mark-used an advantage, set `eliminated`,
  change `has_vote`). Trigger identity and behavior are hardcoded in code
  — never parsed from the uploaded CSV — because free-text "what this does"
  can't safely become executable logic. `event_types_s{N}.csv` uploads
  (Admin > Event Type Setup) are rejected unless their first 21 rows are
  exactly these (category, name) pairs, in this exact order (only
  `point_value` may differ). What actually changed is recorded on
  `events.trigger_effect` (jsonb) so Undo and "Clear all events"
  (`lib/triggerEngine.ts`'s `reverseTriggerEffect`) can reverse precisely
  that, not just guess at current state. One trigger — "Advantage Given
  to/Used for Someone Else" — can't apply automatically (needs to know
  which advantage, given-or-used, and who to) and instead logs normally,
  then surfaces a modal on the Episode Events page
  (`POST /api/events/[id]/advantage-transfer` completes it). Choosing
  "given to someone" also logs a normal event for the recipient (that
  type's "Obtains" trigger, via `lib/eventTriggers.ts`'s
  `getObtainEventFor`) recording that they received it — "used for
  someone" does not, since nothing changes hands. That extra event is
  tracked on the *original* event's `trigger_effect.createdEventId` so
  undoing the transfer removes it too. If a "Uses"
  trigger fires with no matching active advantage to act on, the event
  still logs — a warning is shown instead of blocking.
- **"Active episode" ≠ "locked."** `episodes.is_current` (one true per season,
  enforced by a partial unique index) is what My Picks / Episode Events default
  to. `episodes.locked` is a separate flag controlling whether picks can
  still be submitted. Both are set from Admin > Season Control.
- **Advantages** are their own table (`survivor_advantages`), not a field on
  `survivors`, so a survivor can hold several at once (e.g. an Idol AND an
  Extra Vote). Rows get `status = 'used'` rather than being deleted.
  **Shot in the Dark is one of these advantage types**, not a boolean field
  on `survivors` (it used to be `survivors.shot_in_the_dark`, since removed)
  — Season Setup CSV import auto-grants every survivor an active "Shot in
  the Dark" row, same as the old "everyone starts eligible" default.
- **Tribes** are a season-scoped table (`tribes`: name + color), not free
  text. `survivors.current_tribe_id` references it (`on delete set null`,
  so deleting a tribe just unassigns its members rather than blocking or
  cascading). A null `current_tribe_id` renders as "No tribe" with no color
  styling.
- **Tribe history** (`survivor_tribe_history`, replacing the old
  `survivors.original_tribe` free-text snapshot) records every real tribe
  assignment a survivor has ever had, in order — appended automatically by
  `PATCH /api/admin/survivors/[id]` (the single code path both Update
  Survivors' dropdown and Assign Tribes' drag-and-drop go through) whenever
  `current_tribe_id` changes to a *new, non-null* tribe. Unassigning to
  null, and a no-op "change" to the tribe they're already on, don't create
  an entry. `tribe_name`/`tribe_color` are **snapshotted** at assignment
  time (same philosophy as `events.point_value`), not a live FK to
  `tribes` — a later rename/recolor/delete of that tribe never rewrites a
  survivor's past. My Picks renders the full chain, all but the last
  struck through. Admin > Update Survivors shows the same chain with a
  delete (×) button on each past entry (`DELETE
  /api/admin/tribe-history/[id]`) for correcting a mistaken assignment —
  that route refuses to delete the *most recent* entry for a survivor,
  since My Picks' "current tribe" display is just "last entry in history,"
  and that has to stay in sync with `survivors.current_tribe_id`.
  **Assign Tribes' drag-and-drop is staged, not immediate** — dragging only
  updates local component state (`pendingAssignments` in
  `app/admin/page.tsx`); the actual `PATCH` calls (and therefore any
  history entries) only fire when "Save changes" is confirmed, batching
  every staged move in one `Promise.all`. This exists specifically so
  trial-and-error dragging doesn't spam history with intermediate moves.
  Update Survivors' tribe dropdown is unaffected — it still saves
  immediately, same as everything else on that tab.
- **The host** (`survivors.is_host`, e.g. Jeff Probst) is a real
  `survivors` row — pickable on My Picks and scored per-season through the
  exact same picks/events machinery as any cast member — but never
  eliminated, tribe-assigned, or vote-locked; the app hides those controls
  for `is_host` rows rather than making `eliminated`/`has_vote` nullable.
  `/api/survivors` sorts `eliminated asc, is_host asc, name asc`, which is
  what puts him after the active cast and before eliminated survivors
  (he's never eliminated himself, so alphabetical order alone would place
  him among the active group by name). Auto-created by the Season Setup
  CSV upload for every season (`app/api/admin/survivors-csv/route.ts`
  inserts one if `is_host = true` doesn't already exist for that
  `season_id`) — that same route's full-replace delete explicitly excludes
  `is_host` rows, so re-uploading a season's cast never touches him or his
  history. `idx_one_host_per_season` is a partial unique index backstopping
  "at most one per season."

## Admin page (`/admin`, gated by `users.is_admin`)

- **Season Control** has a season picker (`GET /api/seasons`, every season
  newest-first — distinct from `GET /api/seasons/current`, which every
  other page uses and which is always the highest number). Episode
  list/add/lock/set-active/delete and "Picks by user" all operate on
  whichever season is selected there, not necessarily the current one —
  `GET/POST /api/episodes` take an optional `season_id` (falling back to
  current-season when omitted, which is what My Picks/Episode Events do —
  they're untouched by this). Delete cascade-deletes an episode's
  picks/events at the DB level, but first reverses any `trigger_effect` on
  those events — same as "Clear all events" — so it can't silently leave a
  survivor eliminated/advantaged with no event left to explain why.
  **Season Setup no longer exists as its own tab** — it's the CSV upload
  section at the bottom of Season Control now (still creates the season
  from the CSV filename if it doesn't exist, and still full-replaces that
  season's cast — independent of whichever season is selected in the
  picker above it, which only drives episodes/picks). A **Lock/Unlock
  winner picks** button (`PATCH /api/admin/seasons/[id]`) also lives here,
  toggling `winner_picks_locked` for whichever season is selected.
- **Event Type Setup no longer exists as a tab** — sunset in favor of the
  public `/scoring` (Scoring Guide) page, which does everything it did
  (same `event_types_s{N}.csv` upload, same `POST /api/admin/event-types-csv`
  endpoint and full-replace/21-trigger-validation behavior) plus inline
  per-row point-value editing (`PATCH /api/admin/event-types/[id]`) for
  admins, visible to everyone else as a read-only reference.
- **Update Survivors**: per-survivor eliminated / current tribe (dropdown,
  populated from Assign Tribes) / advantages (including granting/using Shot
  in the Dark, just like any other advantage type), all saved immediately
  (no separate save step).
- **Assign Tribes**: add/rename/recolor/delete this season's tribes, and
  drag survivors between tribe columns (native HTML5 drag-and-drop, no
  added dependency) to set `current_tribe_id`. Used for starting tribes,
  mid-season swaps, and the merge — all just "tribes," no special merge
  concept in the data model.
- Templates for both CSVs are in `/templates`.

## Design system

Deliberately not a generic SaaS look — a "tribal council at night" theme:
- Colors (see `tailwind.config.ts`): `jungle` (near-black green bg), `surface`
  / `surface2` (panel backgrounds), `ember` (primary accent, burnt orange),
  `gold` (secondary accent), `parchment` (primary text), `muted` (secondary
  text/labels), `rust` (errors/destructive/locked states).
- Fonts: `Oswald` (`font-display`, headings) + `Work Sans` (`font-body`, everything else).
- `.rope-divider` (thin gold gradient rule) instead of card borders/shadows
  between sections. `.pip` / `.pip.filled` for the multiplier budget dots.

## Hard-won bugs already fixed (don't reintroduce these)

1. **Next.js caches GET route handlers** that don't use dynamic request data.
   Every route in `app/api/**/route.ts` has `export const dynamic = "force-dynamic";`
   — keep this on any new API route.
2. **`next.config.mjs`** also sets `Cache-Control: no-store` on `/api/:path*`
   globally, since `force-dynamic` alone doesn't stop browser/CDN-level caching.
3. **CSV files must be UTF-8.** Files saved as Windows-1252/ANSI (common Excel
   default on Windows) corrupt curly quotes/nicknames into `�` when read.
   Not currently auto-detected or fixed in code — user must re-save as UTF-8.
4. **Broken image fallbacks must use React state**, not imperative
   `element.style.display = "none"` in an `onError` handler — the latter gets
   wiped out on the next unrelated re-render, causing the browser's default
   broken-image icon to reappear. See `components/SurvivorAvatar.tsx` (shared
   by My Picks and Episode Events) for the correct pattern — also sets
   `referrerPolicy="no-referrer"`, since Fandom/Wikia's image CDN 404s
   requests that carry a cross-site `Referer` header (hotlink protection).
5. **`force-dynamic` alone does not stop `fetch()` calls made *inside* a
   route from being cached.** It only stops the route's own output from
   being cached — Next.js's separate Data Cache still applies to individual
   `fetch()` calls by default, and that cache **persists across
   deployments** (a redeploy will NOT clear it). This let the app serve
   stale Supabase data for an unpredictable window — sometimes minutes,
   once observed as long as a day — after an edit, even on a hard refresh.
   Fixed in `lib/supabaseAdmin.ts` by passing a custom `fetch` that forces
   `cache: "no-store"` on every request the Supabase client makes. If a
   future data source is added that isn't routed through `supabaseAdmin`,
   it needs this same treatment.

## Current state / what's been tested

- Season 51 roster (21 survivors) loaded via CSV, including photos and tribes.
- Admin account configured.
- Deployed and working on Vercel, connected to a single Supabase project.
- Not yet tested: a full episode end-to-end (create episode → set active →
  users submit picks → log events → lock → check Scores page charts render
  correctly with real data).

## Known gaps / likely next steps

- No mobile-specific polish pass yet.
- No automatic air-time-based locking (locking is fully manual, by design).
- CSV encoding isn't validated/auto-corrected on upload — a bad encoding
  currently has to be caught by the user and fixed before re-uploading.
- Advantages are still added one-by-one directly in Supabase's table editor
  (no UI) — mentioned in README as a deliberate scope cut, not an oversight.
