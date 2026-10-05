"use client";

import { useEffect, useMemo, useState } from "react";
import { AppUser, EventType, LOCAL_STORAGE_KEY } from "@/lib/types";
import { getTriggerAction } from "@/lib/eventTriggers";

export default function ScoringPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingEdits, setPendingEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const [editingCategories, setEditingCategories] = useState<Set<string>>(new Set());
  const [newTypeDrafts, setNewTypeDrafts] = useState<Record<string, { name: string; pointValue: string }>>(
    {}
  );
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  function toggleEdit(category: string, types: EventType[]) {
    setEditingCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
        // Discard any unsaved point-value drafts for this category when
        // leaving edit mode, rather than leaving them staged but hidden.
        setPendingEdits((pe) => {
          const copy = { ...pe };
          for (const t of types) delete copy[t.id];
          return copy;
        });
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function updateDraft(category: string, field: "name" | "pointValue", value: string) {
    setNewTypeDrafts((prev) => {
      const current = prev[category] ?? { name: "", pointValue: "" };
      return { ...prev, [category]: { ...current, [field]: value } };
    });
  }

  async function addType(category: string) {
    const draft = newTypeDrafts[category];
    const name = draft?.name.trim();
    const pointValue = Number(draft?.pointValue);
    if (!name) {
      setActionError("Enter a name for the new event type.");
      return;
    }
    if (!draft?.pointValue || !Number.isFinite(pointValue)) {
      setActionError("Enter a numeric point value.");
      return;
    }
    setActionError(null);
    setAddingCategory(category);
    const res = await fetch("/api/admin/event-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, name, point_value: pointValue }),
    });
    const data = await res.json();
    setAddingCategory(null);
    if (!res.ok) {
      setActionError(data.error || "Failed to add event type.");
      return;
    }
    setNewTypeDrafts((prev) => ({ ...prev, [category]: { name: "", pointValue: "" } }));
    refresh();
  }

  async function removeType(t: EventType) {
    const confirmed = window.confirm(
      `Remove "${t.name}"? It'll disappear from the Scoring Guide and Episode Events — past events that already used it keep their recorded points.`
    );
    if (!confirmed) return;
    setActionError(null);
    setRemovingId(t.id);
    const res = await fetch(`/api/admin/event-types/${t.id}`, { method: "DELETE" });
    setRemovingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setActionError(data.error || "Failed to remove event type.");
      return;
    }
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
            {user?.is_admin &&
              " Click Edit on a category to change its point values, or add/remove event types."}
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

      {actionError && <p className="mt-4 text-sm text-rust">{actionError}</p>}

      <div className="mt-8 space-y-8">
        {grouped.map(([category, types]) => {
          const categoryHasChanges = types.some((t) => pendingEdits[t.id] !== undefined);
          const editing = editingCategories.has(category);
          const draft = newTypeDrafts[category];
          return (
            <div key={category}>
              <div className="flex flex-wrap items-center justify-between gap-3">
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
                {user?.is_admin && (
                  <button
                    type="button"
                    onClick={() => toggleEdit(category, types)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      editing
                        ? "border-gold bg-gold/10 text-gold"
                        : "border-surface2 text-muted hover:border-gold/50"
                    }`}
                  >
                    {editing ? "Done" : "Edit"}
                  </button>
                )}
              </div>
              <div className="mt-3 rope-divider" />
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {types.map((t) => (
                  <ScoringRow
                    key={t.id}
                    eventType={t}
                    editable={editing}
                    pendingValue={pendingEdits[t.id]}
                    onChange={setPendingValue}
                    onRemove={editing ? removeType : undefined}
                    isProtected={!!getTriggerAction(t.category, t.name)}
                    removing={removingId === t.id}
                  />
                ))}
              </div>

              {editing && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-surface2 px-4 py-3">
                  <input
                    placeholder="New event name"
                    value={draft?.name ?? ""}
                    onChange={(e) => updateDraft(category, "name", e.target.value)}
                    className="min-w-[10rem] flex-1 rounded-md border border-surface2 bg-surface2 px-3 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Points"
                    value={draft?.pointValue ?? ""}
                    onChange={(e) => updateDraft(category, "pointValue", e.target.value)}
                    className="w-20 rounded-md border border-surface2 bg-surface2 px-2 py-1.5 text-right text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => addType(category)}
                    disabled={addingCategory === category}
                    className="rounded-md bg-ember px-3 py-1.5 text-xs font-medium text-jungle hover:opacity-90 disabled:opacity-40"
                  >
                    {addingCategory === category ? "Adding…" : "Add event type"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoringRow({
  eventType,
  editable,
  pendingValue,
  onChange,
  onRemove,
  isProtected,
  removing,
}: {
  eventType: EventType;
  editable: boolean;
  pendingValue: number | undefined;
  onChange: (id: string, value: number | undefined) => void;
  onRemove?: (t: EventType) => void;
  isProtected?: boolean;
  removing?: boolean;
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
      <div className="flex shrink-0 items-center gap-2">
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
        {editable && onRemove && (
          <button
            type="button"
            onClick={() => onRemove(eventType)}
            disabled={isProtected || removing}
            title={
              isProtected
                ? "Required by built-in game logic — can't be removed"
                : `Remove ${eventType.name}`
            }
            className="h-6 w-6 shrink-0 rounded-full border border-surface2 text-xs text-rust hover:border-rust disabled:opacity-30"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
