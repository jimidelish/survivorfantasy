import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

// Always scoped to the current season, like /api/survivors.
export const dynamic = "force-dynamic";

export async function GET() {
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from("tribes")
    .select("id, season_id, name, color")
    .eq("season_id", season.id)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
