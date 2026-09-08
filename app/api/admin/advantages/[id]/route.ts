import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Mark an advantage active/used. Kept as a row (not deleted) so history
// survives, matching how the rest of the schema treats advantages.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  if (body.status !== "active" && body.status !== "used") {
    return NextResponse.json({ error: "status must be 'active' or 'used'." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("survivor_advantages")
    .update({
      status: body.status,
      used_at: body.status === "used" ? new Date().toISOString() : null,
    })
    .eq("id", params.id)
    .select("id, survivor_id, type, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// Removes an advantage entirely — for correcting a mistaken add, not for
// "using" one (use PATCH status: 'used' for that).
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabaseAdmin.from("survivor_advantages").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
