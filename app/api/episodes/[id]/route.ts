import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { reverseTriggerEffect } from "@/lib/triggerEngine";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();

  // Setting is_current=true means "make this THE active episode for its
  // season" — so we clear any other active episode in that season first.
  if (body.is_current === true) {
    const { data: episode } = await supabaseAdmin
      .from("episodes")
      .select("season_id")
      .eq("id", params.id)
      .single();

    if (episode) {
      await supabaseAdmin
        .from("episodes")
        .update({ is_current: false })
        .eq("season_id", episode.season_id)
        .eq("is_current", true);
    }
  }

  const update: Record<string, unknown> = {};
  if (typeof body.locked === "boolean") update.locked = body.locked;
  if (typeof body.is_current === "boolean") update.is_current = body.is_current;

  const { data, error } = await supabaseAdmin
    .from("episodes")
    .update(update)
    .eq("id", params.id)
    .select("id, season_id, number, title, air_date, locked, is_current")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Deletes an episode entirely — its events and picks cascade-delete at the
// database level (episodes.id is referenced with ON DELETE CASCADE), but
// any trigger_effect on those events is reversed first, same as "Clear all
// events," so deleting an episode can't silently leave a survivor
// eliminated/advantaged/vote-locked with no event left to explain why.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data: events } = await supabaseAdmin
    .from("events")
    .select("survivor_id, trigger_effect")
    .eq("episode_id", params.id);

  for (const ev of events || []) {
    if (ev.trigger_effect) {
      await reverseTriggerEffect(ev.survivor_id, ev.trigger_effect as any);
    }
  }

  const { error } = await supabaseAdmin.from("episodes").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
