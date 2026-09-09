import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { TriggerEffect } from "@/lib/eventTriggers";

// Completes the "Advantage Given to/Used for Someone Else" trigger, which
// can't apply automatically since it needs to know which advantage, and
// whether it was given away or just used. Called from the follow-up modal
// shown after logging that event type.
//
// Body: { advantage_id: string, disposition: "given" | "used", recipient_survivor_id?: string }
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const advantageId = body.advantage_id as string;
  const disposition = body.disposition as string;
  const recipientId = body.recipient_survivor_id as string | undefined;

  if (!advantageId || (disposition !== "given" && disposition !== "used")) {
    return NextResponse.json(
      { error: "advantage_id and disposition ('given' or 'used') are required." },
      { status: 400 }
    );
  }
  if (disposition === "given" && !recipientId) {
    return NextResponse.json(
      { error: "recipient_survivor_id is required when disposition is 'given'." },
      { status: 400 }
    );
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, survivor_id, trigger_effect")
    .eq("id", params.id)
    .single();
  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  if (event.trigger_effect) {
    return NextResponse.json({ error: "This event has already been resolved." }, { status: 400 });
  }

  const { data: advantage, error: advantageError } = await supabaseAdmin
    .from("survivor_advantages")
    .select("id, survivor_id, type, status")
    .eq("id", advantageId)
    .single();
  if (advantageError || !advantage) {
    return NextResponse.json({ error: "Advantage not found." }, { status: 404 });
  }
  if (advantage.survivor_id !== event.survivor_id) {
    return NextResponse.json(
      { error: "That advantage doesn't belong to this event's survivor." },
      { status: 400 }
    );
  }
  if (advantage.status !== "active") {
    return NextResponse.json({ error: "That advantage isn't active." }, { status: 400 });
  }

  const { error: markUsedError } = await supabaseAdmin
    .from("survivor_advantages")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", advantageId);
  if (markUsedError) return NextResponse.json({ error: markUsedError.message }, { status: 500 });

  let createdAdvantageId: string | null = null;
  if (disposition === "given") {
    const { data: created, error: createError } = await supabaseAdmin
      .from("survivor_advantages")
      .insert({ survivor_id: recipientId, type: advantage.type, status: "active" })
      .select("id")
      .single();
    if (createError || !created) {
      return NextResponse.json({ error: createError?.message || "Couldn't grant the advantage." }, { status: 500 });
    }
    createdAdvantageId = created.id;
  }

  const effect: TriggerEffect = {
    kind: "advantage_transfer",
    sourceAdvantageId: advantageId,
    createdAdvantageId,
  };

  const { error: updateEventError } = await supabaseAdmin
    .from("events")
    .update({ trigger_effect: effect })
    .eq("id", params.id);
  if (updateEventError) return NextResponse.json({ error: updateEventError.message }, { status: 500 });

  return NextResponse.json({ ok: true, advantageType: advantage.type });
}
