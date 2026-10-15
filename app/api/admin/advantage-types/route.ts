import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { ADVANTAGE_TYPES } from "@/lib/types";

// Creates a brand-new advantage type from the Scoring Guide's "Add
// advantage" button: a row in advantage_types (name + chosen color — see
// GET /api/advantage-types and lib/types.ts's getAdvantageColor) plus two
// Advantages-category event types, "<name> - Obtains" and "<name> - Uses".
// Once those event types exist, lib/eventTriggers.ts's getTriggerAction
// recognizes them by that naming convention alone (no code change needed)
// and treats logging either one exactly like the 9 built-in advantage
// types — granting/marking-used a survivor_advantages row of this type,
// and working with "Advantage Given to/Used for Someone Else" the same way.
//
// Point values default to 10 (matching the typical built-in Obtains/Uses
// value) — adjust via the Scoring Guide's normal per-category Edit mode
// afterward, same as any other event type.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name as string)?.trim();
  const color = (body.color as string)?.trim();

  if (!name) {
    return NextResponse.json({ error: "Enter a name for the advantage." }, { status: 400 });
  }
  if (name.includes(" - ")) {
    return NextResponse.json(
      { error: "The advantage name itself can't contain \" - \" — that's reserved to separate it from Obtains/Uses." },
      { status: 400 }
    );
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color || "")) {
    return NextResponse.json({ error: "Pick a color for the advantage." }, { status: 400 });
  }
  if ((ADVANTAGE_TYPES as readonly string[]).some((t) => t.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json(
      { error: `"${name}" is already a built-in advantage type.` },
      { status: 400 }
    );
  }

  const obtainsName = `${name} - Obtains`;
  const usesName = `${name} - Uses`;

  const { data: existing } = await supabaseAdmin
    .from("event_types")
    .select("name")
    .eq("category", "Advantages")
    .in("name", [obtainsName, usesName])
    .eq("active", true);
  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: `An advantage type named "${name}" already exists.` },
      { status: 400 }
    );
  }

  // Inserted first — its primary key (name) is the real collision guard
  // for re-adding a name that already exists, since event_types' upsert
  // below would otherwise just silently reactivate without complaint.
  const { error: typeError } = await supabaseAdmin
    .from("advantage_types")
    .insert({ name, color });
  if (typeError) {
    const message = typeError.code === "23505"
      ? `An advantage type named "${name}" already exists.`
      : typeError.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Upserts on (category, name) so recreating a previously-removed advantage
  // of this name reactivates its original rows instead of failing on the
  // unique constraint — same behavior as adding any other event type.
  const { data, error } = await supabaseAdmin
    .from("event_types")
    .upsert(
      [
        { category: "Advantages", name: obtainsName, point_value: 10, active: true },
        { category: "Advantages", name: usesName, point_value: 10, active: true },
      ],
      { onConflict: "category,name" }
    )
    .select("id, category, name, point_value, active");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ name, color, eventTypes: data });
}
