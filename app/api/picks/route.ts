import { NextRequest, NextResponse } from "next/server";
import supabaseAdmin from "@/lib/supabaseAdmin";
import { MAX_MULTIPLIER_PER_SURVIVOR } from "@/lib/types";
import { computeMultiplierBudget } from "@/lib/multiplierBudget";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const episodeId = req.nextUrl.searchParams.get("episode_id");

  if (!userId || !episodeId) {
    return NextResponse.json(
      { error: "user_id and episode_id query params are required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("picks")
    .select("id, user_id, episode_id, survivor_id, multiplier")
    .eq("user_id", userId)
    .eq("episode_id", episodeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, episode_id } = body;
  const picks: { survivor_id: string; multiplier: number }[] = body.picks || [];

  if (!user_id || !episode_id) {
    return NextResponse.json(
      { error: "user_id and episode_id are required." },
      { status: 400 }
    );
  }

  if (picks.length === 0) {
    return NextResponse.json({ error: "Select at least one survivor." }, { status: 400 });
  }
  const survivorIds = picks.map((p) => p.survivor_id);
  if (new Set(survivorIds).size !== survivorIds.length) {
    return NextResponse.json({ error: "Duplicate survivor in picks." }, { status: 400 });
  }
  if (
    picks.some(
      (p) =>
        !Number.isInteger(p.multiplier) ||
        p.multiplier < 1 ||
        p.multiplier > MAX_MULTIPLIER_PER_SURVIVOR
    )
  ) {
    return NextResponse.json(
      { error: `Each survivor's multiplier must be between 1 and ${MAX_MULTIPLIER_PER_SURVIVOR}.` },
      { status: 400 }
    );
  }

  const { data: episode, error: episodeError } = await supabaseAdmin
    .from("episodes")
    .select("id, locked")
    .eq("id", episode_id)
    .single();

  if (episodeError || !episode) {
    return NextResponse.json({ error: "Episode not found." }, { status: 404 });
  }
  if (episode.locked) {
    return NextResponse.json(
      { error: "Picks are locked for this episode." },
      { status: 403 }
    );
  }

  // The budget depends on standings as of the previous episode, so it's
  // computed dynamically rather than stored anywhere.
  const { budget } = await computeMultiplierBudget(user_id, episode_id);
  const totalMultiplier = picks.reduce((sum, p) => sum + p.multiplier, 0);
  if (totalMultiplier !== budget) {
    return NextResponse.json(
      {
        error: `Multipliers must add up to exactly your budget of ${budget} for this episode. Yours add up to ${totalMultiplier}.`,
      },
      { status: 400 }
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("picks")
    .delete()
    .eq("user_id", user_id)
    .eq("episode_id", episode_id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const rows = picks.map((p) => ({
    user_id,
    episode_id,
    survivor_id: p.survivor_id,
    multiplier: p.multiplier,
  }));

  const { data, error: insertError } = await supabaseAdmin.from("picks").insert(rows).select();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json(data);
}
