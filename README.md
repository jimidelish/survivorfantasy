# Survivor Fantasy Draft

A multi-season fantasy draft league for Survivor. Each episode, players draft
survivors and split a multiplier budget between them (base 7, plus a bonus for
trailing the season leader), up to 3× on any one survivor. Points come from
events logged during the episode against a fully configurable scoring table.

Built with **Next.js** (App Router), **Supabase** (Postgres), **Recharts**, and
**Tailwind**, deployed on **Vercel's free tier**.

---

## 1. One-time setup

### A. Create the database (Supabase — free tier)

1. Go to [supabase.com](https://supabase.com) and create a project.
2. Open **SQL Editor > New query**, paste in the entire contents of
   [`sql/schema.sql`](./sql/schema.sql), and run it. This creates every table,
   the points views, and seeds a `Season 51` row plus a starter scoring table.
3. Get your three keys from the **Connect** button (or Settings > API Keys):
   Project URL, the **publishable** key (some projects call this "anon"), and
   the **secret** key (some projects call this "service_role").

### B. Run the app locally

```bash
npm install
cp .env.local.example .env.local
# paste your three Supabase values into .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with any name
to create your first account.

### C. Deploy to Vercel (free tier)

1. Push this project to a GitHub repository.
2. Import it at [vercel.com](https://vercel.com) — Vercel auto-detects Next.js.
3. Add the same three environment variables under Project Settings before
   deploying: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`.
4. Click **Deploy**. From then on, `git push` automatically redeploys.

---

## 2. Admin page

Season, episode, survivor, and event-type management now has a UI at `/admin`,
gated to accounts with `is_admin = true`. Make yourself an admin once via the
Supabase SQL Editor:

```sql
update users set is_admin = true where name = 'Your Name';
```

The Admin page has five tabs:

### Season Setup — survivor roster via CSV

Upload a CSV named **`survivors_s{season}.csv`** (e.g. `survivors_s51.csv`).
Templates are in [`templates/`](./templates). Headers:

```
name,photo_url,original_tribe
```

The app parses the season number straight out of the filename. If that
season doesn't exist yet, it's created automatically. This is a **full
replace, scoped to that one season only**: every existing survivor for that
season is deleted (cascading to any picks/events/advantages tied to them)
before the new roster is inserted — other seasons are never touched. There's
a confirmation checkbox in the UI before this runs. Survivors start with no
current tribe assigned (tribes don't exist yet at CSV-upload time) — assign
them afterward in Assign Tribes.

### Season Control — episodes and picks

- Add episodes (number + optional title) for the current season.
- Mark one episode **active** — this is a new concept, separate from
  locking. The active episode is what **My Picks** and **Enter Events**
  default to when a user opens those pages. Only one episode per season can
  be active at a time (enforced at the database level).
- **Lock/unlock** picks per episode — this now lives here instead of on the
  Enter Events page, alongside the other episode-level controls.
- View every user's submitted picks for any episode (survivor + multiplier),
  read-only.

### Event Type Setup — scoring table via CSV

Upload a CSV named **`event_types_s{season}.csv`** (e.g. `event_types_s51.csv`).
Headers:

```
category,name,point_value
```

Event types are **global**, not scoped to a season — the season number in
the filename is only for your own record-keeping, not stored anywhere.
Uploading is a "full replace" of what's *active*, implemented safely: every
currently active event type is deactivated, then every row in the CSV is
upserted (matched on `category` + `name`) as active. Rows already referenced
by logged events are never deleted, only deactivated, so past scores can
never be broken by a balance-change upload.

### Update Survivors — eliminate, tribe, advantages

Per-survivor controls, all saved immediately (no separate save step):
eliminated status, current tribe (a dropdown populated from Assign Tribes),
and advantages — grant a new one, mark an active one used, or remove one
entirely (for correcting a mistaken add; distinct from marking it used,
which keeps the row for history). Shot in the Dark is one of the advantage
types here, not a separate field — Season Setup CSV import grants every
survivor an active one automatically.

### Assign Tribes — manage tribes and drag survivors onto them

Add, rename, recolor, or delete this season's tribes (starting tribes, a
swap, or the merge — all just "tribes," no special case for any of them),
then drag survivor chips between tribe columns to assign them. Deleting a
tribe unassigns its members back to "No tribe" rather than blocking the
delete or touching the survivors themselves.

---

## 3. How the game works

### Multiplier budget

Every user starts each episode with a budget of **7** multiplier points to
spread across their picks, with a **max of 3×** on any single survivor (so a
minimum of 3 survivors picked, no maximum). On top of the base 7, a user gets
**+1 bonus point for every full 100 points they trailed the season point
leader** as of the *previous* episode. Episode 1 always has zero bonus (no
prior standings to compare against). This is computed live by
`lib/multiplierBudget.ts` and enforced server-side in `POST /api/picks` — it's
never stored, so it can't drift out of sync with actual standings.

### Scoring

1. An event type (e.g. "Won individual immunity", worth 5 points) is logged
   against a survivor for a specific episode from the **Enter Events** page.
2. The event stores a **copy** of the point value at that moment (`events.point_value`),
   so later balance changes to `event_types` never rewrite history.
3. A survivor's total points in an episode = sum of their logged events that
   episode (`survivor_episode_points` view).
4. A user's points in an episode = sum, across their picks, of
   `survivor's episode points × multiplier assigned` (`user_episode_points` view).
5. Season standings = sum of a user's points across every episode
   (`user_season_points` view).

All three are SQL views, computed fresh on every read — there's no
materialized/stored points table to keep in sync.

---

## 4. Pages

- **Home (`/`)** — deliberately spoiler-free: a welcome message and only
  season-to-date standings. No per-episode breakdown, no survivor status.
- **My Picks (`/picks`)** — pick an episode, see your multiplier budget (with
  an explanation if you're getting a trailing-leader bonus), and assign
  multipliers to survivors. Each survivor card doubles as the "who's still
  in" reference: current tribe, season points, per-episode average, and any
  active advantages (Shot in the Dark included) as colored tags, right next
  to the stepper.
- **Scores (`/scores`)** — one page, toggle between a stacked bar chart of
  points **by player** or **by survivor**, each bar segmented by episode, plus
  a sorted totals list below.
- **Enter Events (`/events`)** — open to every signed-in user, not just
  admins. Checkboxes for survivors (photo + name, eliminated ones shown
  greyed out but still selectable) and for event types (grouped by
  category) — logging creates one event per survivor × event type
  combination in a single "Log event(s)" click, for scenes where several
  people do the same thing or one person does several things at once. A
  toggle button per tribe checks/unchecks all of that tribe's survivors at
  once. Includes undo per logged event.

---

## 5. Notes

- **Event entry stays open to everyone**, not gated by `is_admin` — logging
  events and undoing them can be done by any signed-in user. Episode-level
  controls (locking, setting the active episode, season/event-type setup)
  are admin-only, at `/admin`.
- **"Active episode" is separate from "locked."** Active determines what My
  Picks and Enter Events default to; locked determines whether picks can
  still be submitted/changed. You'll usually flip both together (make an
  episode active when it airs, lock it once tribal council happens), but
  they're independent so you have room to, say, unlock a past episode to fix
  a mistake without changing what's currently "active."
- **Auth is intentionally simple** — name-only, no passwords. Fine for a
  trusted friend group; swap in Supabase Auth (magic links) if you need more.
- **Advantages** are modeled as their own table
  (`survivor_advantages`) rather than a single field on `survivors`,
  specifically so a survivor can hold more than one at a time (e.g. an Idol
  *and* an Extra Vote simultaneously) and so used advantages stay in history
  instead of being overwritten.
- **CSV uploads are destructive by design**, not incremental — see section 2
  above for exactly what each one deletes/deactivates. Both require a
  confirmation checkbox in the UI before running.

## 6. Project structure

```
app/
  page.tsx                Home (spoiler-free standings)
  picks/page.tsx           My Picks (draft + survivor reference)
  scores/page.tsx           Scores (stacked bar charts, by player/survivor)
  events/page.tsx            Enter Events (open to all signed-in users)
  admin/page.tsx              Admin: Season Setup / Control / Event Types / Update Survivors / Assign Tribes
  login/page.tsx                Simple name-based sign-in
  api/
    seasons/current/           Current season (highest season number)
    episodes/                   List/create episodes (current season)
    episodes/[id]/                Lock/unlock, set active episode
    survivors/                   List survivors + tribe + advantages (current season)
    tribes/                       List tribes (current season)
    event-types/                   Dynamic scoring reference table
    events/                          Get/undo events (snapshots point value)
    events/bulk/                       Log events for every (survivor x event type) pair at once
    picks/                             Get/submit picks
    picks/budget/                      Compute a user's multiplier budget
    points/                              Per-episode points, by user or survivor
    standings/                            Season-to-date leaderboard
    users/                                  Name-based login
    admin/survivors-csv/                     Season Setup CSV upload
    admin/event-types-csv/                     Event Type Setup CSV upload
    admin/picks/                                 View picks by user (admin)
    admin/survivors/[id]/                         Update eliminated status/tribe
    admin/advantages/, admin/advantages/[id]/       Grant/mark-used/remove advantages
    admin/tribes/, admin/tribes/[id]/                 Add/rename/recolor/delete tribes
lib/
  supabaseAdmin.ts        Server-only Supabase client (service role key)
  currentSeason.ts          Resolves "current" = highest season number
  multiplierBudget.ts         Computes base 7 + behind-leader bonus
  csvFilenames.ts                Parses season number out of CSV filenames
  types.ts                          Shared TypeScript types + game constants
components/
  NavBar.tsx               Season-aware header, admin link for admins
  StackedPointsChart.tsx      Recharts stacked bar chart (Scores page)
  CsvUpload.tsx                  Drag-and-drop CSV upload widget (Admin page)
  SurvivorAvatar.tsx               Photo w/ broken-image fallback (My Picks, Enter Events)
templates/
  survivors_s51.csv        Example roster CSV
  event_types_s51.csv        Example scoring CSV
sql/
  schema.sql              Run once in Supabase; includes setup examples
```
