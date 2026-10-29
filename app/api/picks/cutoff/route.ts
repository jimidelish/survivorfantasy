import { NextRequest, NextResponse } from "next/server";
import { getPickCutoffEpisodeNumber } from "@/lib/pickCutoff";

// A user's spoiler cutoff — the highest episode number they can see
// events/scores for, based on how far they've made picks. See
// lib/pickCutoff.ts for exactly how it's computed.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id query param is required." }, { status: 400 });
  }
  const cutoffEpisodeNumber = await getPickCutoffEpisodeNumber(userId);
  return NextResponse.json({ cutoffEpisodeNumber });
}
