import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { parseSurvivorsFilename } from "@/lib/csvFilenames";

interface CsvRow {
  name?: string;
  photo_url?: string;
  original_tribe?: string;
}

// Body: { filename: string, csv: string, confirm: boolean }
// Filename must match survivors_s{season}.csv. Creates the season if it
// doesn't exist yet. FULL REPLACE: deletes every existing survivor for that
// season (cascading to their picks/events/advantages) before inserting the
// new roster — the caller must pass confirm: true to acknowledge this.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const filename = (body.filename as string) || "";
  const csv = (body.csv as string) || "";
  const confirm = body.confirm === true;

  const seasonNumber = parseSurvivorsFilename(filename);
  if (!seasonNumber) {
    return NextResponse.json(
      {
        error: `Filename "${filename}" doesn't match the expected pattern survivors_s{season}.csv, e.g. survivors_s51.csv.`,
      },
      { status: 400 }
    );
  }

  if (!confirm) {
    return NextResponse.json(
      { error: "Upload not confirmed. This action replaces the season's survivor roster." },
      { status: 400 }
    );
  }

  const parsed = Papa.parse<CsvRow>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0) {
    return NextResponse.json(
      { error: `CSV parse error: ${parsed.errors[0].message} (row ${parsed.errors[0].row})` },
      { status: 400 }
    );
  }

  const rows = parsed.data
    .map((r) => ({
      name: r.name?.trim(),
      photo_url: r.photo_url?.trim() || null,
      original_tribe: r.original_tribe?.trim() || null,
    }))
    .filter((r) => r.name);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found. Expected headers: name, photo_url, original_tribe." },
      { status: 400 }
    );
  }

  // Find or create the season.
  let { data: season } = await supabaseAdmin
    .from("seasons")
    .select("id, number, name")
    .eq("number", seasonNumber)
    .maybeSingle();

  if (!season) {
    const { data: newSeason, error: seasonError } = await supabaseAdmin
      .from("seasons")
      .insert({ number: seasonNumber, name: `Season ${seasonNumber}` })
      .select("id, number, name")
      .single();
    if (seasonError) return NextResponse.json({ error: seasonError.message }, { status: 500 });
    season = newSeason;
  }

  // Full replace: only this season's survivors, nothing else.
  const { error: deleteError } = await supabaseAdmin
    .from("survivors")
    .delete()
    .eq("season_id", season!.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const insertRows = rows.map((r) => ({
    season_id: season!.id,
    name: r.name!,
    photo_url: r.photo_url,
    original_tribe: r.original_tribe,
    current_tribe: r.original_tribe, // tribes haven't swapped yet at initial setup
    shot_in_the_dark: true, // everyone starts the season eligible
  }));

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("survivors")
    .insert(insertRows)
    .select("id, name");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({
    season,
    survivorsInserted: inserted?.length || 0,
  });
}
