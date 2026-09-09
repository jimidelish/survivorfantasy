import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Inline point-value edit from the Scoring Guide page — a quick single-row
// balance change. category/name/active stay CSV-managed via
// admin/event-types-csv (adding/removing/retiring event types).
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
