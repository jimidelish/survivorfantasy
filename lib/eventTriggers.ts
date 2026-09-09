import { AdvantageType } from "./types";

// What a trigger event automatically does to the survivor(s) it's logged
// against. Hardcoded here rather than parsed from the uploaded CSV — free
// text describing an action can't safely become executable behavior, so a
// new trigger type requires a code change, not just a spreadsheet edit.
export type TriggerAction =
  | { kind: "add_advantage"; advantageType: AdvantageType }
  | { kind: "use_advantage"; advantageType: AdvantageType }
  | { kind: "beware_accept" }
  | { kind: "beware_complete" }
  | { kind: "set_eliminated" }
  | { kind: "lose_vote" }
  | { kind: "advantage_transfer" };

// What actually got changed by one applied TriggerAction, stored on the
// events row (`events.trigger_effect`) so Undo / Clear all events can
// reverse exactly this, not just "whatever the current state is."
export type TriggerEffect =
  | { kind: "add_advantage"; advantageId: string }
  | { kind: "use_advantage"; advantageId: string }
  | { kind: "beware_accept"; advantageId: string; previousHasVote: boolean }
  | { kind: "beware_complete"; advantageId: string | null; previousHasVote: boolean }
  | { kind: "set_eliminated"; previousEliminated: boolean }
  | { kind: "lose_vote"; previousHasVote: boolean }
  | { kind: "advantage_transfer"; sourceAdvantageId: string; createdAdvantageId: string | null };

interface TriggerDefinition {
  category: string;
  name: string;
  action: TriggerAction;
}

// The 21 standard trigger event types. The Scoring Guide page's CSV upload
// requires these exact (category, name) pairs as its first 21 rows,
// in this exact order — point_value is free to differ per season, but the
// category/name/order must match, or the upload is rejected. See
// app/api/admin/event-types-csv/route.ts for the check.
export const EVENT_TRIGGERS: TriggerDefinition[] = [
  {
    category: "Advantages",
    name: "Advantage Given to/Used for Someone Else",
    action: { kind: "advantage_transfer" },
  },
  { category: "Advantages", name: "Beware Advantage - Accepts", action: { kind: "beware_accept" } },
  { category: "Advantages", name: "Beware Advantage - Completes", action: { kind: "beware_complete" } },
  {
    category: "Advantages",
    name: "Block a Vote - Obtains",
    action: { kind: "add_advantage", advantageType: "Block a Vote" },
  },
  {
    category: "Advantages",
    name: "Block a Vote - Uses",
    action: { kind: "use_advantage", advantageType: "Block a Vote" },
  },
  {
    category: "Advantages",
    name: "Extra Vote - Obtains",
    action: { kind: "add_advantage", advantageType: "Extra Vote" },
  },
  {
    category: "Advantages",
    name: "Extra Vote - Uses",
    action: { kind: "use_advantage", advantageType: "Extra Vote" },
  },
  {
    category: "Advantages",
    name: "Finds Advantage Clue",
    action: { kind: "add_advantage", advantageType: "Advantage Clue" },
  },
  {
    category: "Advantages",
    name: "Hidden Immunity Idol - Obtains",
    action: { kind: "add_advantage", advantageType: "Immunity Idol" },
  },
  {
    category: "Advantages",
    name: "Hidden Immunity Idol - Uses",
    action: { kind: "use_advantage", advantageType: "Immunity Idol" },
  },
  {
    category: "Advantages",
    name: "Idol Nullifier - Obtains",
    action: { kind: "add_advantage", advantageType: "Idol Nullifier" },
  },
  {
    category: "Advantages",
    name: "Idol Nullifier - Uses",
    action: { kind: "use_advantage", advantageType: "Idol Nullifier" },
  },
  {
    category: "Advantages",
    name: "Knowledge is Power - Obtains",
    action: { kind: "add_advantage", advantageType: "Knowledge is Power" },
  },
  {
    category: "Advantages",
    name: "Knowledge is Power - Uses",
    action: { kind: "use_advantage", advantageType: "Knowledge is Power" },
  },
  {
    category: "Advantages",
    name: "Shot in the Dark - Uses",
    action: { kind: "use_advantage", advantageType: "Shot in the Dark" },
  },
  {
    category: "Advantages",
    name: "Steal a Vote - Obtains",
    action: { kind: "add_advantage", advantageType: "Steal a Vote" },
  },
  {
    category: "Advantages",
    name: "Steal a Vote - Uses",
    action: { kind: "use_advantage", advantageType: "Steal a Vote" },
  },
  { category: "Game Event", name: "Eliminated - Medical", action: { kind: "set_eliminated" } },
  { category: "Game Event", name: "Eliminated - Quits the Game", action: { kind: "set_eliminated" } },
  { category: "Game Event", name: "Eliminated - Voted Out", action: { kind: "set_eliminated" } },
  { category: "Game Event", name: "Loses their vote", action: { kind: "lose_vote" } },
];

const triggerLookup = new Map<string, TriggerAction>(
  EVENT_TRIGGERS.map((t) => [`${t.category}::${t.name}`, t.action])
);

export function getTriggerAction(category: string, name: string): TriggerAction | null {
  return triggerLookup.get(`${category}::${name}`) || null;
}
