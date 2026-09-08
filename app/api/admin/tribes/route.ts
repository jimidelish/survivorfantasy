import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

// Creates a new tribe for the current season, from Admin > Assign Tribes
// (used both for a season's starting tribes and for tribes introduced by
// a later swap or merge).
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name as string)?.trim();
  const color = (body.color as string)?.trim();

  if (!name || !color) {
    return NextResponse.json({ error: "name and color are required." }, { status: 400 });
  }

  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ error: "No current season." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("tribes")
    .insert({ season_id: season.id, name, color })
    .select("id, season_id, name, color")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
