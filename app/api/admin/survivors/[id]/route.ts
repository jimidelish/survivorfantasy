import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Partial update for a single survivor from Admin > Update Survivors and
// Admin > Assign Tribes. Only eliminated / current_tribe_id are editable
// here — name/photo/original_tribe stay CSV-managed (Season Setup), and
// Shot in the Dark is granted/used like any other advantage now, via
// /api/admin/advantages.
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (typeof body.eliminated === "boolean") update.eliminated = body.eliminated;
  if (typeof body.current_tribe_id === "string" || body.current_tribe_id === null) {
    update.current_tribe_id = body.current_tribe_id || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("survivors")
    .update(update)
    .eq("id", params.id)
    .select(
      "id, season_id, name, photo_url, original_tribe, current_tribe_id, current_tribe:tribes(id, season_id, name, color), eliminated, has_vote"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
