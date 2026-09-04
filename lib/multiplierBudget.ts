import supabaseAdmin from "@/lib/supabaseAdmin";
import {
  BASE_MULTIPLIER_BUDGET,
  BEHIND_LEADER_BONUS_THRESHOLD,
} from "@/lib/types";

export interface MultiplierBudget {
  base: number;
  bonus: number;
  budget: number;
  leaderPoints: number;
  userPoints: number;
  previousEpisodeNumber: number | null;
}

// Budget = base 7, +1 for every full 100 points this user trailed the
// season's point leader as of the episode immediately before this one.
// The very first episode of a season always has bonus 0 (nothing to
// compare against yet).
export async function computeMultiplierBudget(
  userId: string,
  episodeId: string
): Promise<MultiplierBudget> {
  const { data: episode } = await supabaseAdmin
    .from("episodes")
    .select("id, season_id, number")
    .eq("id", episodeId)
    .single();

  if (!episode) {
    return {
      base: BASE_MULTIPLIER_BUDGET,
      bonus: 0,
      budget: BASE_MULTIPLIER_BUDGET,
      leaderPoints: 0,
      userPoints: 0,
      previousEpisodeNumber: null,
    };
  }

  const { data: priorEpisodes } = await supabaseAdmin
    .from("episodes")
    .select("id, number")
    .eq("season_id", episode.season_id)
    .lt("number", episode.number)
    .order("number", { ascending: false });

  if (!priorEpisodes || priorEpisodes.length === 0) {
    return {
      base: BASE_MULTIPLIER_BUDGET,
      bonus: 0,
      budget: BASE_MULTIPLIER_BUDGET,
      leaderPoints: 0,
      userPoints: 0,
      previousEpisodeNumber: null,
    };
  }

  const priorEpisodeIds = priorEpisodes.map((e) => e.id);
  const mostRecentPriorNumber = priorEpisodes[0].number;

  const [{ data: users }, { data: pointsRows }] = await Promise.all([
    supabaseAdmin.from("users").select("id"),
    supabaseAdmin
      .from("user_episode_points")
      .select("user_id, points")
      .in("episode_id", priorEpisodeIds),
  ]);

  const totals = new Map<string, number>();
  for (const u of users || []) totals.set(u.id, 0);
  for (const row of pointsRows || []) {
    totals.set(row.user_id, (totals.get(row.user_id) || 0) + (row.points || 0));
  }

  const leaderPoints = Math.max(0, ...Array.from(totals.values()));
  const userPoints = totals.get(userId) || 0;
  const behind = Math.max(0, leaderPoints - userPoints);
  const bonus = Math.floor(behind / BEHIND_LEADER_BONUS_THRESHOLD);

  return {
    base: BASE_MULTIPLIER_BUDGET,
    bonus,
    budget: BASE_MULTIPLIER_BUDGET + bonus,
    leaderPoints,
    userPoints,
    previousEpisodeNumber: mostRecentPriorNumber,
  };
}
