import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

// A user's winner pick for the current season — one survivor, worth +1x
// their points every episode (see user_episode_points in schema.sql).
// Always scoped to the current season, like most user-facing routes.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id query param is required." }, { status: 400 });
  }

  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ survivor_id: null, locked: false });

  const { data: pick } = await supabaseAdmin
    .from("winner_picks")
    .select("survivor_id")
    .eq("user_id", userId)
    .eq("season_id", season.id)
    .maybeSingle();

  return NextResponse.json({
    survivor_id: pick?.survivor_id || null,
    locked: season.winner_picks_locked,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const userId = body.user_id as string;
  const survivorId = body.survivor_id as string;

  if (!userId || !survivorId) {
    return NextResponse.json({ error: "user_id and survivor_id are required." }, { status: 400 });
  }

  const season = await getCurrentSeason();
  if (!season) return NextResponse.json({ error: "No current season." }, { status: 400 });

  // Enforced server-side, not just hidden client-side when locked — same
  // treatment as episodes.locked on POST /api/picks.
  if (season.winner_picks_locked) {
    return NextResponse.json(
      { error: "Winner picks are locked for this season." },
      { status: 403 }
    );
  }

  const { data: survivor } = await supabaseAdmin
    .from("survivors")
    .select("id, season_id, eliminated, is_host")
    .eq("id", survivorId)
    .maybeSingle();

  if (!survivor || survivor.season_id !== season.id) {
    return NextResponse.json({ error: "Survivor not found for the current season." }, { status: 404 });
  }
  if (survivor.eliminated) {
    return NextResponse.json({ error: "Can't pick an eliminated survivor to win." }, { status: 400 });
  }
  if (survivor.is_host) {
    return NextResponse.json({ error: "The host can't be picked as a winner." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("winner_picks")
    .upsert(
      { user_id: userId, season_id: season.id, survivor_id: survivorId, updated_at: new Date().toISOString() },
      { onConflict: "user_id,season_id" }
    )
    .select("survivor_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
