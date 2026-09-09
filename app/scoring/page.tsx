"use client";

import { useEffect, useMemo, useState } from "react";
import { AppUser, EventType, LOCAL_STORAGE_KEY } from "@/lib/types";
import CsvUpload from "@/components/CsvUpload";

export default function ScoringPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingEdits, setPendingEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

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

  function setPendingValue(id: string, value: number | undefined) {
    setPendingEdits((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  async function saveChanges() {
    setSaving(true);
    await Promise.all(
      Object.entries(pendingEdits).map(([id, pointValue]) =>
        fetch(`/api/admin/event-types/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ point_value: pointValue }),
        })
      )
    );
    setPendingEdits({});
    setSaving(false);
    refresh();
  }

  if (loading) return <p className="text-sm text-muted">Loading scoring guide…</p>;

  const hasChanges = Object.keys(pendingEdits).length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Scoring Guide</h1>
          <p className="mt-2 text-sm text-muted">
            How survivors earn (or lose) points during an episode.
            {user?.is_admin && " Point values below are editable."}
          </p>
        </div>
        {user?.is_admin && (
          <div className="flex items-center gap-3">
            <span className={`text-xs ${hasChanges ? "text-gold" : "text-muted"}`}>
              {saving ? "Saving…" : hasChanges ? "Changes made" : "All saved"}
            </span>
            {hasChanges && (
              <button
                type="button"
                onClick={saveChanges}
                disabled={saving}
                className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-jungle hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 space-y-8">
        {grouped.map(([category, types]) => {
          const categoryHasChanges = types.some((t) => pendingEdits[t.id] !== undefined);
          return (
          <div key={category}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-semibold text-gold">{category}</h2>
              {categoryHasChanges && (
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="text-xs text-gold underline hover:text-ember"
                >
                  Changes made — save at top
                </button>
              )}
            </div>
            <div className="mt-3 rope-divider" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {types.map((t) => (
                <ScoringRow
                  key={t.id}
                  eventType={t}
                  editable={!!user?.is_admin}
                  pendingValue={pendingEdits[t.id]}
                  onChange={setPendingValue}
                />
              ))}
            </div>
          </div>
          );
        })}
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
  pendingValue,
  onChange,
}: {
  eventType: EventType;
  editable: boolean;
  pendingValue: number | undefined;
  onChange: (id: string, value: number | undefined) => void;
}) {
  const [text, setText] = useState(String(pendingValue ?? eventType.point_value));

  useEffect(() => {
    setText(String(pendingValue ?? eventType.point_value));
  }, [eventType.point_value, pendingValue]);

  function handleChange(v: string) {
    setText(v);
    const n = Number(v);
    if (v.trim() !== "" && !Number.isNaN(n) && n !== eventType.point_value) {
      onChange(eventType.id, n);
    } else {
      onChange(eventType.id, undefined);
    }
  }

  const dirty = pendingValue !== undefined;
  const positive = eventType.point_value > 0;
  const negative = eventType.point_value < 0;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 ${
        dirty ? "border-gold/50 bg-surface" : "border-surface2 bg-surface"
      }`}
    >
      <span className="text-sm text-parchment">{eventType.name}</span>
      {editable ? (
        <input
          type="number"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          className="w-16 shrink-0 rounded-md border border-surface2 bg-surface2 px-2 py-1 text-right text-sm"
        />
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
