import { EventType, ADVANTAGE_COLORS, AdvantageType } from "./types";
import { getTriggerAction } from "./eventTriggers";

export interface AdvantageGroupItem {
  suffix: string;
  t: EventType;
}

export interface GroupedAdvantages {
  groups: [string, AdvantageGroupItem[]][];
  standalone: EventType[];
}

// Groups advantage event types by the part of their name before " - " (e.g.
// "Block a Vote - Obtains" / "Block a Vote - Uses" become one "Block a
// Vote" group with "- Obtains"/"- Uses" entries), so an Advantages list
// reads as a handful of advantage types rather than a flat alphabetical
// list. Event types that don't follow that "X - Y" pattern (e.g. "Finds
// Advantage Clue", admin-added ones with no fixed shape) come back
// separately as standalone, to render as plain rows. Shared by Episode
// Events' checkbox list and the Scoring Guide's read-only reference, so
// both group the same way.
export function groupAdvantageEventTypes(types: EventType[]): GroupedAdvantages {
  const groupMap = new Map<string, AdvantageGroupItem[]>();
  const standalone: EventType[] = [];

  for (const t of types) {
    const idx = t.name.indexOf(" - ");
    if (idx === -1) {
      standalone.push(t);
      continue;
    }
    const prefix = t.name.slice(0, idx);
    const suffix = t.name.slice(idx + 3);
    if (!groupMap.has(prefix)) groupMap.set(prefix, []);
    groupMap.get(prefix)!.push({ suffix, t });
  }

  const groups = Array.from(groupMap.entries())
    .map(
      ([prefix, items]) =>
        [
          prefix,
          [...items].sort(
            (a, b) => b.t.point_value - a.t.point_value || a.suffix.localeCompare(b.suffix)
          ),
        ] as [string, AdvantageGroupItem[]]
    )
    .sort((a, b) => a[0].localeCompare(b[0]));

  standalone.sort((a, b) => a.name.localeCompare(b.name));

  return { groups, standalone };
}

// Matches the pill's color to the app's existing advantage color system
// where possible — an exact prefix match (most of them: "Block a Vote",
// "Extra Vote", "Beware Advantage", etc.) first, then falling back to the
// trigger's own advantageType for names that don't match verbatim (e.g.
// "Hidden Immunity Idol - Obtains" still resolves to the "Immunity Idol"
// color via its trigger). Anything else (a custom advantage-category event
// type with no matching trigger) gets a neutral fallback.
export function advantagePillColor(t: EventType, prefix: string): string {
  if (prefix in ADVANTAGE_COLORS) return ADVANTAGE_COLORS[prefix as AdvantageType];
  const action = getTriggerAction(t.category, t.name);
  if (action && "advantageType" in action) return ADVANTAGE_COLORS[action.advantageType];
  return "#8FA294";
}
