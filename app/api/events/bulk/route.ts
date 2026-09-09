import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { getTriggerAction } from "@/lib/eventTriggers";
import { applyTrigger } from "@/lib/triggerEngine";

// Logs one event per (survivor, event type) combination in a single request
// — e.g. 3 survivors x 2 event types = 6 events — for scenes where several
// people do the same thing, or one person does several things at once.
// For any combination that's a "trigger" event type, also applies its
// automatic effect (add/use an advantage, eliminate, change vote status)
// and records what changed on that event row, so Undo can reverse it later.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { episode_id, survivor_ids, event_type_ids, entered_by_user_id } = body;

  if (
    !episode_id ||
    !Array.isArray(survivor_ids) ||
    survivor_ids.length === 0 ||
    !Array.isArray(event_type_ids) ||
    event_type_ids.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "episode_id, at least one survivor_id, and at least one event_type_id are required.",
      },
      { status: 400 }
    );
  }

  // Snapshot each event type's point value NOW, same as the single-event
  // route, so later balance changes never retroactively alter these.
  const { data: types, error: typesError } = await supabaseAdmin
    .from("event_types")
    .select("id, point_value")
    .in("id", event_type_ids);

  if (typesError) return NextResponse.json({ error: typesError.message }, { status: 500 });
  if (!types || types.length !== event_type_ids.length) {
    return NextResponse.json({ error: "One or more event types not found." }, { status: 404 });
  }
  const pointByType = new Map(types.map((t) => [t.id, t.point_value]));

  const rows = survivor_ids.flatMap((survivor_id: string) =>
    event_type_ids.map((event_type_id: string) => ({
      episode_id,
      survivor_id,
      event_type_id,
      point_value: pointByType.get(event_type_id)!,
      entered_by_user_id: entered_by_user_id || null,
    }))
  );

  const { data, error } = await supabaseAdmin
    .from("events")
    .insert(rows)
    .select(
      "id, episode_id, survivor_id, event_type_id, point_value, created_at, survivors(name), event_types(category, name)"
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const warnings: string[] = [];
  const pendingTransfers: { event_id: string; survivor_id: string; survivor_name: string }[] = [];

  for (const ev of data || []) {
    const category = (ev as any).event_types?.category;
    const name = (ev as any).event_types?.name;
    const survivorName = (ev as any).survivors?.name || "Survivor";
    if (!category || !name) continue;

    const action = getTriggerAction(category, name);
    if (!action) continue;

    if (action.kind === "advantage_transfer") {
      pendingTransfers.push({ event_id: ev.id, survivor_id: ev.survivor_id, survivor_name: survivorName });
      continue;
    }

    const { effect, warning } = await applyTrigger(ev.survivor_id, action);
    if (warning) warnings.push(`${survivorName} — ${name}: ${warning}`);
    if (effect) {
      await supabaseAdmin.from("events").update({ trigger_effect: effect }).eq("id", ev.id);
    }
  }

  return NextResponse.json({ events: data, warnings, pendingTransfers });
}
