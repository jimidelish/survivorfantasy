import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Custom advantage types only (the 9 built-ins are hardcoded in
// lib/types.ts). Public read — used wherever an advantage's color needs
// resolving (My Picks, Episode Events) and by Admin > Update Survivors to
// extend the "grant an advantage" dropdown beyond the built-ins. See
// POST /api/admin/advantage-types for how these get created.
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("advantage_types")
    .select("name, color")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
