import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

// Always scoped to the current season (highest season number).
export async function GET() {
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from("episodes")
    .select("id, season_id, number, title, air_date, locked")
    .eq("season_id", season.id)
    .order("number", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
