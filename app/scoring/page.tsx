"use client";

import { useEffect, useMemo, useState } from "react";
import { AppUser, EventType, LOCAL_STORAGE_KEY } from "@/lib/types";
import { getTriggerAction } from "@/lib/eventTriggers";

interface NewTypeDraft {
  tempId: string;
  name: string;
  pointValue: string;
}

export default function ScoringPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // All three of these are staged — nothing actually hits the API until
  // Save changes is clicked, consistent across point-value edits, adds,
  // and removals.
  const [pendingEdits, setPendingEdits] = useState<Record<string, number>>({});
  const [pendingNewTypes, setPendingNewTypes] = useState<Record<string, NewTypeDraft[]>>({});
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newTypeInput, setNewTypeInput] = useState<Record<string, { name: string; pointValue: string }>>(
    {}
  );
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
    const patches = Object.entries(pendingEdits).map(([id, pointValue]) =>
      fetch(`/api/admin/event-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ point_value: pointValue }),
      })
    );
    const creates = Object.entries(pendingNewTypes).flatMap(([category, drafts]) =>
      drafts.map((d) =>
        fetch("/api/admin/event-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, name: d.name, point_value: Number(d.pointValue) }),
        })
      )
    );
    const deletes = Array.from(pendingRemovals).map((id) =>
      fetch(`/api/admin/event-types/${id}`, { method: "DELETE" })
    );
    await Promise.all([...patches, ...creates, ...deletes]);
    setPendingEdits({});
    setPendingNewTypes({});
    setPendingRemovals(new Set());
    setSaving(false);
    refresh();
  }

  // Only one category editable at a time — opening a new one closes
  // (and discards unsaved drafts for) whichever was open, same as
  // explicitly clicking "Done" on it.
  function toggleEdit(category: string, types: EventType[]) {
    setEditingCategory((prev) => {
      if (prev === category) {
        discardPendingFor(category, types);
        return null;
      }
      if (prev) {
        const prevTypes = grouped.find(([c]) => c === prev)?.[1] ?? [];
        discardPendingFor(prev, prevTypes);
      }
      return category;
    });
  }

  function discardPendingFor(category: string, types: EventType[]) {
    setPendingEdits((pe) => {
      const copy = { ...pe };
      for (const t of types) delete copy[t.id];
      return copy;
    });
    setPendingNewTypes((prev) => {
      const copy = { ...prev };
      delete copy[category];
      return copy;
    });
    setPendingRemovals((prev) => {
      const next = new Set(prev);
      for (const t of types) next.delete(t.id);
      return next;
    });
  }

  function updateNewTypeInput(category: string, field: "name" | "pointValue", value: string) {
    setNewTypeInput((prev) => {
      const current = prev[category] ?? { name: "", pointValue: "" };
      return { ...prev, [category]: { ...current, [field]: value } };
    });
  }

  // Stages a new row locally — nothing is sent to the server until Save
  // changes, same as a point-value edit.
  function stageNewType(category: string) {
    const input = newTypeInput[category];
    const name = input?.name.trim();
    const pointValue = Number(input?.pointValue);
    if (!name) {
      setActionError("Enter a name for the new event type.");
      return;
    }
    if (!input?.pointValue || !Number.isFinite(pointValue)) {
      setActionError("Enter a numeric point value.");
      return;
    }
    setActionError(null);
    setPendingNewTypes((prev) => ({
      ...prev,
      [category]: [
        ...(prev[category] ?? []),
        { tempId: crypto.randomUUID(), name, pointValue: input.pointValue },
      ],
    }));
    setNewTypeInput((prev) => ({ ...prev, [category]: { name: "", pointValue: "" } }));
  }

  function unstageNewType(category: string, tempId: string) {
    setPendingNewTypes((prev) => ({
      ...prev,
      [category]: (prev[category] ?? []).filter((d) => d.tempId !== tempId),
    }));
  }

  function toggleRemoval(id: string) {
    setPendingRemovals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) return <p className="text-sm text-muted">Loading scoring guide…</p>;

  // Only the open category can have entries across these (toggleEdit
  // discards any other category's drafts), so this alone is enough to
  // block switching or closing out of unsaved changes anywhere on the page.
  const hasUnsavedChanges =
    Object.keys(pendingEdits).length > 0 ||
    Object.values(pendingNewTypes).some((list) => list.length > 0) ||
    pendingRemovals.size > 0;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Scoring Guide</h1>
      <p className="mt-2 text-sm text-muted">
        How survivors earn (or lose) points during an episode.
        {user?.is_admin &&
          " Click Edit on a category to change its point values, or add/remove event types."}
      </p>

      {actionError && <p className="mt-4 text-sm text-rust">{actionError}</p>}

      <div className="mt-8 space-y-8">
        {grouped.map(([category, types]) => {
          const newDrafts = pendingNewTypes[category] ?? [];
          const categoryHasChanges =
            types.some((t) => pendingEdits[t.id] !== undefined || pendingRemovals.has(t.id)) ||
            newDrafts.length > 0;
          const editing = editingCategory === category;
          const input = newTypeInput[category];
          return (
            <div key={category}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold text-gold">{category}</h2>
                {user?.is_admin && (
                  <button
                    type="button"
                    onClick={() => toggleEdit(category, types)}
                    disabled={hasUnsavedChanges}
                    title={
                      hasUnsavedChanges
                        ? "Save or discard your unsaved changes first"
                        : undefined
                    }
                    className={`rounded-full border px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
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
                    onToggleRemove={editing ? () => toggleRemoval(t.id) : undefined}
                    pendingRemoval={pendingRemovals.has(t.id)}
                    isProtected={!!getTriggerAction(t.category, t.name)}
                  />
                ))}
                {newDrafts.map((d) => (
                  <div
                    key={d.tempId}
                    className="flex items-center justify-between gap-3 rounded-md border border-gold/50 bg-surface px-4 py-3"
                  >
                    <span className="text-sm text-parchment">
                      {d.name} <span className="ml-1 text-[10px] text-gold">new</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-display text-sm text-gold">{d.pointValue}</span>
                      <button
                        type="button"
                        onClick={() => unstageNewType(category, d.tempId)}
                        title={`Remove staged ${d.name}`}
                        className="h-6 w-6 shrink-0 rounded-full border border-surface2 text-xs text-rust hover:border-rust"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {editing && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-surface2 px-4 py-3">
                  <input
                    placeholder="New event name"
                    value={input?.name ?? ""}
                    onChange={(e) => updateNewTypeInput(category, "name", e.target.value)}
                    className="min-w-[10rem] flex-1 rounded-md border border-surface2 bg-surface2 px-3 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Points"
                    value={input?.pointValue ?? ""}
                    onChange={(e) => updateNewTypeInput(category, "pointValue", e.target.value)}
                    className="w-20 rounded-md border border-surface2 bg-surface2 px-2 py-1.5 text-right text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => stageNewType(category)}
                    className="rounded-md bg-ember px-3 py-1.5 text-xs font-medium text-jungle hover:opacity-90"
                  >
                    Add event type
                  </button>
                </div>
              )}

              {editing && categoryHasChanges && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gold">{saving ? "Saving…" : "Unsaved changes"}</span>
                  <button
                    type="button"
                    onClick={saveChanges}
                    disabled={saving}
                    className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-jungle hover:opacity-90 disabled:opacity-40"
                  >
                    {saving ? "Saving…" : "Save changes"}
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
  onToggleRemove,
  pendingRemoval,
  isProtected,
}: {
  eventType: EventType;
  editable: boolean;
  pendingValue: number | undefined;
  onChange: (id: string, value: number | undefined) => void;
  onToggleRemove?: () => void;
  pendingRemoval?: boolean;
  isProtected?: boolean;
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
        pendingRemoval
          ? "border-rust/50 bg-surface opacity-60"
          : dirty
          ? "border-gold/50 bg-surface"
          : "border-surface2 bg-surface"
      }`}
    >
      <span className={`text-sm text-parchment ${pendingRemoval ? "line-through" : ""}`}>
        {eventType.name}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {pendingRemoval ? (
          <span className="text-xs text-rust">Removing</span>
        ) : editable ? (
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
        {editable && onToggleRemove && !isProtected && (
          <button
            type="button"
            onClick={onToggleRemove}
            title={pendingRemoval ? `Undo removing ${eventType.name}` : `Remove ${eventType.name}`}
            className={`h-6 w-6 shrink-0 rounded-full border text-xs ${
              pendingRemoval
                ? "border-gold/50 text-gold hover:border-gold"
                : "border-surface2 text-rust hover:border-rust"
            }`}
          >
            {pendingRemoval ? "↺" : "×"}
          </button>
        )}
        {editable && isProtected && (
          <span
            title="Required by built-in game logic — can't be removed"
            className="h-6 w-6 shrink-0 rounded-full border border-surface2 text-center text-xs leading-6 text-muted/50"
          >
            ×
          </span>
        )}
      </div>
    </div>
  );
}
