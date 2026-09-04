import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();

  // Setting is_current=true means "make this THE active episode for its
  // season" — so we clear any other active episode in that season first.
  if (body.is_current === true) {
    const { data: episode } = await supabaseAdmin
      .from("episodes")
      .select("season_id")
      .eq("id", params.id)
      .single();

    if (episode) {
      await supabaseAdmin
        .from("episodes")
        .update({ is_current: false })
        .eq("season_id", episode.season_id)
        .eq("is_current", true);
    }
  }

  const update: Record<string, unknown> = {};
  if (typeof body.locked === "boolean") update.locked = body.locked;
  if (typeof body.is_current === "boolean") update.is_current = body.is_current;

  const { data, error } = await supabaseAdmin
    .from("episodes")
    .update(update)
    .eq("id", params.id)
    .select("id, season_id, number, title, air_date, locked, is_current")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
