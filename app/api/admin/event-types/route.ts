import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Adds one event type within an existing category, from the Scoring
// Guide's per-category Edit mode. Upserts on (category, name) — see
// event_types' unique constraint in schema.sql — so re-adding a
// previously-removed event type reactivates its original row (keeping its
// id and any past events' point history) instead of failing on the
// constraint or creating a duplicate.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const category = (body.category as string)?.trim();
  const name = (body.name as string)?.trim();
  const pointValue = Number(body.point_value);

  if (!category || !name) {
    return NextResponse.json({ error: "category and name are required." }, { status: 400 });
  }
  if (!Number.isFinite(pointValue)) {
    return NextResponse.json({ error: "point_value must be a number." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("event_types")
    .upsert(
      { category, name, point_value: pointValue, active: true },
      { onConflict: "category,name" }
    )
    .select("id, category, name, point_value, active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
