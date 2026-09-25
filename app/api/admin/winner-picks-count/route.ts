import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// How many users have made a winner pick for a given season, out of the
// total user count — shown next to the Lock/Unlock winner picks button in
// Admin > Season Control.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get("season_id");
  if (!seasonId) {
    return NextResponse.json({ error: "season_id query param is required." }, { status: 400 });
  }

  const [{ count: total }, { count: picked }] = await Promise.all([
    supabaseAdmin.from("users").select("id", { count: "exact", head: true }),
    supabaseAdmin
      .from("winner_picks")
      .select("id", { count: "exact", head: true })
      .eq("season_id", seasonId),
  ]);

  return NextResponse.json({ total: total || 0, picked: picked || 0 });
}
