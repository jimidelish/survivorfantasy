"use client";

import { useEffect, useState } from "react";
import { AppUser, Episode, Season, Survivor, ADVANTAGE_TYPES, LOCAL_STORAGE_KEY } from "@/lib/types";
import CsvUpload from "@/components/CsvUpload";

type Tab = "setup" | "control" | "eventTypes" | "updateSurvivors";

interface UserPicksGroup {
  user_id: string;
  user_name: string;
  picks: { survivor_name: string; multiplier: number }[];
}

export default function AdminPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<Tab>("setup");

  useEffect(() => {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) setUser(JSON.parse(raw));
    setChecked(true);
  }, []);

  if (!checked) return null;

  if (!user?.is_admin) {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold">Admins only</h1>
        <p className="mt-2 text-sm text-muted">
          You need an admin account to view this page. In the Supabase SQL editor, run:{" "}
          <code className="text-gold">
            update users set is_admin = true where name = &apos;{user?.name ?? "your name"}&apos;;
          </code>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Admin</h1>

      <div className="mt-6 flex gap-2">
        {[
          { id: "setup", label: "Season Setup" },
          { id: "control", label: "Season Control" },
          { id: "eventTypes", label: "Event Type Setup" },
          { id: "updateSurvivors", label: "Update Survivors" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              tab === t.id
                ? "bg-ember text-jungle"
                : "border border-surface2 text-parchment hover:border-gold/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "setup" && <SeasonSetupTab />}
        {tab === "control" && <SeasonControlTab />}
        {tab === "eventTypes" && <EventTypeSetupTab />}
        {tab === "updateSurvivors" && <UpdateSurvivorsTab />}
      </div>
    </div>
  );
}

function SeasonSetupTab() {
  return (
    <div>
      <p className="text-sm text-muted">
        Upload a survivor roster CSV named <code className="text-gold">survivors_s&#123;season&#125;.csv</code>{" "}
        (e.g. <code className="text-gold">survivors_s51.csv</code>). This creates the season if it
        doesn&apos;t exist yet, and fully replaces that season&apos;s survivor roster — existing picks
        and events tied to that season&apos;s current survivors will be deleted. Other seasons are
        never touched.
      </p>
      <div className="mt-6">
        <CsvUpload
          title="Survivors"
          description="Headers: name, photo_url, original_tribe"
          expectedPattern="survivors_s{season}.csv — e.g. survivors_s51.csv"
          confirmLabel="I understand this deletes the existing roster (and any picks/events tied to it) for this season, and replaces it with this file."
          onUpload={async (filename, csv, confirm) => {
            const res = await fetch("/api/admin/survivors-csv", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename, csv, confirm }),
            });
            const data = await res.json();
            if (!res.ok) return { ok: false, message: data.error || "Upload failed." };
            return {
              ok: true,
              message: `Loaded ${data.survivorsInserted} survivor(s) into Season ${data.season.number}.`,
            };
          }}
        />
      </div>
    </div>
  );
}

function EventTypeSetupTab() {
  return (
    <div>
      <p className="text-sm text-muted">
        Upload a scoring CSV named <code className="text-gold">event_types_s&#123;season&#125;.csv</code>{" "}
        (e.g. <code className="text-gold">event_types_s51.csv</code>). Event types are global, not
        tied to a season — the season number in the filename is just for your own record-keeping.
        Every currently active event type is deactivated, then every row in this file is added or
        updated (matched by category + name) as the new active set. Already-logged events keep
        their original point value regardless.
      </p>
      <div className="mt-6">
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
            return {
              ok: true,
              message: `${data.eventTypesActive} event type(s) are now active (labeled for Season ${data.seasonLabel}).`,
            };
          }}
        />
      </div>
    </div>
  );
}

function SeasonControlTab() {
  const [season, setSeason] = useState<Season | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);

  const [newNumber, setNewNumber] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const [picksEpisodeId, setPicksEpisodeId] = useState("");
  const [picksGroups, setPicksGroups] = useState<UserPicksGroup[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);

  function refresh() {
    Promise.all([
      fetch("/api/seasons/current").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/episodes").then((r) => r.json()),
    ]).then(([s, eps]) => {
      setSeason(s);
      setEpisodes(eps);
      if (!picksEpisodeId && eps[0]) setPicksEpisodeId(eps[0].id);
      setLoading(false);
    });
  }

  useEffect(refresh, []);

  useEffect(() => {
    if (!picksEpisodeId) return;
    setPicksLoading(true);
    fetch(`/api/admin/picks?episode_id=${picksEpisodeId}`)
      .then((r) => r.json())
      .then(setPicksGroups)
      .finally(() => setPicksLoading(false));
  }, [picksEpisodeId]);

  async function addEpisode(e: React.FormEvent) {
    e.preventDefault();
    if (!newNumber) return;
    await fetch("/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: Number(newNumber), title: newTitle || null }),
    });
    setNewNumber("");
    setNewTitle("");
    refresh();
  }

  async function setActive(episodeId: string) {
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_current: true }),
    });
    refresh();
  }

  async function toggleLock(episode: Episode) {
    await fetch(`/api/episodes/${episode.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: !episode.locked }),
    });
    refresh();
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div>
      <p className="text-sm text-muted">
        Managing episodes for{" "}
        <span className="text-gold">
          {season ? `Season ${season.number}${season.name ? ` — ${season.name}` : ""}` : "—"}
        </span>
        . The active episode is what My Picks and Enter Events default to.
      </p>

      <form onSubmit={addEpisode} className="mt-6 flex flex-wrap gap-2">
        <input
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          placeholder="Episode #"
          type="number"
          className="w-28 rounded-md border border-surface2 bg-surface px-3 py-2 text-sm"
        />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Title (optional)"
          className="flex-1 rounded-md border border-surface2 bg-surface px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-jungle hover:opacity-90"
        >
          Add episode
        </button>
      </form>

      <ul className="mt-6 divide-y divide-surface2">
        {episodes.map((ep) => (
          <li key={ep.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span>
              Episode {ep.number}
              {ep.title ? ` — ${ep.title}` : ""}
              {ep.is_current && <span className="ml-2 text-xs text-gold">active</span>}
              {ep.locked && <span className="ml-2 text-xs text-rust">locked</span>}
            </span>
            <div className="flex gap-2">
              {!ep.is_current && (
                <button
                  onClick={() => setActive(ep.id)}
                  className="rounded-full border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-gold/10"
                >
                  Set active
                </button>
              )}
              <button
                onClick={() => toggleLock(ep)}
                className="rounded-full border border-surface2 px-3 py-1 text-xs text-muted hover:border-gold/50"
              >
                {ep.locked ? "Unlock picks" : "Lock picks"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-10 rope-divider" />

      <h2 className="mt-8 font-display text-xl font-semibold">Picks by user</h2>
      <select
        value={picksEpisodeId}
        onChange={(e) => setPicksEpisodeId(e.target.value)}
        className="mt-3 rounded-md border border-surface2 bg-surface px-3 py-2 text-sm"
      >
        {episodes.map((ep) => (
          <option key={ep.id} value={ep.id}>
            Episode {ep.number}
            {ep.title ? ` — ${ep.title}` : ""}
          </option>
        ))}
      </select>

      {picksLoading ? (
        <p className="mt-4 text-sm text-muted">Loading picks…</p>
      ) : picksGroups.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No picks submitted for this episode yet.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {picksGroups.map((g) => (
            <li key={g.user_id} className="rounded-md border border-surface2 bg-surface px-4 py-3">
              <p className="font-display">{g.user_name}</p>
              <p className="mt-1 text-sm text-muted">
                {g.picks.map((p) => `${p.survivor_name} (${p.multiplier}×)`).join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UpdateSurvivorsTab() {
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    fetch("/api/survivors")
      .then((r) => r.json())
      .then(setSurvivors)
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function updateSurvivor(
    id: string,
    update: { eliminated?: boolean; shot_in_the_dark?: boolean; current_tribe?: string | null }
  ) {
    await fetch(`/api/admin/survivors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    refresh();
  }

  async function addAdvantage(survivorId: string, type: string) {
    await fetch("/api/admin/advantages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survivor_id: survivorId, type }),
    });
    refresh();
  }

  async function setAdvantageStatus(advantageId: string, status: "active" | "used") {
    await fetch(`/api/admin/advantages/${advantageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    refresh();
  }

  async function removeAdvantage(advantageId: string) {
    await fetch(`/api/admin/advantages/${advantageId}`, { method: "DELETE" });
    refresh();
  }

  if (loading) return <p className="text-sm text-muted">Loading survivors…</p>;

  return (
    <div>
      <p className="text-sm text-muted">
        Update elimination status, Shot in the Dark availability, current tribe, and advantages
        for this season&apos;s survivors. Changes apply immediately — no separate save step.
      </p>
      <div className="mt-6 space-y-3">
        {survivors.map((s) => (
          <SurvivorRow
            key={s.id}
            survivor={s}
            onUpdate={(update) => updateSurvivor(s.id, update)}
            onAddAdvantage={(type) => addAdvantage(s.id, type)}
            onSetAdvantageStatus={setAdvantageStatus}
            onRemoveAdvantage={removeAdvantage}
          />
        ))}
      </div>
    </div>
  );
}

function SurvivorRow({
  survivor,
  onUpdate,
  onAddAdvantage,
  onSetAdvantageStatus,
  onRemoveAdvantage,
}: {
  survivor: Survivor;
  onUpdate: (update: {
    eliminated?: boolean;
    shot_in_the_dark?: boolean;
    current_tribe?: string | null;
  }) => void;
  onAddAdvantage: (type: string) => void;
  onSetAdvantageStatus: (advantageId: string, status: "active" | "used") => void;
  onRemoveAdvantage: (advantageId: string) => void;
}) {
  const [tribe, setTribe] = useState(survivor.current_tribe || "");
  const [newAdvantageType, setNewAdvantageType] = useState<string>(ADVANTAGE_TYPES[0]);

  useEffect(() => {
    setTribe(survivor.current_tribe || "");
  }, [survivor.current_tribe]);

  const tribeDirty = tribe !== (survivor.current_tribe || "");

  return (
    <div
      className={`rounded-md border px-4 py-4 ${
        survivor.eliminated ? "border-surface2 bg-surface/30 opacity-60" : "border-surface2 bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg">
          {survivor.name}
          {survivor.eliminated && <span className="ml-2 text-xs font-normal text-rust">Eliminated</span>}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={survivor.eliminated}
              onChange={(e) => onUpdate({ eliminated: e.target.checked })}
            />
            Eliminated
          </label>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input
              type="checkbox"
              checked={survivor.shot_in_the_dark}
              onChange={(e) => onUpdate({ shot_in_the_dark: e.target.checked })}
            />
            Shot in the Dark available
          </label>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted">Current tribe:</label>
        <input
          value={tribe}
          onChange={(e) => setTribe(e.target.value)}
          className="rounded-md border border-surface2 bg-surface2 px-2 py-1 text-sm"
        />
        {tribeDirty && (
          <button
            onClick={() => onUpdate({ current_tribe: tribe || null })}
            className="rounded-full bg-ember px-3 py-1 text-xs font-medium text-jungle hover:opacity-90"
          >
            Save
          </button>
        )}
      </div>

      <div className="mt-3">
        <p className="text-xs text-muted">Advantages</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(survivor.advantages || []).map((a) => (
            <span
              key={a.id}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
                a.status === "active" ? "border-gold/40 text-gold" : "border-surface2 text-muted line-through"
              }`}
            >
              {a.type}
              {a.status === "active" && (
                <button
                  type="button"
                  onClick={() => onSetAdvantageStatus(a.id, "used")}
                  className="no-underline hover:text-parchment"
                  title="Mark used"
                >
                  ✓
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemoveAdvantage(a.id)}
                className="no-underline hover:text-rust"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
          {(survivor.advantages || []).length === 0 && (
            <span className="text-[11px] text-muted">None</span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select
            value={newAdvantageType}
            onChange={(e) => setNewAdvantageType(e.target.value)}
            className="rounded-md border border-surface2 bg-surface2 px-2 py-1 text-xs"
          >
            {ADVANTAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onAddAdvantage(newAdvantageType)}
            className="rounded-full border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-gold/10"
          >
            Add advantage
          </button>
        </div>
      </div>
    </div>
  );
}
