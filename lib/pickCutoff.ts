import supabaseAdmin from "./supabaseAdmin";
import { getCurrentSeason } from "./currentSeason";

// The highest episode number this user has made picks for, counting only
// *contiguously* from episode 1 — if they skipped (or haven't yet made)
// picks for an earlier episode, later episodes stay hidden from them even
// if they somehow have picks saved beyond that gap, since showing those
// would leak that the skipped episode has already happened. Powers the
// spoiler gates on Episode Events, Scores, and Home — see
// GET /api/picks/cutoff.
export async function getPickCutoffEpisodeNumber(userId: string): Promise<number> {
  const season = await getCurrentSeason();
  if (!season) return 0;

  const { data: episodes } = await supabaseAdmin
    .from("episodes")
    .select("id, number")
    .eq("season_id", season.id)
    .order("number", { ascending: true });
  if (!episodes || episodes.length === 0) return 0;

  const episodeIds = episodes.map((e) => e.id);
  const { data: picks } = await supabaseAdmin
    .from("picks")
    .select("episode_id")
    .eq("user_id", userId)
    .in("episode_id", episodeIds);

  const pickedEpisodeIds = new Set((picks || []).map((p) => p.episode_id));

  let cutoff = 0;
  for (const ep of episodes) {
    if (pickedEpisodeIds.has(ep.id)) cutoff = ep.number;
    else break;
  }
  return cutoff;
}
