import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name, is_admin")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name as string)?.trim();

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id, name, is_admin")
    .ilike("name", name)
    .maybeSingle();

  if (existing) return NextResponse.json(existing);

  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({ name })
    .select("id, name, is_admin")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
