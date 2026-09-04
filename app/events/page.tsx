"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppUser,
  Episode,
  Survivor,
  EventType,
  SurvivorEvent,
  LOCAL_STORAGE_KEY,
} from "@/lib/types";

export default function EventsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [events, setEvents] = useState<SurvivorEvent[]>([]);

  const [episodeId, setEpisodeId] = useState("");
  const [survivorId, setSurvivorId] = useState("");
  const [eventTypeId, setEventTypeId] = useState("");
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
      fetch("/api/event-types").then((r) => r.json()),
    ]).then(([eps, survs, types]) => {
      setEpisodes(eps);
      setSurvivors(survs);
      setEventTypes(types);
      const activeEpisode = eps.find((e: Episode) => e.is_current) || eps[eps.length - 1];
      if (activeEpisode) setEpisodeId(activeEpisode.id);
      const activeSurvivors = survs.filter((s: Survivor) => !s.eliminated);
      if (activeSurvivors[0]) setSurvivorId(activeSurvivors[0].id);
      if (types[0]) setEventTypeId(types[0].id);
    });
  }, [user]);

  useEffect(() => {
    if (!episodeId) return;
    fetch(`/api/events?episode_id=${episodeId}`)
      .then((r) => r.json())
      .then(setEvents);
  }, [episodeId]);

  const currentEpisode = episodes.find((e) => e.id === episodeId);
  const activeSurvivors = survivors.filter((s) => !s.eliminated);

  const groupedEventTypes = useMemo(() => {
    const groups = new Map<string, EventType[]>();
    for (const t of eventTypes) {
      if (!groups.has(t.category)) groups.set(t.category, []);
      groups.get(t.category)!.push(t);
    }
    return Array.from(groups.entries());
  }, [eventTypes]);

  async function logEvent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!episodeId || !survivorId || !eventTypeId || !user) return;
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episode_id: episodeId,
        survivor_id: survivorId,
        event_type_id: eventTypeId,
        entered_by_user_id: user.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    setEvents((prev) => [data, ...prev]);
  }

  async function undoEvent(id: string) {
    await fetch(`/api/events?id=${id}`, { method: "DELETE" });
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
  }

  if (!user) return null;

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

      <form onSubmit={logEvent} className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <select
          value={survivorId}
          onChange={(e) => setSurvivorId(e.target.value)}
          className="rounded-md border border-surface2 bg-surface px-3 py-2 text-sm"
        >
          {activeSurvivors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={eventTypeId}
          onChange={(e) => setEventTypeId(e.target.value)}
          className="rounded-md border border-surface2 bg-surface px-3 py-2 text-sm"
        >
          {groupedEventTypes.map(([category, types]) => (
            <optgroup key={category} label={category}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.point_value > 0 ? "+" : ""}
                  {t.point_value})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-ember px-5 py-2 font-medium text-jungle hover:opacity-90"
        >
          Log event
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-rust">{error}</p>}

      <div className="mt-10">
        <h2 className="font-display text-xl font-semibold">Events this episode</h2>
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
