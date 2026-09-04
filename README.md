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
   the points views, and seeds a `Season 1` row plus a starter scoring table.
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

## 2. There's no admin UI right now — here's how setup works instead

By design, this version has no admin page. Season, episode, survivor, and
event-type management all happen directly in **Supabase's Table Editor**
(Database icon in the left sidebar, or the SQL Editor for bulk inserts). The
schema comments in `sql/schema.sql` include ready-to-edit `insert` examples
for each of these. A quick reference:

- **Start a new season:** insert a row into `seasons` with a higher `number`
  than any existing season. The app automatically treats the highest-numbered
  season as "current" everywhere (home page, nav header, My Picks, Scores) —
  there's no season switcher and nothing else to configure.
- **Add survivors:** insert into `survivors`, referencing the current
  season's `id`. Set `original_tribe` / `current_tribe`, and leave
  `eliminated` / `shot_in_the_dark` / `has_vote` at their defaults unless you
  need to set them immediately.
- **Give a survivor an advantage:** insert into `survivor_advantages`
  (survivor_id + a `type` from the fixed list in the schema). A survivor can
  hold several at once — each is its own row. Update `status` to `'used'`
  (rather than deleting) when it's played, so history is preserved.
- **Add an episode:** insert into `episodes`, referencing the season's `id`
  and an episode `number` (unique within that season).
- **Edit scoring (balance changes):** edit `event_types` directly — change a
  `point_value`, add a new row, or set `active = false` to retire one from
  the dropdown without breaking already-logged events. Changing a value here
  only affects *future* events; every already-logged event snapshot its point
  value at the moment it was entered, so past scores never shift.
- **Lock/unlock picks:** this one **does** have a UI — any signed-in user can
  toggle it from the Enter Events page.

If this manual workflow becomes a bottleneck, the next natural step is
re-adding a lightweight setup page — the schema and API routes are already
structured to make that a fairly small addition (see `app/api/survivors`,
`app/api/episodes`, `app/api/event-types` for the read side to build a write
UI against).

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
  in" reference: current tribe, season points, per-episode average, Shot in
  the Dark status, and any active advantages, right next to the stepper.
- **Scores (`/scores`)** — one page, toggle between a stacked bar chart of
  points **by player** or **by survivor**, each bar segmented by episode, plus
  a sorted totals list below.
- **Enter Events (`/events`)** — open to every signed-in user, not just
  admins. Log an event for a survivor in an episode; event types are grouped
  by category in the dropdown. Includes undo, and the pick-lock toggle.
  Intentionally minimal for now — flagged in the UI as something to expand later.

---

## 5. Notes

- **Event entry and pick-locking are open to everyone**, not gated by
  `is_admin`. The `users.is_admin` column still exists for a future admin
  page, but nothing currently checks it.
- **Auth is intentionally simple** — name-only, no passwords. Fine for a
  trusted friend group; swap in Supabase Auth (magic links) if you need more.
- **Advantages** are modeled as their own table
  (`survivor_advantages`) rather than a single field on `survivors`,
  specifically so a survivor can hold more than one at a time (e.g. an Idol
  *and* an Extra Vote simultaneously) and so used advantages stay in history
  instead of being overwritten.

## 6. Project structure

```
app/
  page.tsx                Home (spoiler-free standings)
  picks/page.tsx           My Picks (draft + survivor reference)
  scores/page.tsx           Scores (stacked bar charts, by player/survivor)
  events/page.tsx            Enter Events (open to all signed-in users)
  login/page.tsx               Simple name-based sign-in
  api/
    seasons/current/           Current season (highest season number)
    episodes/                   List/lock episodes (current season)
    survivors/                   List survivors + advantages (current season)
    event-types/                   Dynamic scoring reference table
    events/                          Log/undo events (snapshots point value)
    picks/                             Get/submit picks
    picks/budget/                      Compute a user's multiplier budget
    points/                              Per-episode points, by user or survivor
    standings/                            Season-to-date leaderboard
    users/                                  Name-based login
lib/
  supabaseAdmin.ts        Server-only Supabase client (service role key)
  currentSeason.ts          Resolves "current" = highest season number
  multiplierBudget.ts         Computes base 7 + behind-leader bonus
  types.ts                      Shared TypeScript types + game constants
components/
  NavBar.tsx               Season-aware header, no admin link
  StackedPointsChart.tsx      Recharts stacked bar chart (Scores page)
sql/
  schema.sql              Run once in Supabase; includes setup examples
```
