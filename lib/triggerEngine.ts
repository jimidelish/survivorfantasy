import supabaseAdmin from "./supabaseAdmin";
import { TriggerAction, TriggerEffect } from "./eventTriggers";

// Applies a trigger action for one survivor. Returns the effect to store on
// the events row (null if nothing was written, e.g. advantage_transfer,
// which needs interactive input handled separately — see
// app/api/events/[id]/advantage-transfer/route.ts) plus an optional warning
// to surface to the admin (e.g. the expected prerequisite advantage wasn't
// found — the event still logs, per product decision, just flagged).
export async function applyTrigger(
  survivorId: string,
  action: TriggerAction
): Promise<{ effect: TriggerEffect | null; warning: string | null }> {
  switch (action.kind) {
    case "add_advantage": {
      const { data, error } = await supabaseAdmin
        .from("survivor_advantages")
        .insert({ survivor_id: survivorId, type: action.advantageType, status: "active" })
        .select("id")
        .single();
      if (error || !data) {
        return { effect: null, warning: `Couldn't add ${action.advantageType}: ${error?.message}` };
      }
      return { effect: { kind: "add_advantage", advantageId: data.id }, warning: null };
    }

    case "use_advantage": {
      const row = await findOldestActiveAdvantage(survivorId, action.advantageType);
      if (!row) {
        return {
          effect: null,
          warning: `No active ${action.advantageType} found to mark used.`,
        };
      }
      const { error } = await markAdvantageUsed(row.id);
      if (error) {
        return { effect: null, warning: `Couldn't mark ${action.advantageType} used: ${error.message}` };
      }
      return { effect: { kind: "use_advantage", advantageId: row.id }, warning: null };
    }

    case "beware_accept": {
      const previousHasVote = await getHasVote(survivorId);
      const { data, error } = await supabaseAdmin
        .from("survivor_advantages")
        .insert({ survivor_id: survivorId, type: "Beware Advantage", status: "active" })
        .select("id")
        .single();
      if (error || !data) {
        return { effect: null, warning: `Couldn't add Beware Advantage: ${error?.message}` };
      }
      await setHasVote(survivorId, false);
      return {
        effect: { kind: "beware_accept", advantageId: data.id, previousHasVote },
        warning: null,
      };
    }

    case "beware_complete": {
      const previousHasVote = await getHasVote(survivorId);
      const row = await findOldestActiveAdvantage(survivorId, "Beware Advantage");
      let warning: string | null = null;
      if (row) {
        await markAdvantageUsed(row.id);
      } else {
        warning = "No active Beware Advantage found to resolve.";
      }
      await setHasVote(survivorId, true);
      return {
        effect: { kind: "beware_complete", advantageId: row?.id ?? null, previousHasVote },
        warning,
      };
    }

    case "set_eliminated": {
      const { data: survivor } = await supabaseAdmin
        .from("survivors")
        .select("eliminated")
        .eq("id", survivorId)
        .single();
      const previousEliminated = survivor?.eliminated ?? false;
      const { error } = await supabaseAdmin
        .from("survivors")
        .update({ eliminated: true })
        .eq("id", survivorId);
      if (error) return { effect: null, warning: `Couldn't mark eliminated: ${error.message}` };
      return { effect: { kind: "set_eliminated", previousEliminated }, warning: null };
    }

    case "lose_vote": {
      const previousHasVote = await getHasVote(survivorId);
      const { error } = await setHasVote(survivorId, false);
      if (error) return { effect: null, warning: `Couldn't update vote status: ${error.message}` };
      return { effect: { kind: "lose_vote", previousHasVote }, warning: null };
    }

    case "advantage_transfer":
      // No automatic DB write — the caller (the bulk events route) flags
      // this event for a follow-up prompt instead.
      return { effect: null, warning: null };
  }
}

// Reverses a stored trigger effect — used by Undo and Clear all events,
// right before the events row itself is deleted.
export async function reverseTriggerEffect(survivorId: string, effect: TriggerEffect): Promise<void> {
  switch (effect.kind) {
    case "add_advantage":
      await supabaseAdmin.from("survivor_advantages").delete().eq("id", effect.advantageId);
      return;

    case "use_advantage":
      await supabaseAdmin
        .from("survivor_advantages")
        .update({ status: "active", used_at: null })
        .eq("id", effect.advantageId);
      return;

    case "beware_accept":
      await supabaseAdmin.from("survivor_advantages").delete().eq("id", effect.advantageId);
      await setHasVote(survivorId, effect.previousHasVote);
      return;

    case "beware_complete":
      if (effect.advantageId) {
        await supabaseAdmin
          .from("survivor_advantages")
          .update({ status: "active", used_at: null })
          .eq("id", effect.advantageId);
      }
      await setHasVote(survivorId, effect.previousHasVote);
      return;

    case "set_eliminated":
      await supabaseAdmin
        .from("survivors")
        .update({ eliminated: effect.previousEliminated })
        .eq("id", survivorId);
      return;

    case "lose_vote":
      await setHasVote(survivorId, effect.previousHasVote);
      return;

    case "advantage_transfer":
      await supabaseAdmin
        .from("survivor_advantages")
        .update({ status: "active", used_at: null })
        .eq("id", effect.sourceAdvantageId);
      if (effect.createdAdvantageId) {
        await supabaseAdmin.from("survivor_advantages").delete().eq("id", effect.createdAdvantageId);
      }
      return;
  }
}

async function findOldestActiveAdvantage(survivorId: string, type: string) {
  const { data } = await supabaseAdmin
    .from("survivor_advantages")
    .select("id")
    .eq("survivor_id", survivorId)
    .eq("type", type)
    .eq("status", "active")
    .order("acquired_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

function markAdvantageUsed(advantageId: string) {
  return supabaseAdmin
    .from("survivor_advantages")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", advantageId);
}

async function getHasVote(survivorId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("survivors")
    .select("has_vote")
    .eq("id", survivorId)
    .single();
  return data?.has_vote ?? true;
}

function setHasVote(survivorId: string, hasVote: boolean) {
  return supabaseAdmin.from("survivors").update({ has_vote: hasVote }).eq("id", survivorId);
}
