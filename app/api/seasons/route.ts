import { NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

// Every season, newest first — used by Admin > Season Control's season
// picker. Unlike /api/seasons/current (always the highest number, used
// everywhere else in the app), this is the one place an admin can look at
// or manage a season other than the current one.
export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("seasons")
    .select("id, number, name")
    .order("number", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
