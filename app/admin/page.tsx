"use client";

import { useEffect, useState } from "react";
import {
  AppUser,
  Episode,
  Season,
  Survivor,
  Tribe,
  ADVANTAGE_TYPES,
  LOCAL_STORAGE_KEY,
} from "@/lib/types";
import CsvUpload from "@/components/CsvUpload";

type Tab = "setup" | "control" | "eventTypes" | "updateSurvivors" | "assignTribes";

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
          { id: "assignTribes", label: "Assign Tribes" },
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
        {tab === "assignTribes" && <AssignTribesTab />}
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
  const [tribes, setTribes] = useState<Tribe[]>([]);
  const [loading, setLoading] = useState(true);

  function refresh() {
    Promise.all([
      fetch("/api/survivors").then((r) => r.json()),
      fetch("/api/tribes").then((r) => r.json()),
    ]).then(([survs, tribeList]) => {
      setSurvivors(survs);
      setTribes(tribeList);
      setLoading(false);
    });
  }

  useEffect(refresh, []);

  async function updateSurvivor(
    id: string,
    update: { eliminated?: boolean; shot_in_the_dark?: boolean; current_tribe_id?: string | null }
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
            tribes={tribes}
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
  tribes,
  onUpdate,
  onAddAdvantage,
  onSetAdvantageStatus,
  onRemoveAdvantage,
}: {
  survivor: Survivor;
  tribes: Tribe[];
  onUpdate: (update: {
    eliminated?: boolean;
    shot_in_the_dark?: boolean;
    current_tribe_id?: string | null;
  }) => void;
  onAddAdvantage: (type: string) => void;
  onSetAdvantageStatus: (advantageId: string, status: "active" | "used") => void;
  onRemoveAdvantage: (advantageId: string) => void;
}) {
  const [newAdvantageType, setNewAdvantageType] = useState<string>(ADVANTAGE_TYPES[0]);

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
        <select
          value={survivor.current_tribe_id || ""}
          onChange={(e) => onUpdate({ current_tribe_id: e.target.value || null })}
          className="rounded-md border border-surface2 bg-surface2 px-2 py-1 text-sm"
        >
          <option value="">No tribe</option>
          {tribes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {survivor.current_tribe && (
          <span
            className="h-3 w-3 rounded-full border border-surface2"
            style={{ backgroundColor: survivor.current_tribe.color }}
            title={survivor.current_tribe.name}
          />
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

function AssignTribesTab() {
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [tribes, setTribes] = useState<Tribe[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTribeName, setNewTribeName] = useState("");
  const [newTribeColor, setNewTribeColor] = useState("#C9A24C");
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  function refresh() {
    Promise.all([
      fetch("/api/survivors").then((r) => r.json()),
      fetch("/api/tribes").then((r) => r.json()),
    ]).then(([survs, tribeList]) => {
      setSurvivors(survs);
      setTribes(tribeList);
      setLoading(false);
    });
  }

  useEffect(refresh, []);

  async function addTribe(e: React.FormEvent) {
    e.preventDefault();
    if (!newTribeName.trim()) return;
    await fetch("/api/admin/tribes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTribeName.trim(), color: newTribeColor }),
    });
    setNewTribeName("");
    refresh();
  }

  async function renameTribe(id: string, name: string) {
    await fetch(`/api/admin/tribes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    refresh();
  }

  async function recolorTribe(id: string, color: string) {
    await fetch(`/api/admin/tribes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    refresh();
  }

  async function deleteTribe(id: string) {
    await fetch(`/api/admin/tribes/${id}`, { method: "DELETE" });
    refresh();
  }

  async function assignSurvivor(survivorId: string, tribeId: string | null) {
    await fetch(`/api/admin/survivors/${survivorId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_tribe_id: tribeId }),
    });
    refresh();
  }

  function handleDrop(e: React.DragEvent, tribeId: string | null) {
    e.preventDefault();
    setDragOverKey(null);
    const survivorId = e.dataTransfer.getData("text/plain");
    if (survivorId) assignSurvivor(survivorId, tribeId);
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  const unassigned = survivors.filter((s) => !s.current_tribe_id);

  return (
    <div>
      <p className="text-sm text-muted">
        Add tribes for this season — starting tribes, swap tribes, or the merge — then drag
        survivors between columns to assign them. Deleting a tribe unassigns its members back to
        &quot;No tribe&quot; rather than removing them from the season.
      </p>

      <form onSubmit={addTribe} className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={newTribeName}
          onChange={(e) => setNewTribeName(e.target.value)}
          placeholder="Tribe name"
          className="rounded-md border border-surface2 bg-surface px-3 py-2 text-sm"
        />
        <input
          type="color"
          value={newTribeColor}
          onChange={(e) => setNewTribeColor(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-surface2 bg-surface"
          title="Tribe color"
        />
        <button
          type="submit"
          className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-jungle hover:opacity-90"
        >
          Add tribe
        </button>
      </form>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TribeColumn
          tribe={null}
          survivors={unassigned}
          isDragOver={dragOverKey === "unassigned"}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverKey("unassigned");
          }}
          onDragLeave={() => setDragOverKey(null)}
          onDrop={(e) => handleDrop(e, null)}
        />
        {tribes.map((t) => (
          <TribeColumn
            key={t.id}
            tribe={t}
            survivors={survivors.filter((s) => s.current_tribe_id === t.id)}
            isDragOver={dragOverKey === t.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverKey(t.id);
            }}
            onDragLeave={() => setDragOverKey(null)}
            onDrop={(e) => handleDrop(e, t.id)}
            onRename={(name) => renameTribe(t.id, name)}
            onRecolor={(color) => recolorTribe(t.id, color)}
            onDelete={() => deleteTribe(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function TribeColumn({
  tribe,
  survivors,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onRename,
  onRecolor,
  onDelete,
}: {
  tribe: Tribe | null;
  survivors: Survivor[];
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onRename?: (name: string) => void;
  onRecolor?: (color: string) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(tribe?.name || "");

  useEffect(() => {
    setName(tribe?.name || "");
  }, [tribe?.name]);

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-md border px-4 py-4 transition-colors ${
        isDragOver ? "border-gold bg-gold/5" : "border-surface2 bg-surface"
      }`}
      style={tribe ? { borderTopColor: tribe.color, borderTopWidth: "4px" } : undefined}
    >
      {tribe ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={tribe.color}
            onChange={(e) => onRecolor?.(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border border-surface2 bg-surface"
            title="Recolor tribe"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== tribe.name && onRename?.(name.trim())}
            className="flex-1 rounded-md border border-surface2 bg-surface2 px-2 py-1 text-sm font-display"
          />
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border border-rust/50 px-2 py-1 text-xs text-rust hover:bg-rust/10"
            title="Delete tribe"
          >
            Delete
          </button>
        </div>
      ) : (
        <p className="font-display text-lg text-muted">No tribe</p>
      )}

      <div className="mt-3 min-h-[3rem] space-y-1.5">
        {survivors.map((s) => (
          <SurvivorChip key={s.id} survivor={s} />
        ))}
        {survivors.length === 0 && <p className="text-xs text-muted">Drag survivors here</p>}
      </div>
    </div>
  );
}

function SurvivorChip({ survivor }: { survivor: Survivor }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", survivor.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`cursor-grab rounded-md border border-surface2 bg-surface2 px-3 py-1.5 text-sm active:cursor-grabbing ${
        survivor.eliminated ? "opacity-50" : ""
      }`}
    >
      {survivor.name}
      {survivor.eliminated && <span className="ml-2 text-[10px] text-rust">Eliminated</span>}
    </div>
  );
}
