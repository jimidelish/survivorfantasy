import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Partial update for a single survivor from Admin > Update Survivors and
// Admin > Assign Tribes. eliminated / has_vote / current_tribe_id are
// editable here — name/photo stay CSV-managed (Season Setup), and Shot in
// the Dark is granted/used like any other advantage now, via
// /api/admin/advantages. has_vote is also changed automatically by the
// Beware Advantage and "Loses their vote" triggers (see
// lib/triggerEngine.ts) — this is the manual override for correcting it
// directly (e.g. a twist with no matching "regain vote" trigger).
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (typeof body.eliminated === "boolean") update.eliminated = body.eliminated;
  if (typeof body.has_vote === "boolean") update.has_vote = body.has_vote;

  // Only meaningfully "changing tribes" when this is actually present in
  // the request — undefined means the caller didn't touch it at all,
  // distinct from an explicit null (unassigning).
  const changingTribe = typeof body.current_tribe_id === "string" || body.current_tribe_id === null;
  const newTribeId: string | null = changingTribe ? body.current_tribe_id || null : null;
  if (changingTribe) update.current_tribe_id = newTribeId;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  // Need the previous tribe to know whether this is a real change worth a
  // history entry (vs. a no-op "change" to the same tribe it's already on).
  let previousTribeId: string | null = null;
  if (changingTribe) {
    const { data: existing } = await supabaseAdmin
      .from("survivors")
      .select("current_tribe_id")
      .eq("id", params.id)
      .maybeSingle();
    previousTribeId = existing?.current_tribe_id ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from("survivors")
    .update(update)
    .eq("id", params.id)
    .select(
      "id, season_id, name, photo_url, current_tribe_id, current_tribe:tribes(id, season_id, name, color), eliminated, has_vote, is_host"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Record a tribe-history entry — only for an actual assignment to a real
  // tribe (not unassigning to "no tribe," and not a no-op re-assignment to
  // the tribe they're already on). Snapshots the tribe's current
  // name/color at this moment, so a later rename/recolor/delete never
  // rewrites this survivor's past.
  if (newTribeId && newTribeId !== previousTribeId) {
    const { data: tribe } = await supabaseAdmin
      .from("tribes")
      .select("name, color")
      .eq("id", newTribeId)
      .maybeSingle();
    if (tribe) {
      await supabaseAdmin.from("survivor_tribe_history").insert({
        survivor_id: params.id,
        tribe_name: tribe.name,
        tribe_color: tribe.color,
      });
    }
  }

  return NextResponse.json(data);
}
