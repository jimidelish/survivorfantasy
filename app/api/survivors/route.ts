import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

// Always scoped to the current season. Includes each survivor's advantages
// (both active and used) and tribe history so the front end can decide
// what to show.
export const dynamic = "force-dynamic";

export async function GET() {
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from("survivors")
    .select(
      "id, season_id, name, photo_url, current_tribe_id, current_tribe:tribes(id, season_id, name, color), eliminated, has_vote, is_host, survivor_advantages(id, survivor_id, type, status), survivor_tribe_history(id, tribe_name, tribe_color, assigned_at)"
    )
    .eq("season_id", season.id)
    // Active survivors, then the host (e.g. Jeff Probst — never eliminated,
    // so this is the only thing that places him after the cast and before
    // eliminated survivors instead of alphabetically among the active ones),
    // then eliminated survivors, alphabetical within each group.
    .order("eliminated", { ascending: true })
    .order("is_host", { ascending: true })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Normalize the joined table names, and sort each survivor's tribe
  // history oldest-first (PostgREST doesn't let this query order an
  // embedded resource, so it's done here instead).
  const normalized = (data || []).map((s: any) => ({
    ...s,
    advantages: s.survivor_advantages,
    survivor_advantages: undefined,
    tribe_history: (s.survivor_tribe_history || [])
      .slice()
      .sort(
        (a: any, b: any) =>
          new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()
      ),
    survivor_tribe_history: undefined,
  }));

  return NextResponse.json(normalized);
}
