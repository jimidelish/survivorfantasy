import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const episodeId = req.nextUrl.searchParams.get("episode_id");
  if (!episodeId) {
    return NextResponse.json({ error: "episode_id query param is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("events")
    .select(
      "id, episode_id, survivor_id, event_type_id, point_value, created_at, survivors(name), event_types(category, name)"
    )
    .eq("episode_id", episodeId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { episode_id, survivor_id, event_type_id, entered_by_user_id } = body;

  if (!episode_id || !survivor_id || !event_type_id) {
    return NextResponse.json(
      { error: "episode_id, survivor_id, and event_type_id are all required." },
      { status: 400 }
    );
  }

  // Snapshot the point value NOW, so later edits to event_types (balance
  // changes) never retroactively change points that already scored.
  const { data: eventType, error: eventTypeError } = await supabaseAdmin
    .from("event_types")
    .select("point_value")
    .eq("id", event_type_id)
    .single();

  if (eventTypeError || !eventType) {
    return NextResponse.json({ error: "Event type not found." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("events")
    .insert({
      episode_id,
      survivor_id,
      event_type_id,
      point_value: eventType.point_value,
      entered_by_user_id: entered_by_user_id || null,
    })
    .select(
      "id, episode_id, survivor_id, event_type_id, point_value, created_at, survivors(name), event_types(category, name)"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param is required." }, { status: 400 });

  const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
