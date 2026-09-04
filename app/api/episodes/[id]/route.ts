import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (typeof body.locked === "boolean") update.locked = body.locked;

  const { data, error } = await supabaseAdmin
    .from("episodes")
    .update(update)
    .eq("id", params.id)
    .select("id, season_id, number, title, air_date, locked")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
