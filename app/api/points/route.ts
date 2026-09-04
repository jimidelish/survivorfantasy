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
    .select("id, number, title")
    .eq("season_id", season.id)
    .order("number", { ascending: true });
  if (episodesError) return NextResponse.json({ error: episodesError.message }, { status: 500 });

  const episodeIds = (episodes || []).map((e) => e.id);
  if (episodeIds.length === 0) return NextResponse.json({ episodes: [], series: [] });

  if (by === "user") {
    const [{ data: users, error: usersError }, { data: points, error: pointsError }] =
      await Promise.all([
        supabaseAdmin.from("users").select("id, name"),
        supabaseAdmin
          .from("user_episode_points")
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

  const [{ data: survivors, error: survivorsError }, { data: points, error: pointsError }] =
    await Promise.all([
      supabaseAdmin
        .from("survivors")
        .select("id, name, eliminated")
        .eq("season_id", season.id),
      supabaseAdmin
        .from("survivor_episode_points")
        .select("survivor_id, episode_id, points")
        .in("episode_id", episodeIds),
    ]);
  if (survivorsError) return NextResponse.json({ error: survivorsError.message }, { status: 500 });
  if (pointsError) return NextResponse.json({ error: pointsError.message }, { status: 500 });

  const series = (survivors || []).map((s) => {
    const rowPoints: Record<string, number> = {};
    for (const row of points || []) {
      if (row.survivor_id === s.id) rowPoints[row.episode_id] = row.points || 0;
    }
    return { id: s.id, name: s.name, eliminated: s.eliminated, points: rowPoints };
  });

  return NextResponse.json({ episodes, series });
}
