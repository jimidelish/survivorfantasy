import { NextRequest, NextResponse } from "next/server";
import { computeMultiplierBudget } from "@/lib/multiplierBudget";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const episodeId = req.nextUrl.searchParams.get("episode_id");

  if (!userId || !episodeId) {
    return NextResponse.json(
      { error: "user_id and episode_id query params are required." },
      { status: 400 }
    );
  }

  const budget = await computeMultiplierBudget(userId, episodeId);
  return NextResponse.json(budget);
}
