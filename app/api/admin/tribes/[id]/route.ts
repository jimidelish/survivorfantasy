import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Rename and/or recolor an existing tribe.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.color === "string" && body.color.trim()) update.color = body.color.trim();

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("tribes")
    .update(update)
    .eq("id", params.id)
    .select("id, season_id, name, color")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Deletes a tribe. Any survivor currently on it falls back to "no tribe"
// (current_tribe_id -> null) via the FK's ON DELETE SET NULL — no manual
// unassignment needed here.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabaseAdmin.from("tribes").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
