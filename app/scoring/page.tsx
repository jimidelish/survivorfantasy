"use client";

import { useEffect, useMemo, useState } from "react";
import { AppUser, EventType, LOCAL_STORAGE_KEY } from "@/lib/types";
import CsvUpload from "@/components/CsvUpload";

export default function ScoringPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        // ignore malformed storage
      }
    }
  }, []);

  function refresh() {
    fetch("/api/event-types")
      .then((r) => r.json())
      .then(setEventTypes)
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  // Categories A-Z; within a category, keep the API's own ordering
  // (highest point value first) rather than re-sorting alphabetically —
  // this is a "how do I score the most points" reference, not a lookup list.
  const grouped = useMemo(() => {
    const groups = new Map<string, EventType[]>();
    for (const t of eventTypes) {
      if (!groups.has(t.category)) groups.set(t.category, []);
      groups.get(t.category)!.push(t);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [eventTypes]);

  async function updatePointValue(id: string, pointValue: number) {
    await fetch(`/api/admin/event-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ point_value: pointValue }),
    });
    refresh();
  }

  if (loading) return <p className="text-sm text-muted">Loading scoring table…</p>;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Scoring Table</h1>
      <p className="mt-2 text-sm text-muted">
        How survivors earn (or lose) points during an episode.
        {user?.is_admin && " Point values below are editable."}
      </p>

      <div className="mt-8 space-y-8">
        {grouped.map(([category, types]) => (
          <div key={category}>
            <h2 className="font-display text-xl font-semibold text-gold">{category}</h2>
            <div className="mt-3 rope-divider" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {types.map((t) => (
                <ScoringRow
                  key={t.id}
                  eventType={t}
                  editable={!!user?.is_admin}
                  onSave={updatePointValue}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {user?.is_admin && (
        <div className="mt-12">
          <div className="rope-divider" />
          <h2 className="mt-8 font-display text-xl font-semibold">Balance changes via CSV</h2>
          <p className="mt-2 text-sm text-muted">
            Upload a scoring CSV named{" "}
            <code className="text-gold">event_types_s&#123;season&#125;.csv</code> to fully replace
            the active scoring table in one go — add, remove, or bulk-adjust event types at once,
            instead of editing one at a time above. The first 21 rows must be the standard trigger
            events, in order (only their point values may differ); everything after that is
            free-form.
          </p>
          <div className="mt-4">
            <CsvUpload
              title="Event types"
              description="Headers: category, name, point_value"
              expectedPattern="event_types_s{season}.csv — e.g. event_types_s51.csv"
              confirmLabel="I understand this deactivates the current scoring table and replaces it with this file's rows."
              onUpload={async (filename, csv, confirm) => {
                const res = await fetch("/api/admin/event-types-csv", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ filename, csv, confirm }),
                });
                const data = await res.json();
                if (!res.ok) return { ok: false, message: data.error || "Upload failed." };
                refresh();
                return {
                  ok: true,
                  message: `${data.eventTypesActive} event type(s) are now active (labeled for Season ${data.seasonLabel}).`,
                };
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ScoringRow({
  eventType,
  editable,
  onSave,
}: {
  eventType: EventType;
  editable: boolean;
  onSave: (id: string, pointValue: number) => void;
}) {
  const [value, setValue] = useState(String(eventType.point_value));

  useEffect(() => {
    setValue(String(eventType.point_value));
  }, [eventType.point_value]);

  const numericValue = Number(value);
  const dirty = value.trim() !== "" && !Number.isNaN(numericValue) && numericValue !== eventType.point_value;
  const positive = eventType.point_value > 0;
  const negative = eventType.point_value < 0;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-surface2 bg-surface px-4 py-3">
      <span className="text-sm text-parchment">{eventType.name}</span>
      {editable ? (
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-16 rounded-md border border-surface2 bg-surface2 px-2 py-1 text-right text-sm"
          />
          {dirty && (
            <button
              type="button"
              onClick={() => onSave(eventType.id, numericValue)}
              className="rounded-full bg-ember px-2 py-1 text-xs font-medium text-jungle hover:opacity-90"
            >
              Save
            </button>
          )}
        </div>
      ) : (
        <span
          className={`shrink-0 font-display text-sm ${
            positive ? "text-gold" : negative ? "text-rust" : "text-muted"
          }`}
        >
          {eventType.point_value > 0 ? "+" : ""}
          {eventType.point_value}
        </span>
      )}
    </div>
  );
}
