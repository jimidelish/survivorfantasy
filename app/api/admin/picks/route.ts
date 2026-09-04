import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const episodeId = req.nextUrl.searchParams.get("episode_id");
  if (!episodeId) {
    return NextResponse.json({ error: "episode_id query param is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("picks")
    .select("id, multiplier, users(id, name), survivors(id, name)")
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by user for easier display.
  const byUser = new Map<
    string,
    { user_id: string; user_name: string; picks: { survivor_name: string; multiplier: number }[] }
  >();

  for (const row of data || []) {
    const user = row.users as unknown as { id: string; name: string } | null;
    const survivor = row.survivors as unknown as { id: string; name: string } | null;
    if (!user || !survivor) continue;
    if (!byUser.has(user.id)) {
      byUser.set(user.id, { user_id: user.id, user_name: user.name, picks: [] });
    }
    byUser.get(user.id)!.picks.push({ survivor_name: survivor.name, multiplier: row.multiplier });
  }

  return NextResponse.json(Array.from(byUser.values()));
}
