export interface AppUser {
  id: string;
  name: string;
  is_admin: boolean;
}

export interface Season {
  id: string;
  number: number;
  name: string | null;
}

export const ADVANTAGE_TYPES = [
  "Immunity Idol",
  "Extra Vote",
  "Beware Advantage",
  "Advantage Clue",
  "Steal a Vote",
  "Block a Vote",
  "Idol Nullifier",
  "Knowledge is Power",
] as const;
export type AdvantageType = (typeof ADVANTAGE_TYPES)[number];

// One distinct color per advantage type, used for the tag pills on My Picks.
export const ADVANTAGE_COLORS: Record<AdvantageType, string> = {
  "Immunity Idol": "#B8860B", // bronze/goldenrod
  "Extra Vote": "#4A90D9", // blue
  "Beware Advantage": "#D64545", // red/crimson
  "Advantage Clue": "#C9C24B", // olive/chartreuse
  "Steal a Vote": "#D6449E", // magenta/pink
  "Block a Vote": "#8E44AD", // purple
  "Idol Nullifier": "#D9822B", // orange/amber
  "Knowledge is Power": "#D9D9D9", // whitish grey
};

export interface SurvivorAdvantage {
  id: string;
  survivor_id: string;
  type: AdvantageType;
  status: "active" | "used";
}

export interface Tribe {
  id: string;
  season_id: string;
  name: string;
  color: string;
}

export interface Survivor {
  id: string;
  season_id: string;
  name: string;
  photo_url: string | null;
  original_tribe: string | null;
  current_tribe_id: string | null;
  current_tribe: Tribe | null;
  eliminated: boolean;
  shot_in_the_dark: boolean;
  has_vote: boolean;
  advantages?: SurvivorAdvantage[];
}

export interface Episode {
  id: string;
  season_id: string;
  number: number;
  title: string | null;
  air_date: string | null;
  locked: boolean;
  is_current: boolean;
}

export interface EventType {
  id: string;
  category: string;
  name: string;
  point_value: number;
  active: boolean;
}

export interface SurvivorEvent {
  id: string;
  episode_id: string;
  survivor_id: string;
  event_type_id: string;
  point_value: number;
  created_at: string;
  survivors?: { name: string } | null;
  event_types?: { category: string; name: string } | null;
}

export interface Pick {
  id?: string;
  user_id: string;
  episode_id: string;
  survivor_id: string;
  multiplier: number;
}

export interface LeaderboardRow {
  user_id: string;
  name: string;
  total_points: number;
}

// Every user starts each episode with this many multiplier points to distribute.
export const BASE_MULTIPLIER_BUDGET = 7;
// Each survivor can receive at most this many multiplier points from one user.
export const MAX_MULTIPLIER_PER_SURVIVOR = 3;
// For every this-many points a user trails the season leader (as of the
// previous episode), they gain +1 to their multiplier budget.
export const BEHIND_LEADER_BONUS_THRESHOLD = 100;

export const LOCAL_STORAGE_KEY = "survivorFantasyUser";
