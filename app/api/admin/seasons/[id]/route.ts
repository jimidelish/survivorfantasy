import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Toggles winner_picks_locked for a season, from Admin > Season Control.
// Once locked, POST /api/winner-pick rejects new/changed picks for it
// server-side — this endpoint just flips the flag those checks read.
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  if (typeof body.winner_picks_locked !== "boolean") {
    return NextResponse.json({ error: "winner_picks_locked (boolean) is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("seasons")
    .update({ winner_picks_locked: body.winner_picks_locked })
    .eq("id", params.id)
    .select("id, number, name, winner_picks_locked")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
