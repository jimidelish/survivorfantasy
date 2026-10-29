import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json([]);

  const { data: users, error: usersError } = await supabaseAdmin
    .from("users")
    .select("id, name");
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const maxEpisodeNumberParam = req.nextUrl.searchParams.get("max_episode_number");
  const maxEpisodeNumber = maxEpisodeNumberParam !== null ? Number(maxEpisodeNumberParam) : null;

  const totals = new Map<string, number>();

  if (maxEpisodeNumber !== null) {
    // Home's spoiler cutoff — a viewer who hasn't made picks for every
    // episode yet shouldn't see standings shift from episodes further
    // along than they are, even though those episodes are already scored.
    // Sums the per-episode view directly instead of the pre-aggregated
    // season view, scoped to episodes at or before the cutoff.
    const { data: episodes, error: episodesError } = await supabaseAdmin
      .from("episodes")
      .select("id")
      .eq("season_id", season.id)
      .lte("number", maxEpisodeNumber);
    if (episodesError) return NextResponse.json({ error: episodesError.message }, { status: 500 });

    const episodeIds = (episodes || []).map((e) => e.id);
    if (episodeIds.length > 0) {
      const { data: points, error: pointsError } = await supabaseAdmin
        .from("user_episode_points_with_winner_pick")
        .select("user_id, points")
        .in("episode_id", episodeIds);
      if (pointsError) return NextResponse.json({ error: pointsError.message }, { status: 500 });
      for (const row of points || []) {
        totals.set(row.user_id, (totals.get(row.user_id) || 0) + (row.points || 0));
      }
    }
  } else {
    // The "real" total, including the winner-pick bonus — see schema.sql's
    // comments on user_season_points vs user_season_points_with_winner_pick
    // if you ever need to compare against the bonus-free baseline.
    const { data: points, error: pointsError } = await supabaseAdmin
      .from("user_season_points_with_winner_pick")
      .select("user_id, points")
      .eq("season_id", season.id);
    if (pointsError) return NextResponse.json({ error: pointsError.message }, { status: 500 });
    for (const row of points || []) totals.set(row.user_id, row.points || 0);
  }

  const leaderboard = (users || [])
    .map((u) => ({
      user_id: u.id,
      name: u.name,
      total_points: totals.get(u.id) || 0,
    }))
    .sort((a, b) => b.total_points - a.total_points);

  return NextResponse.json(leaderboard);
}
