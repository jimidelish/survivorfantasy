import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Removes one entry from a survivor's tribe history, from Admin > Update
// Survivors — for correcting a mistaken assignment (e.g. a wrong drag in
// Assign Tribes). The *current* (most recent) entry can't be deleted this
// way, since My Picks treats "last entry" as "current tribe," and that
// needs to stay in sync with survivors.current_tribe_id — reassign the
// survivor to a different tribe instead, which appends a new entry.
export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data: entry } = await supabaseAdmin
    .from("survivor_tribe_history")
    .select("id, survivor_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!entry) return NextResponse.json({ error: "History entry not found." }, { status: 404 });

  const { data: latest } = await supabaseAdmin
    .from("survivor_tribe_history")
    .select("id")
    .eq("survivor_id", entry.survivor_id)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.id === entry.id) {
    return NextResponse.json(
      { error: "Can't delete the current tribe — reassign them to a different tribe instead." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("survivor_tribe_history").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
