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

type Tab = "control" | "updateSurvivors" | "assignTribes";

interface UserPicksGroup {
  user_id: string;
  user_name: string;
  picks: { survivor_name: string; multiplier: number }[];
}

export default function AdminPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<Tab>("control");

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
          { id: "control", label: "Season Control" },
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
        {tab === "control" && <SeasonControlTab />}
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
          description="Headers: name, photo_url"
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

function SeasonControlTab() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);

  const [newNumber, setNewNumber] = useState("");
  const [newTitle, setNewTitle] = useState("");

  const [picksEpisodeId, setPicksEpisodeId] = useState("");
  const [picksGroups, setPicksGroups] = useState<UserPicksGroup[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);

  const [winnerPickStats, setWinnerPickStats] = useState<{ total: number; picked: number } | null>(
    null
  );

  useEffect(() => {
    fetch("/api/seasons")
      .then((r) => r.json())
      .then((list: Season[]) => {
        setSeasons(list);
        if (list[0]) setSelectedSeasonId(list[0].id);
        else setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedSeasonId) return;
    fetch(`/api/admin/winner-picks-count?season_id=${selectedSeasonId}`)
      .then((r) => r.json())
      .then(setWinnerPickStats);
  }, [selectedSeasonId]);

  function refreshEpisodes() {
    if (!selectedSeasonId) return;
    setLoading(true);
    fetch(`/api/episodes?season_id=${selectedSeasonId}`)
      .then((r) => r.json())
      .then((eps) => {
        setEpisodes(eps);
        setPicksEpisodeId(eps[0]?.id || "");
      })
      .finally(() => setLoading(false));
  }

  useEffect(refreshEpisodes, [selectedSeasonId]);

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
    if (!newNumber || !selectedSeasonId) return;
    await fetch("/api/episodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        season_id: selectedSeasonId,
        number: Number(newNumber),
        title: newTitle || null,
      }),
    });
    setNewNumber("");
    setNewTitle("");
    refreshEpisodes();
  }

  async function setActive(episodeId: string) {
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_current: true }),
    });
    refreshEpisodes();
  }

  async function toggleLock(episode: Episode) {
    await fetch(`/api/episodes/${episode.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: !episode.locked }),
    });
    refreshEpisodes();
  }

  async function deleteEpisode(episode: Episode) {
    const label = `Episode ${episode.number}${episode.title ? ` — ${episode.title}` : ""}`;
    const confirmed = window.confirm(
      `Delete ${label}? This permanently deletes every pick and logged event for this episode, and reverses ` +
        `anything those events automatically changed (eliminated status, advantages, vote status). This cannot be undone.`
    );
    if (!confirmed) return;
    await fetch(`/api/episodes/${episode.id}`, { method: "DELETE" });
    refreshEpisodes();
  }

  async function toggleWinnerPicksLock() {
    if (!selectedSeason) return;
    const res = await fetch(`/api/admin/seasons/${selectedSeason.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner_picks_locked: !selectedSeason.winner_picks_locked }),
    });
    const updated = await res.json();
    if (!res.ok) return;
    setSeasons((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  // The list is sorted newest-first by the API, so the first entry is
  // always "current" (highest number) — same definition the rest of the
  // app uses (see lib/currentSeason.ts), just computed client-side here to
  // avoid a second fetch.
  const currentSeasonNumber = seasons[0]?.number;
  const selectedSeason = seasons.find((s) => s.id === selectedSeasonId);

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div>
      <label className="text-sm text-muted">Season:</label>{" "}
      <select
        value={selectedSeasonId}
        onChange={(e) => setSelectedSeasonId(e.target.value)}
        className="rounded-md border border-surface2 bg-surface px-3 py-2 text-sm"
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            Season {s.number}
            {s.name ? ` — ${s.name}` : ""}
            {s.number === currentSeasonNumber ? " (current)" : ""}
          </option>
        ))}
      </select>
      <p className="mt-3 text-sm text-muted">
        The active episode is what My Picks and Episode Events default to — only for whichever
        season is actually current ({currentSeasonNumber ?? "—"}), regardless of which one you're
        managing here.
      </p>

      {selectedSeason && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={toggleWinnerPicksLock}
            className={`rounded-full px-4 py-1.5 text-xs font-medium ${
              selectedSeason.winner_picks_locked
                ? "border border-rust/50 text-rust hover:bg-rust/10"
                : "border border-gold/50 text-gold hover:bg-gold/10"
            }`}
          >
            {selectedSeason.winner_picks_locked ? "Unlock winner picks" : "Lock winner picks"}
          </button>
          <span className="text-xs text-muted">
            {selectedSeason.winner_picks_locked
              ? "No one can set or change their winner pick for this season."
              : "Players can still set or change their winner pick for this season."}
          </span>
        </div>
      )}
      {winnerPickStats && (
        <p className="mt-2 text-xs text-gold">
          {winnerPickStats.picked}/{winnerPickStats.total} winner picks locked in!
        </p>
      )}

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
              <button
                onClick={() => deleteEpisode(ep)}
                className="rounded-full border border-rust/50 px-3 py-1 text-xs text-rust hover:bg-rust/10"
              >
                Delete
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

      <div className="mt-10 rope-divider" />

      <h2 className="mt-8 font-display text-xl font-semibold">Season Setup</h2>
      <p className="mt-2 text-xs text-muted">
        Uploads to whichever season number is in the file name — not necessarily the one selected
        above.
      </p>
      <SeasonSetupTab />
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
    update: { eliminated?: boolean; has_vote?: boolean; current_tribe_id?: string | null }
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

  async function removeTribeHistoryEntry(historyId: string) {
    const res = await fetch(`/api/admin/tribe-history/${historyId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Couldn't delete that entry.");
      return;
    }
    refresh();
  }

  if (loading) return <p className="text-sm text-muted">Loading survivors…</p>;

  return (
    <div>
      <p className="text-sm text-muted">
        Update elimination status, current tribe, and advantages (including Shot in the Dark,
        now granted/used like any other advantage) for this season&apos;s survivors. Changes
        apply immediately — no separate save step.
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
            onRemoveTribeHistoryEntry={removeTribeHistoryEntry}
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
  onRemoveTribeHistoryEntry,
}: {
  survivor: Survivor;
  tribes: Tribe[];
  onUpdate: (update: {
    eliminated?: boolean;
    has_vote?: boolean;
    current_tribe_id?: string | null;
  }) => void;
  onAddAdvantage: (type: string) => void;
  onSetAdvantageStatus: (advantageId: string, status: "active" | "used") => void;
  onRemoveAdvantage: (advantageId: string) => void;
  onRemoveTribeHistoryEntry: (historyId: string) => void;
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
          {survivor.is_host && <span className="ml-2 text-xs font-normal text-gold">Host</span>}
          {survivor.eliminated && <span className="ml-2 text-xs font-normal text-rust">Eliminated</span>}
        </p>
        {!survivor.is_host && (
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
                checked={survivor.has_vote}
                onChange={(e) => onUpdate({ has_vote: e.target.checked })}
              />
              Can vote
            </label>
          </div>
        )}
      </div>

      {!survivor.is_host && (
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
      )}

      {!survivor.is_host && survivor.tribe_history && survivor.tribe_history.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
          {survivor.tribe_history.map((h, i, arr) => {
            const isCurrent = i === arr.length - 1;
            return (
              <span key={h.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted/40">→</span>}
                <span className={isCurrent ? "text-muted" : "text-muted/50 line-through"}>
                  {h.tribe_name}
                </span>
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => onRemoveTribeHistoryEntry(h.id)}
                    className="text-muted hover:text-rust"
                    title={`Delete "${h.tribe_name}" from tribe history`}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

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

  // Dragging only stages a change locally — nothing is saved (and no
  // tribe-history entry created) until "Save changes" is confirmed, so
  // trial-and-error dragging doesn't clutter every touched survivor's
  // history with intermediate moves.
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, string | null>>({});
  const [savingAssignments, setSavingAssignments] = useState(false);

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

  function stageAssignment(survivorId: string, tribeId: string | null) {
    const survivor = survivors.find((s) => s.id === survivorId);
    setPendingAssignments((prev) => {
      const next = { ...prev };
      // If this matches their last-saved tribe, it's not actually a
      // pending change (e.g. dragged away and back) — drop it rather than
      // counting/showing a no-op change.
      if (survivor && tribeId === survivor.current_tribe_id) {
        delete next[survivorId];
      } else {
        next[survivorId] = tribeId;
      }
      return next;
    });
  }

  function handleDrop(e: React.DragEvent, tribeId: string | null) {
    e.preventDefault();
    setDragOverKey(null);
    const survivorId = e.dataTransfer.getData("text/plain");
    if (survivorId) stageAssignment(survivorId, tribeId);
  }

  function discardAssignments() {
    setPendingAssignments({});
  }

  async function saveAssignments() {
    const entries = Object.entries(pendingAssignments);
    if (entries.length === 0) return;
    const confirmed = window.confirm(
      `Save ${entries.length} tribe assignment${entries.length > 1 ? "s" : ""}? This adds a new ` +
        `tribe-history entry for each survivor whose tribe actually changed.`
    );
    if (!confirmed) return;

    setSavingAssignments(true);
    await Promise.all(
      entries.map(([survivorId, tribeId]) =>
        fetch(`/api/admin/survivors/${survivorId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_tribe_id: tribeId }),
        })
      )
    );
    setSavingAssignments(false);
    setPendingAssignments({});
    refresh();
  }

  if (loading) return <p className="text-sm text-muted">Loading…</p>;

  // The host (e.g. Jeff Probst) is never tribe-assigned — exclude him
  // entirely rather than showing him stuck in "Unassigned."
  const tribeEligible = survivors.filter((s) => !s.is_host);
  // Reflects the staged (not-yet-saved) state, so a drag visibly moves a
  // chip between columns immediately even though nothing's persisted yet.
  const effectiveTribeId = (s: Survivor) =>
    s.id in pendingAssignments ? pendingAssignments[s.id] : s.current_tribe_id;
  const unassigned = tribeEligible.filter((s) => !effectiveTribeId(s));
  const pendingSurvivorIds = new Set(Object.keys(pendingAssignments));
  const pendingCount = pendingSurvivorIds.size;

  return (
    <div>
      <p className="text-sm text-muted">
        Add tribes for this season — starting tribes, swap tribes, or the merge — then drag
        survivors between columns to assign them. Deleting a tribe unassigns its members back to
        &quot;No tribe&quot; rather than removing them from the season. Dragging only stages a
        change — nothing saves (or gets added to anyone&apos;s tribe history) until you click Save
        changes.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className={`text-xs ${pendingCount > 0 ? "text-gold" : "text-muted"}`}>
          {savingAssignments
            ? "Saving…"
            : pendingCount > 0
            ? `${pendingCount} unsaved assignment${pendingCount > 1 ? "s" : ""}`
            : "No unsaved assignments"}
        </span>
        {pendingCount > 0 && (
          <>
            <button
              type="button"
              onClick={saveAssignments}
              disabled={savingAssignments}
              className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-jungle hover:opacity-90 disabled:opacity-40"
            >
              {savingAssignments ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={discardAssignments}
              disabled={savingAssignments}
              className="text-xs text-muted hover:text-rust disabled:opacity-40"
            >
              Discard
            </button>
          </>
        )}
      </div>

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
          pendingSurvivorIds={pendingSurvivorIds}
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
            survivors={tribeEligible.filter((s) => effectiveTribeId(s) === t.id)}
            pendingSurvivorIds={pendingSurvivorIds}
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
  pendingSurvivorIds,
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
  pendingSurvivorIds: Set<string>;
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
          <SurvivorChip key={s.id} survivor={s} isPending={pendingSurvivorIds.has(s.id)} />
        ))}
        {survivors.length === 0 && <p className="text-xs text-muted">Drag survivors here</p>}
      </div>
    </div>
  );
}

function SurvivorChip({ survivor, isPending }: { survivor: Survivor; isPending: boolean }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", survivor.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`cursor-grab rounded-md border px-3 py-1.5 text-sm active:cursor-grabbing ${
        isPending ? "border-gold bg-gold/10" : "border-surface2 bg-surface2"
      } ${survivor.eliminated ? "opacity-50" : ""}`}
    >
      {survivor.name}
      {survivor.eliminated && <span className="ml-2 text-[10px] text-rust">Eliminated</span>}
      {isPending && <span className="ml-2 text-[10px] text-gold">unsaved</span>}
    </div>
  );
}
