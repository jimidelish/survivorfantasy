"use client";

import SurvivorAvatar from "@/components/SurvivorAvatar";

export interface UserPicksGroup {
  user_id: string;
  user_name: string;
  picks: {
    survivor_id: string;
    survivor_name: string;
    photo_url: string | null;
    multiplier: number;
  }[];
}

// One row per user — their name, then their picked survivors as avatar
// chips with a multiplier badge, sorted most-picked-across-these-groups
// first. Shared by My Picks' handicap-only "Other players' picks" panel
// and Admin's "Picks by user", so both read the same way.
export default function UserPicksList({
  groups,
  emptyMessage,
}: {
  groups: UserPicksGroup[];
  emptyMessage: string;
}) {
  if (groups.length === 0) {
    return <p className="mt-3 text-sm text-muted">{emptyMessage}</p>;
  }

  const countBySurvivor = new Map<string, number>();
  for (const group of groups) {
    for (const p of group.picks) {
      countBySurvivor.set(p.survivor_id, (countBySurvivor.get(p.survivor_id) || 0) + 1);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {groups.map((group) => (
        <div key={group.user_id} className="flex items-start gap-3">
          <span className="w-20 shrink-0 pt-2 text-sm font-display text-gold">
            {group.user_name}
          </span>
          <div className="flex flex-wrap gap-3">
            {[...group.picks]
              .sort((a, b) => {
                const countA = countBySurvivor.get(a.survivor_id) ?? 0;
                const countB = countBySurvivor.get(b.survivor_id) ?? 0;
                if (countB !== countA) return countB - countA;
                return a.survivor_name.localeCompare(b.survivor_name);
              })
              .map((p) => (
                <div
                  key={p.survivor_id}
                  className="relative"
                  title={`${p.survivor_name} (${p.multiplier}×)`}
                >
                  <SurvivorAvatar name={p.survivor_name} photoUrl={p.photo_url} className="h-12 w-12" />
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-ember px-1.5 py-0.5 text-[10px] font-display leading-none text-jungle">
                    {p.multiplier}×
                  </span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
