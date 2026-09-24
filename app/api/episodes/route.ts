import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

// Scoped to the current season (highest season number) by default. Pass
// ?season_id= to target a specific season instead — used by Admin >
// Season Control's season picker; every other caller (My Picks, Enter
// Events) omits it and always gets the current season, unchanged.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get("season_id");
  const season = seasonId ? { id: seasonId } : await getCurrentSeason();
  if (!season) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from("episodes")
    .select("id, season_id, number, title, air_date, locked, is_current")
    .eq("season_id", season.id)
    .order("number", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const seasonId = body.season_id as string | undefined;
  const season = seasonId ? { id: seasonId } : await getCurrentSeason();
  if (!season) {
    return NextResponse.json({ error: "No current season found." }, { status: 400 });
  }
  const number = Number(body.number);
  const title = (body.title as string) || null;
  const air_date = (body.air_date as string) || null;

  if (!number) {
    return NextResponse.json({ error: "Episode number is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("episodes")
    .insert({ season_id: season.id, number, title, air_date })
    .select("id, season_id, number, title, air_date, locked, is_current")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
