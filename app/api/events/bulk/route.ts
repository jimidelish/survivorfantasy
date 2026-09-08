import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Logs one event per (survivor, event type) combination in a single request
// — e.g. 3 survivors x 2 event types = 6 events — for scenes where several
// people do the same thing, or one person does several things at once.
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
  return NextResponse.json(data);
}
