"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppUser,
  Episode,
  Survivor,
  EventType,
  SurvivorEvent,
  Tribe,
  LOCAL_STORAGE_KEY,
} from "@/lib/types";
import SurvivorAvatar from "@/components/SurvivorAvatar";

export default function EventsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [tribes, setTribes] = useState<Tribe[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [events, setEvents] = useState<SurvivorEvent[]>([]);

  const [episodeId, setEpisodeId] = useState("");
  const [selectedSurvivorIds, setSelectedSurvivorIds] = useState<Set<string>>(new Set());
  const [selectedEventTypeIds, setSelectedEventTypeIds] = useState<Set<string>>(new Set());
  const [toggledTribeIds, setToggledTribeIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      router.push("/login");
      return;
    }
    setUser(JSON.parse(raw));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch("/api/episodes").then((r) => r.json()),
      fetch("/api/survivors").then((r) => r.json()),
      fetch("/api/tribes").then((r) => r.json()),
      fetch("/api/event-types").then((r) => r.json()),
    ]).then(([eps, survs, tribeList, types]) => {
      setEpisodes(eps);
      setSurvivors(survs);
      setTribes(tribeList);
      setEventTypes(types);
      const activeEpisode = eps.find((e: Episode) => e.is_current) || eps[eps.length - 1];
      if (activeEpisode) setEpisodeId(activeEpisode.id);
    });
  }, [user]);

  useEffect(() => {
    if (!episodeId) return;
    fetch(`/api/events?episode_id=${episodeId}`)
      .then((r) => r.json())
      .then(setEvents);
  }, [episodeId]);

  const currentEpisode = episodes.find((e) => e.id === episodeId);

  const groupedEventTypes = useMemo(() => {
    const groups = new Map<string, EventType[]>();
    for (const t of eventTypes) {
      if (!groups.has(t.category)) groups.set(t.category, []);
      groups.get(t.category)!.push(t);
    }
    return Array.from(groups.entries());
  }, [eventTypes]);

  function toggleSurvivor(id: string) {
    setSelectedSurvivorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleEventType(id: string) {
    setSelectedEventTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // A pure on/off toggle per tribe: turning it on checks every survivor
  // currently on that tribe, turning it off unchecks them — independent of
  // any other manual checkbox changes (it doesn't try to track whether
  // members are still all checked afterward).
  function toggleTribe(tribe: Tribe) {
    const turningOn = !toggledTribeIds.has(tribe.id);
    const memberIds = survivors.filter((s) => s.current_tribe_id === tribe.id).map((s) => s.id);

    setToggledTribeIds((prev) => {
      const next = new Set(prev);
      if (turningOn) next.add(tribe.id);
      else next.delete(tribe.id);
      return next;
    });

    setSelectedSurvivorIds((prev) => {
      const next = new Set(prev);
      for (const id of memberIds) {
        if (turningOn) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function logEvents(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!episodeId || !user || selectedSurvivorIds.size === 0 || selectedEventTypeIds.size === 0) {
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/events/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episode_id: episodeId,
        survivor_ids: Array.from(selectedSurvivorIds),
        event_type_ids: Array.from(selectedEventTypeIds),
        entered_by_user_id: user.id,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    setEvents((prev) => [...data, ...prev]);
    setSelectedSurvivorIds(new Set());
    setSelectedEventTypeIds(new Set());
    setToggledTribeIds(new Set());
  }

  async function undoEvent(id: string) {
    await fetch(`/api/events?id=${id}`, { method: "DELETE" });
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
  }

  async function clearAllEvents() {
    if (!episodeId || events.length === 0) return;
    const label = currentEpisode
      ? `Episode ${currentEpisode.number}${currentEpisode.title ? ` — ${currentEpisode.title}` : ""}`
      : "this episode";
    const confirmed = window.confirm(
      `Delete all ${events.length} event(s) logged for ${label}? This cannot be undone.`
    );
    if (!confirmed) return;
    await fetch(`/api/events?episode_id=${episodeId}`, { method: "DELETE" });
    setEvents([]);
  }

  if (!user) return null;

  const eventCount = selectedSurvivorIds.size * selectedEventTypeIds.size;

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Enter events</h1>
      <p className="mt-2 text-sm text-muted">
        Log what happened this episode. Points flow to whoever drafted each survivor,
        multiplied by their assigned multiplier. Anyone signed in can log events.
        Episode locking and the active episode are managed from Admin &gt; Season Control.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <select
          value={episodeId}
          onChange={(e) => setEpisodeId(e.target.value)}
          className="rounded-md border border-surface2 bg-surface px-3 py-2 text-sm"
        >
          {episodes.map((ep) => (
            <option key={ep.id} value={ep.id}>
              Episode {ep.number}
              {ep.title ? ` — ${ep.title}` : ""}
            </option>
          ))}
        </select>
        {currentEpisode?.locked && (
          <span className="rounded-full bg-rust/20 px-3 py-1 text-xs text-rust">
            Picks are locked for this episode
          </span>
        )}
      </div>

      <div className="mt-8 rope-divider" />

      <form onSubmit={logEvents} className="mt-6">
        <p className="font-display text-lg">Who</p>

        {tribes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {tribes.map((t) => {
              const on = toggledTribeIds.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTribe(t)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                  style={
                    on
                      ? { backgroundColor: t.color, borderColor: t.color, color: "#161F1A" }
                      : { borderColor: `${t.color}66`, color: t.color }
                  }
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {survivors.map((s) => {
            const checked = selectedSurvivorIds.has(s.id);
            return (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                  checked ? "border-gold/50 bg-surface" : "border-surface2 bg-surface/50"
                } ${s.eliminated ? "opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSurvivor(s.id)}
                  className="h-4 w-4 shrink-0"
                />
                <SurvivorAvatar name={s.name} photoUrl={s.photo_url} className="h-10 w-10" />
                <span className="text-sm">
                  {s.name}
                  {s.eliminated && <span className="ml-2 text-[10px] text-rust">Eliminated</span>}
                </span>
              </label>
            );
          })}
        </div>

        <p className="mt-8 font-display text-lg">What</p>
        <div className="mt-2 space-y-4">
          {groupedEventTypes.map(([category, types]) => (
            <div key={category}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">{category}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {types.map((t) => {
                  const checked = selectedEventTypeIds.has(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                        checked
                          ? "border-gold/50 bg-surface text-parchment"
                          : "border-surface2 bg-surface/50 text-muted"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEventType(t.id)}
                        className="h-4 w-4"
                      />
                      {t.name} ({t.point_value > 0 ? "+" : ""}
                      {t.point_value})
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={submitting || selectedSurvivorIds.size === 0 || selectedEventTypeIds.size === 0}
            className="rounded-md bg-ember px-5 py-2 font-medium text-jungle hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? "Logging…" : "Log event(s)"}
          </button>
          {eventCount > 0 && (
            <span className="text-sm text-muted">
              This will log {eventCount} event{eventCount > 1 ? "s" : ""} (
              {selectedSurvivorIds.size} survivor{selectedSurvivorIds.size > 1 ? "s" : ""} ×{" "}
              {selectedEventTypeIds.size} event type{selectedEventTypeIds.size > 1 ? "s" : ""}).
            </span>
          )}
        </div>
      </form>
      {error && <p className="mt-3 text-sm text-rust">{error}</p>}

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Events this episode</h2>
          {events.length > 0 && (
            <button onClick={clearAllEvents} className="text-xs text-rust hover:underline">
              Clear all events
            </button>
          )}
        </div>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing logged yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-surface2">
            {events.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between py-3">
                <span className="text-sm">
                  <span className="text-parchment">{ev.survivors?.name}</span>
                  <span className="text-muted"> — {ev.event_types?.name} </span>
                  <span className="text-ember">
                    ({ev.point_value > 0 ? "+" : ""}
                    {ev.point_value})
                  </span>
                </span>
                <button
                  onClick={() => undoEvent(ev.id)}
                  className="text-xs text-muted hover:text-rust"
                >
                  Undo
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
