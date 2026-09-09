import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { reverseTriggerEffect } from "@/lib/triggerEngine";

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

// Pass `id` to undo a single event, or `episode_id` to clear every event
// logged for that episode at once (used by Enter Events' "Clear all events").
// Either way, any trigger_effect on the event(s) being removed is reversed
// first, so undoing/clearing a trigger event fully rolls back what it
// automatically changed (eliminated status, advantages, vote status).
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const episodeId = req.nextUrl.searchParams.get("episode_id");

  if (id) {
    const { data: event } = await supabaseAdmin
      .from("events")
      .select("survivor_id, trigger_effect")
      .eq("id", id)
      .single();
    if (event?.trigger_effect) {
      await reverseTriggerEffect(event.survivor_id, event.trigger_effect as any);
    }

    const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (episodeId) {
    const { data: events } = await supabaseAdmin
      .from("events")
      .select("survivor_id, trigger_effect")
      .eq("episode_id", episodeId);

    for (const ev of events || []) {
      if (ev.trigger_effect) {
        await reverseTriggerEffect(ev.survivor_id, ev.trigger_effect as any);
      }
    }

    const { error } = await supabaseAdmin.from("events").delete().eq("episode_id", episodeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "id or episode_id query param is required." }, { status: 400 });
}
