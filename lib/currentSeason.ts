import supabaseAdmin from "@/lib/supabaseAdmin";
import { Season } from "@/lib/types";

// "Current season" is always whichever row has the highest `number`.
// To start a new season, just insert a new row into `seasons` with a
// higher number — this function (and therefore the whole app) will
// automatically pick it up.
export async function getCurrentSeason(): Promise<Season | null> {
  const { data, error } = await supabaseAdmin
    .from("seasons")
    .select("id, number, name")
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as Season;
}
