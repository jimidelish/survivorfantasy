import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { ADVANTAGE_TYPES } from "@/lib/types";

// Grant a survivor a new advantage from Admin > Update Survivors. Always
// created as 'active' — mark it used (or remove it) via
// /api/admin/advantages/[id] once it's played.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const survivorId = body.survivor_id as string;
  const type = body.type as string;

  if (!survivorId || !type) {
    return NextResponse.json({ error: "survivor_id and type are required." }, { status: 400 });
  }
  if (!(ADVANTAGE_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: `Invalid advantage type: ${type}` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("survivor_advantages")
    .insert({ survivor_id: survivorId, type })
    .select("id, survivor_id, type, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
