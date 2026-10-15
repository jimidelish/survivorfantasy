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
  | { kind: "set_eliminated"; previousEliminated: boolean; previousTribeId: string | null }
  | { kind: "lose_vote"; previousHasVote: boolean }
  | {
      kind: "advantage_transfer";
      sourceAdvantageId: string;
      createdAdvantageId: string | null;
      createdEventId: string | null;
    };

interface TriggerDefinition {
  category: string;
  name: string;
  action: TriggerAction;
}

// The 21 standard trigger event types. Their (category, name) pairs are
// load-bearing — the trigger engine looks them up by that exact string
// match — so the Scoring Guide's per-category Edit mode blocks removing
// any of these (point_value is still freely editable). See
// app/api/admin/event-types/[id]/route.ts's DELETE handler.
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

const OBTAINS_SUFFIX = " - Obtains";
const USES_SUFFIX = " - Uses";

// Custom advantage types (Scoring Guide's "Add advantage" button, see
// app/api/admin/advantage-types/route.ts) aren't in the hardcoded list
// above — they're recognized by this naming convention instead: any
// Advantages-category event type named "<Name> - Obtains"/"<Name> - Uses"
// that isn't already a hardcoded trigger is assumed to grant/mark-used an
// advantage of type <Name>, using the exact same generic add_advantage/
// use_advantage actions as the 9 standard types. This is safe precisely
// because it can only ever produce one of those two fixed, already-generic
// actions — never arbitrary behavior — so it's not the "free text becomes
// executable logic" problem the rest of this file's comments warn about.
export function getTriggerAction(category: string, name: string): TriggerAction | null {
  const hardcoded = triggerLookup.get(`${category}::${name}`);
  if (hardcoded) return hardcoded;

  if (category === "Advantages") {
    if (name.endsWith(OBTAINS_SUFFIX)) {
      return { kind: "add_advantage", advantageType: name.slice(0, -OBTAINS_SUFFIX.length) };
    }
    if (name.endsWith(USES_SUFFIX)) {
      return { kind: "use_advantage", advantageType: name.slice(0, -USES_SUFFIX.length) };
    }
  }

  return null;
}

// The "Obtains" trigger event that grants a given advantage type, if one
// exists (Beware Advantage and Shot in the Dark are granted other ways, not
// via a standalone "obtains" trigger, so this returns null for those). Used
// when an advantage is given to someone else, to also log a normal event
// recording that they received it. Falls back to the naming convention for
// custom advantage types — the caller does its own DB lookup before using
// the result, so a wrong guess just means that event doesn't exist and gets
// skipped, same as it already does for Beware Advantage/Shot in the Dark.
export function getObtainEventFor(advantageType: string): { category: string; name: string } | null {
  const match = EVENT_TRIGGERS.find(
    (t) => t.action.kind === "add_advantage" && t.action.advantageType === advantageType
  );
  if (match) return { category: match.category, name: match.name };
  return { category: "Advantages", name: `${advantageType}${OBTAINS_SUFFIX}` };
}
