import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// GET /api/picks/all?episode_id=X -> every user's picks for that episode,
// grouped by user, with enough survivor detail (photo included) to render
// avatar chips. Powers the handicap-only "other players' picks" view on My
// Picks — open read like the rest of the non-fairness-critical admin data,
// gated client-side on users.is_handicap rather than server-side.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const episodeId = req.nextUrl.searchParams.get("episode_id");
  if (!episodeId) {
    return NextResponse.json({ error: "episode_id query param is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("picks")
    .select(
      "user_id, multiplier, users(id, name), survivors(id, name, photo_url)"
    )
    .eq("episode_id", episodeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byUser = new Map<
    string,
    {
      user_id: string;
      user_name: string;
      picks: { survivor_id: string; survivor_name: string; photo_url: string | null; multiplier: number }[];
    }
  >();

  for (const row of data || []) {
    const user = row.users as unknown as { id: string; name: string } | null;
    const survivor = row.survivors as unknown as {
      id: string;
      name: string;
      photo_url: string | null;
    } | null;
    if (!user || !survivor) continue;
    if (!byUser.has(user.id)) {
      byUser.set(user.id, { user_id: user.id, user_name: user.name, picks: [] });
    }
    byUser.get(user.id)!.picks.push({
      survivor_id: survivor.id,
      survivor_name: survivor.name,
      photo_url: survivor.photo_url,
      multiplier: row.multiplier,
    });
  }

  return NextResponse.json(Array.from(byUser.values()));
}
