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
  `number` — no season-switcher UI. Resolved server-side by
  `lib/currentSeason.ts`. Currently on **Season 51**.
- **Multiplier budget** (`lib/multiplierBudget.ts`): every user gets a base of
  7 points to split across survivors each episode, +1 bonus for every full
  100 points they trailed the season point leader as of the *previous*
  episode. Max 3× on any single survivor, no cap on how many survivors.
  Computed live, never stored — depends on `user_episode_points` view.
- **Points** are three SQL views, computed fresh on every read, never
  materialized: `survivor_episode_points`, `user_episode_points`,
  `user_season_points`. See schema comments for the exact joins.
- **Events snapshot their point value** at the moment they're logged
  (`events.point_value` is a copy of `event_types.point_value` at insert
  time), so later balance changes to `event_types` never rewrite history.
  Enter Events (`/events`) logs in bulk: checking N survivors and M event
  types and clicking "Log event(s)" creates N×M individual event rows in
  one call to `POST /api/events/bulk` (one scene, multiple people and/or
  multiple things at once) — there's no grouping concept above the
  individual `events` rows, so each one still undoes independently.
- **"Active episode" ≠ "locked."** `episodes.is_current` (one true per season,
  enforced by a partial unique index) is what My Picks / Enter Events default
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
  cascading). `survivors.original_tribe` stays plain text — it's a one-time
  snapshot from the Season Setup CSV and is never tribe-referenced. A null
  `current_tribe_id` renders as "No tribe" with no color styling.

## Admin page (`/admin`, gated by `users.is_admin`)

- **Season Setup**: upload `survivors_s{N}.csv` (e.g. `survivors_s51.csv`).
  Full replace, scoped to only that one season (creates the season if it
  doesn't exist). Headers: `name,photo_url,original_tribe`. Survivors start
  with `current_tribe_id = null` — assign real tribes afterward via
  Assign Tribes, since tribes don't exist yet at CSV-upload time.
- **Season Control**: add episodes, set the active one, lock/unlock, view
  picks by user per episode.
- **Event Type Setup**: upload `event_types_s{N}.csv`. Event types are
  global, not season-scoped — the filename's season number is just for the
  uploader's own record-keeping. "Full replace" is implemented as
  deactivate-all-then-upsert (matched on `category`+`name`), never a hard
  delete, so it can't break events that already reference an old row.
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
   by My Picks and Enter Events) for the correct pattern — also sets
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
