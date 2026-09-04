import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { parseEventTypesFilename } from "@/lib/csvFilenames";

interface CsvRow {
  category?: string;
  name?: string;
  point_value?: string;
}

// Body: { filename: string, csv: string, confirm: boolean }
// Filename must match event_types_s{season}.csv — the season number is only
// used to confirm the upload back to the admin, since event_types is global.
//
// "Full replace" here means: every currently-active event type is marked
// inactive, then every row from the CSV is upserted (matched on
// category+name) as active. Rows already referenced by logged events are
// never deleted — only deactivated — so past scores can't be broken.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const filename = (body.filename as string) || "";
  const csv = (body.csv as string) || "";
  const confirm = body.confirm === true;

  const seasonNumber = parseEventTypesFilename(filename);
  if (!seasonNumber) {
    return NextResponse.json(
      {
        error: `Filename "${filename}" doesn't match the expected pattern event_types_s{season}.csv, e.g. event_types_s51.csv.`,
      },
      { status: 400 }
    );
  }

  if (!confirm) {
    return NextResponse.json(
      { error: "Upload not confirmed. This action replaces the active scoring table." },
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
      category: r.category?.trim(),
      name: r.name?.trim(),
      point_value: Number(r.point_value),
    }))
    .filter((r) => r.category && r.name && !Number.isNaN(r.point_value));

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found. Expected headers: category, name, point_value." },
      { status: 400 }
    );
  }

  // Deactivate everything currently active first.
  const { error: deactivateError } = await supabaseAdmin
    .from("event_types")
    .update({ active: false })
    .eq("active", true);
  if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 500 });

  // Upsert each CSV row as active, matching on (category, name).
  const upsertRows = rows.map((r) => ({
    category: r.category!,
    name: r.name!,
    point_value: r.point_value,
    active: true,
  }));

  const { data: upserted, error: upsertError } = await supabaseAdmin
    .from("event_types")
    .upsert(upsertRows, { onConflict: "category,name" })
    .select("id, category, name, point_value");

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({
    seasonLabel: seasonNumber,
    eventTypesActive: upserted?.length || 0,
  });
}
