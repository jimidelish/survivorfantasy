import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getTriggerAction } from "@/lib/eventTriggers";

// Inline point-value edit from the Scoring Guide page — a quick single-row
// balance change. See POST /api/admin/event-types for adding a new event
// type, and DELETE below for retiring one.
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const pointValue = Number(body.point_value);

  if (!Number.isFinite(pointValue)) {
    return NextResponse.json({ error: "point_value must be a number." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("event_types")
    .update({ point_value: pointValue })
    .eq("id", params.id)
    .select("id, category, name, point_value, active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Soft-delete only (active = false) — the row (and its point_value) stays
// in place so events that already reference it keep their recorded points;
// it just drops out of the active Scoring Guide / Episode Events lists.
// Blocked for the 21 standard trigger event types, since the trigger engine
// looks those up by exact (category, name) — removing one would silently
// break elimination/advantage logging for anyone who later picks that name
// again expecting normal scoring only.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("event_types")
    .select("id, category, name")
    .eq("id", params.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Event type not found." }, { status: 404 });
  }

  if (getTriggerAction(existing.category, existing.name)) {
    return NextResponse.json(
      { error: "This event type powers built-in game logic and can't be removed." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("event_types")
    .update({ active: false })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
