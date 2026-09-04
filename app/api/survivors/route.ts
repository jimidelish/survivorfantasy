import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

// Always scoped to the current season. Includes each survivor's advantages
// (both active and used) so the front end can decide what to show.
export async function GET() {
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from("survivors")
    .select(
      "id, season_id, name, photo_url, original_tribe, current_tribe, eliminated, shot_in_the_dark, has_vote, survivor_advantages(id, survivor_id, type, status)"
    )
    .eq("season_id", season.id)
    .order("eliminated", { ascending: true })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Normalize the joined table name to `advantages` for the front end.
  const normalized = (data || []).map((s: any) => ({
    ...s,
    advantages: s.survivor_advantages,
    survivor_advantages: undefined,
  }));

  return NextResponse.json(normalized);
}
