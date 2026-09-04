import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

export const dynamic = "force-dynamic";

export async function GET() {
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json([]);

  const { data: users, error: usersError } = await supabaseAdmin
    .from("users")
    .select("id, name");
  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const { data: points, error: pointsError } = await supabaseAdmin
    .from("user_season_points")
    .select("user_id, points")
    .eq("season_id", season.id);
  if (pointsError) return NextResponse.json({ error: pointsError.message }, { status: 500 });

  const totals = new Map<string, number>();
  for (const row of points || []) totals.set(row.user_id, row.points || 0);

  const leaderboard = (users || [])
    .map((u) => ({
      user_id: u.id,
      name: u.name,
      total_points: totals.get(u.id) || 0,
    }))
    .sort((a, b) => b.total_points - a.total_points);

  return NextResponse.json(leaderboard);
}
