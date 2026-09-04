import { NextResponse } from "next/server";
import { getCurrentSeason } from "@/lib/currentSeason";

export const dynamic = "force-dynamic";

export async function GET() {
  const season = await getCurrentSeason();
  if (!season) {
    return NextResponse.json(
      { error: "No seasons found. Insert a row into the seasons table to get started." },
      { status: 404 }
    );
  }
  return NextResponse.json(season);
}
