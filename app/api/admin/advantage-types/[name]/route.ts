import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { isHardcodedTrigger } from "@/lib/eventTriggers";

// Removes a custom advantage type from the Scoring Guide's Remove tab —
// soft-deletes its "<name> - Obtains"/"<name> - Uses" event types (active =
// false, same as removing any other event type: past events that already
// used them keep their recorded points) and deletes the advantage_types
// row. Survivors currently holding this advantage keep it — removal only
// retires it from future event logging, it never touches
// survivor_advantages. Blocked for anything that resolves to a hardcoded
// trigger (defense in depth — the Remove dropdown only ever offers custom
// types in the first place, which can't collide with those by construction).
export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { name: string } }) {
  const name = decodeURIComponent(params.name);
  const obtainsName = `${name} - Obtains`;
  const usesName = `${name} - Uses`;

  // Only reachable if someone crafts this request directly — the UI never
  // offers a hardcoded/built-in type here, and a custom type can never
  // collide with one by construction (checked at creation time).
  if (isHardcodedTrigger("Advantages", obtainsName) || isHardcodedTrigger("Advantages", usesName)) {
    return NextResponse.json(
      { error: "This advantage type can't be removed this way." },
      { status: 400 }
    );
  }

  const { error: deactivateError } = await supabaseAdmin
    .from("event_types")
    .update({ active: false })
    .eq("category", "Advantages")
    .in("name", [obtainsName, usesName]);
  if (deactivateError) {
    return NextResponse.json({ error: deactivateError.message }, { status: 500 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from("advantage_types")
    .delete()
    .eq("name", name);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
