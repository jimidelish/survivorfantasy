import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

// GET /api/points?by=user      -> each user's points, broken down per episode
// GET /api/points?by=survivor  -> each survivor's points, broken down per episode
// Both scoped to the current season. Shape:
// { episodes: [{id, number, title}], series: [{ id, name, points: { [episodeId]: number } }] }
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const by = req.nextUrl.searchParams.get("by") === "survivor" ? "survivor" : "user";

  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ episodes: [], series: [] });

  const { data: episodes, error: episodesError } = await supabaseAdmin
    .from("episodes")
    .select("id, number, title, is_current")
    .eq("season_id", season.id)
    .order("number", { ascending: true });
  if (episodesError) return NextResponse.json({ error: episodesError.message }, { status: 500 });

  const episodeIds = (episodes || []).map((e) => e.id);
  if (episodeIds.length === 0) return NextResponse.json({ episodes: [], series: [] });

  if (by === "user") {
    const [{ data: users, error: usersError }, { data: points, error: pointsError }] =
      await Promise.all([
        supabaseAdmin.from("users").select("id, name"),
        // The "real" per-episode total, including the winner-pick bonus —
        // see schema.sql's comments on user_episode_points vs _with_
        // winner_pick if you ever need the bonus-free baseline instead.
        supabaseAdmin
          .from("user_episode_points_with_winner_pick")
          .select("user_id, episode_id, points")
          .in("episode_id", episodeIds),
      ]);
    if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });
    if (pointsError) return NextResponse.json({ error: pointsError.message }, { status: 500 });

    const series = (users || []).map((u) => {
      const rowPoints: Record<string, number> = {};
      for (const row of points || []) {
        if (row.user_id === u.id) rowPoints[row.episode_id] = row.points || 0;
      }
      return { id: u.id, name: u.name, points: rowPoints };
    });

    return NextResponse.json({ episodes, series });
  }

  const [
    { data: survivors, error: survivorsError },
    { data: points, error: pointsError },
    { data: eliminationEvents, error: eliminationError },
  ] = await Promise.all([
    supabaseAdmin
      .from("survivors")
      .select("id, name, eliminated")
      .eq("season_id", season.id),
    supabaseAdmin
      .from("survivor_episode_points")
      .select("survivor_id, episode_id, points")
      .in("episode_id", episodeIds),
    // The episode an eliminated survivor went out in, read off the "Eliminated - ..."
    // Game Event that was logged for them (see lib/eventTriggers.ts) — there's no
    // separate column for this, the event log is the source of truth.
    supabaseAdmin
      .from("events")
      .select("survivor_id, episodes!inner(number), event_types!inner(category, name)")
      .in("episode_id", episodeIds)
      .eq("event_types.category", "Game Event")
      .ilike("event_types.name", "Eliminated%"),
  ]);
  if (survivorsError) return NextResponse.json({ error: survivorsError.message }, { status: 500 });
  if (pointsError) return NextResponse.json({ error: pointsError.message }, { status: 500 });
  if (eliminationError)
    return NextResponse.json({ error: eliminationError.message }, { status: 500 });

  const eliminatedEpisodeNumbers = new Map<string, number>();
  for (const row of eliminationEvents || []) {
    const episode = row.episodes as unknown as { number: number } | null;
    if (episode) eliminatedEpisodeNumbers.set(row.survivor_id, episode.number);
  }

  const series = (survivors || []).map((s) => {
    const rowPoints: Record<string, number> = {};
    for (const row of points || []) {
      if (row.survivor_id === s.id) rowPoints[row.episode_id] = row.points || 0;
    }
    return {
      id: s.id,
      name: s.name,
      eliminated: s.eliminated,
      eliminatedEpisodeNumber: eliminatedEpisodeNumbers.get(s.id) ?? null,
      points: rowPoints,
    };
  });

  return NextResponse.json({ episodes, series });
}
