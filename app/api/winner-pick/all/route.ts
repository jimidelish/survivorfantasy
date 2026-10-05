import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getCurrentSeason } from "@/lib/currentSeason";

// Every user's winner pick for the current season, with enough survivor
// detail to render an avatar — powers the "Winner picks" spoiler section
// on the Home page. Only users who've actually made a pick are included.
export const dynamic = "force-dynamic";

export async function GET() {
  const season = await getCurrentSeason();
  if (!season) return NextResponse.json([]);

  const { data, error } = await supabaseAdmin
    .from("winner_picks")
    .select("users(id, name), survivors(id, name, photo_url)")
    .eq("season_id", season.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const picks = (data || [])
    .map((row) => {
      const user = row.users as unknown as { id: string; name: string } | null;
      const survivor = row.survivors as unknown as {
        id: string;
        name: string;
        photo_url: string | null;
      } | null;
      if (!user || !survivor) return null;
      return {
        user_id: user.id,
        user_name: user.name,
        survivor_id: survivor.id,
        survivor_name: survivor.name,
        photo_url: survivor.photo_url,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.user_name.localeCompare(b.user_name));

  return NextResponse.json(picks);
}
