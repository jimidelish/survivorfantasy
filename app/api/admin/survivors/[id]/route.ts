import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Partial update for a single survivor from Admin > Update Survivors.
// Only eliminated / shot_in_the_dark / current_tribe are editable here —
// name/photo/original_tribe stay CSV-managed (Season Setup).
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (typeof body.eliminated === "boolean") update.eliminated = body.eliminated;
  if (typeof body.shot_in_the_dark === "boolean") update.shot_in_the_dark = body.shot_in_the_dark;
  if (typeof body.current_tribe === "string" || body.current_tribe === null) {
    update.current_tribe = body.current_tribe || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("survivors")
    .update(update)
    .eq("id", params.id)
    .select(
      "id, season_id, name, photo_url, original_tribe, current_tribe, eliminated, shot_in_the_dark, has_vote"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
