-- Run this entire file once in the Supabase SQL Editor to (re)create everything.
-- If you're upgrading from the single-season version of this app, back up any
-- data you want to keep first — this schema is a breaking change (season-scoped
-- tables, new advantages model, snapshot-on-entry event points).

create extension if not exists "pgcrypto";

-- ============================================================
-- SEASONS
-- "Current season" (used by every page except Admin > Season Control,
-- which has its own season picker) is always whichever row has the
-- highest `number`. To start a new season, just insert a new row here
-- with a higher number — everything else (episodes, survivors, picks)
-- is scoped to a season_id and the app will automatically start
-- pointing at the new one.
-- ============================================================
create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique,
  name text,
  -- Toggled from Admin > Season Control. While true, POST /api/winner-pick
  -- rejects new/changed winner picks for this season server-side (same
  -- enforcement style as episodes.locked on POST /api/picks) — not just a
  -- client-side admin-UI gate.
  winner_picks_locked boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- USERS
-- Simple name-based login, no password. is_admin is kept for a
-- future admin page but nothing currently checks it.
-- ============================================================
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TRIBES
-- Scoped to a season. Created/renamed/recolored/deleted via
-- Admin > Assign Tribes as swaps and the merge happen through the season.
-- Deleting a tribe just unassigns its members (current_tribe_id -> null,
-- rendered as "no tribe" / default styling) rather than blocking the
-- delete or cascading. `original_tribe` on survivors is NOT a reference
-- to this table — it's a plain text snapshot of the starting tribe from
-- the season-setup CSV and never changes after import.
-- ============================================================
create table if not exists tribes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  name text not null,
  color text not null, -- hex, e.g. '#7B3FA0'
  created_at timestamptz not null default now(),
  unique (season_id, name)
);

create index if not exists idx_tribes_season on tribes(season_id);

-- ============================================================
-- SURVIVORS
-- Scoped to a season since the cast is different every time.
-- ============================================================
create table if not exists survivors (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  name text not null,
  photo_url text,
  original_tribe text,
  current_tribe_id uuid references tribes(id) on delete set null,
  eliminated boolean not null default false,
  has_vote boolean not null default true, -- false = hit with a "no vote" twist/punishment
  -- The host (Jeff Probst) — pickable and scored per-season like any other
  -- survivor, but never eliminated/tribe-assigned/vote-locked; the app
  -- hides those controls for is_host rows rather than making eliminated/
  -- has_vote nullable. Auto-created for every season by the Season Setup
  -- CSV upload (app/api/admin/survivors-csv/route.ts), which also excludes
  -- is_host rows from its full-replace delete, so re-uploading a season's
  -- cast roster never touches the host row (or his picks/events history).
  is_host boolean not null default false,
  created_at timestamptz not null default now(),
  unique (season_id, name)
);

create unique index if not exists idx_one_host_per_season
  on survivors(season_id) where is_host;

create index if not exists idx_survivors_season on survivors(season_id);

-- A survivor can hold several advantages at once. Each row is one advantage;
-- mark it 'used' (rather than deleting) so history is preserved.
create table if not exists survivor_advantages (
  id uuid primary key default gen_random_uuid(),
  survivor_id uuid not null references survivors(id) on delete cascade,
  type text not null check (type in (
    'Immunity Idol', 'Extra Vote', 'Beware Advantage', 'Advantage Clue',
    'Steal a Vote', 'Block a Vote', 'Idol Nullifier', 'Knowledge is Power',
    'Shot in the Dark'
  )),
  status text not null default 'active' check (status in ('active', 'used')),
  acquired_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists idx_survivor_advantages_survivor on survivor_advantages(survivor_id);

-- ============================================================
-- EPISODES
-- Scoped to a season. Number is unique within a season, not globally.
-- ============================================================
create table if not exists episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  number integer not null,
  title text,
  air_date timestamptz,
  locked boolean not null default false,
  is_current boolean not null default false, -- the one episode users draft/log events for by default
  created_at timestamptz not null default now(),
  unique (season_id, number)
);

create index if not exists idx_episodes_season on episodes(season_id);

-- Enforces at most one "active" episode per season. The app also handles
-- this in code (unsetting the old one when a new one is marked active),
-- but this index is a hard backstop against ever having two.
create unique index if not exists idx_episodes_one_active_per_season
  on episodes(season_id) where is_current;

-- ============================================================
-- EVENT TYPES
-- A single evolving scoring table, NOT scoped to a season or episode.
-- Edit point values, add, or retire entries any time — because `events`
-- snapshots the point value at the moment it's logged (see below),
-- changing a value here never rewrites history, only affects future events.
-- Set `active = false` to hide an old event type from the entry form
-- without breaking existing events that reference it.
-- ============================================================
create table if not exists event_types (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  point_value integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (category, name)
);

-- ============================================================
-- EVENTS
-- What actually happened, per survivor, per episode. point_value is a
-- COPY of event_types.point_value at the moment this row was inserted,
-- so later balance changes to event_types don't retroactively alter
-- points that were already scored.
-- ============================================================
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references episodes(id) on delete cascade,
  survivor_id uuid not null references survivors(id) on delete cascade,
  event_type_id uuid not null references event_types(id) on delete restrict,
  point_value integer not null,
  entered_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Set only for "trigger" event types (see lib/eventTriggers.ts). Records
  -- exactly what this event automatically changed on the survivors/
  -- survivor_advantages tables, so Undo and "Clear all events" can reverse
  -- precisely that, not just guess at the current state. Null for every
  -- other (non-trigger) event type.
  trigger_effect jsonb
);

create index if not exists idx_events_episode on events(episode_id);
create index if not exists idx_events_survivor on events(survivor_id);

-- ============================================================
-- PICKS
-- One row per (user, episode, survivor). Multiplier is 1-3.
-- The app enforces (server-side) that the multipliers a user assigns
-- for a given episode sum to exactly their budget for that episode
-- (base 7, +1 per full 100 points they trailed the leader after the
-- previous episode) — that logic lives in the API, not the database,
-- since it depends on computing standings as of the previous episode.
-- ============================================================
create table if not exists picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  episode_id uuid not null references episodes(id) on delete cascade,
  survivor_id uuid not null references survivors(id) on delete cascade,
  multiplier integer not null check (multiplier >= 1 and multiplier <= 3),
  created_at timestamptz not null default now(),
  unique (user_id, episode_id, survivor_id)
);

create index if not exists idx_picks_user_episode on picks(user_id, episode_id);

-- ============================================================
-- WINNER PICKS
-- One survivor per (user, season) — a season-long bet, not tied to any
-- episode's weekly picks/budget. Worth +1x that survivor's points on top
-- of whatever the user separately picks them at each week (stacks, doesn't
-- replace), for every episode of the season including ones before the
-- pick was made and ones after the survivor is eliminated. Freely
-- changeable (upsert on user_id+season_id) until an admin locks the season
-- via Admin > Season Control (seasons.winner_picks_locked).
-- ============================================================
create table if not exists winner_picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  season_id uuid not null references seasons(id) on delete cascade,
  survivor_id uuid not null references survivors(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, season_id)
);

create index if not exists idx_winner_picks_season on winner_picks(season_id);

-- ============================================================
-- POINTS CALCULATION VIEWS
-- Computed on the fly from events/picks, so they're always in sync —
-- no separate table to keep updated when events or event_types change.
-- ============================================================

-- Total points each survivor scored in each episode.
create or replace view survivor_episode_points as
select
  e.episode_id,
  e.survivor_id,
  sum(e.point_value) as points
from events e
group by e.episode_id, e.survivor_id;

-- Total points each user scored in each episode from their weekly picks
-- ONLY — deliberately does NOT include the winner-pick bonus, so the
-- multiplier budget's trailing-leader calculation (lib/multiplierBudget.ts)
-- stays unaffected by that separate, still-being-balanced feature, and so
-- this number stays queryable on its own as a "without winner pick"
-- baseline for as long as that's useful. See user_episode_points_with_
-- winner_pick below for the total actually shown as real standings.
create or replace view user_episode_points as
select
  p.user_id,
  p.episode_id,
  sum(coalesce(sep.points, 0) * p.multiplier) as points
from picks p
left join survivor_episode_points sep
  on sep.episode_id = p.episode_id and sep.survivor_id = p.survivor_id
group by p.user_id, p.episode_id;

-- Just the winner-pick bonus component, isolated: a user's winner pick's
-- survivor's points that episode (flat x1), for every episode of that
-- pick's season — even one where they didn't separately pick that
-- survivor at all, and even after the survivor is eliminated.
create or replace view winner_pick_episode_points as
select
  wp.user_id,
  e.id as episode_id,
  coalesce(sep.points, 0) as points
from winner_picks wp
join episodes e on e.season_id = wp.season_id
left join survivor_episode_points sep
  on sep.episode_id = e.id and sep.survivor_id = wp.survivor_id;

-- The "real" per-episode total: weekly-picks points plus the winner-pick
-- bonus. A full outer join because either side can have a row the other
-- lacks (e.g. a winner pick with no matching weekly pick that episode).
-- This — not the plain user_episode_points above — is what Scores and
-- Home standings actually display.
create or replace view user_episode_points_with_winner_pick as
select
  coalesce(uep.user_id, wpp.user_id) as user_id,
  coalesce(uep.episode_id, wpp.episode_id) as episode_id,
  coalesce(uep.points, 0) + coalesce(wpp.points, 0) as points
from user_episode_points uep
full outer join winner_pick_episode_points wpp
  on uep.user_id = wpp.user_id and uep.episode_id = wpp.episode_id;

-- Season-to-date totals per user, weekly picks only — feeds the
-- multiplier budget's "behind the leader" bonus, and doubles as the
-- "without winner pick" comparison baseline.
create or replace view user_season_points as
select
  ep.season_id,
  uep.user_id,
  sum(uep.points) as points
from user_episode_points uep
join episodes ep on ep.id = uep.episode_id
group by ep.season_id, uep.user_id;

-- Season-to-date totals including the winner-pick bonus — what Home
-- standings and Scores actually display as real season totals.
create or replace view user_season_points_with_winner_pick as
select
  ep.season_id,
  uepw.user_id,
  sum(uepw.points) as points
from user_episode_points_with_winner_pick uepw
join episodes ep on ep.id = uepw.episode_id
group by ep.season_id, uepw.user_id;

-- ============================================================
-- SEED DATA
-- ============================================================
insert into seasons (number, name) values (51, 'Survivor 51')
on conflict do nothing;

insert into event_types (category, name, point_value) values
  ('Challenge', 'Won individual immunity', 5),
  ('Challenge', 'Won team/tribe immunity', 3),
  ('Challenge', 'Won reward challenge', 2),
  ('Advantage', 'Found hidden immunity idol', 3),
  ('Advantage', 'Played idol successfully', 4),
  ('Advantage', 'Found an advantage (any type)', 2),
  ('Strategy', 'Made a big strategic move', 2),
  ('Tribal Council', 'Received a vote at tribal council', -1),
  ('Tribal Council', 'Voted out', -5),
  ('Other', 'Eliminated (medical or quit)', -5)
on conflict (category, name) do nothing;

-- Make your own account an admin so you can access /admin:
-- update users set is_admin = true where name = 'YOUR NAME HERE';

-- Survivors and event types are managed from the Admin page via CSV upload
-- (see README section "Admin page" for the file naming scheme and templates).
-- Advantages are still added manually, since they change constantly during
-- an episode and a CSV round-trip would be slower than just doing this:
-- insert into survivor_advantages (survivor_id, type)
--   values ('<survivor-uuid>', 'Immunity Idol');

-- Episodes are created from Admin > Season Control. If you ever need to do
-- it manually instead:
-- insert into episodes (season_id, number, title) values ('<season-uuid>', 1, 'Premiere');

-- Start a new season later: just insert a survivors CSV named survivors_s52.csv
-- (or whatever the new season number is) from the Admin page — it creates the
-- season row automatically if it doesn't exist yet.
