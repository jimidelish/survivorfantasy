import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

// Custom advantage types only (the 9 built-ins are hardcoded in
// lib/types.ts). Public read — used wherever an advantage's color needs
// resolving (My Picks, Episode Events), by Admin > Update Survivors to
// extend the "grant an advantage" dropdown beyond the built-ins, and by
// the Scoring Guide's Remove tab (activeHolders powers its "N survivors
// currently hold this" warning, scoped to the current season's roster).
// See POST /api/admin/advantage-types for how these get created, and
// DELETE /api/admin/advantage-types/[name] for removal.
export const dynamic = "force-dynamic";

export async function GET() {
  const { data: types, error } = await supabaseAdmin
    .from("advantage_types")
    .select("name, color")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!types || types.length === 0) return NextResponse.json([]);

  const season = await getCurrentSeason();
  const holderCounts = new Map<string, number>();
  if (season) {
    const { data: seasonSurvivors } = await supabaseAdmin
      .from("survivors")
      .select("id")
      .eq("season_id", season.id);
    const survivorIds = (seasonSurvivors || []).map((s) => s.id);
    if (survivorIds.length > 0) {
      const { data: rows } = await supabaseAdmin
        .from("survivor_advantages")
        .select("type")
        .eq("status", "active")
        .in("survivor_id", survivorIds);
      for (const row of rows || []) {
        holderCounts.set(row.type, (holderCounts.get(row.type) || 0) + 1);
      }
    }
  }

  return NextResponse.json(
    types.map((t) => ({ ...t, activeHolders: holderCounts.get(t.name) || 0 }))
  );
}
