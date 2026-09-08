"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppUser,
  Episode,
  Survivor,
  LOCAL_STORAGE_KEY,
  MAX_MULTIPLIER_PER_SURVIVOR,
  ADVANTAGE_COLORS,
} from "@/lib/types";

interface Budget {
  base: number;
  bonus: number;
  budget: number;
  leaderPoints: number;
  userPoints: number;
  previousEpisodeNumber: number | null;
}

interface SurvivorStatsResponse {
  episodes: { id: string; number: number; title: string | null }[];
  series: { id: string; points: Record<string, number> }[];
}

export default function PicksPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodeId, setEpisodeId] = useState<string>("");
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [statsData, setStatsData] = useState<SurvivorStatsResponse>({ episodes: [], series: [] });
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [savedPicks, setSavedPicks] = useState<Record<string, number>>({});
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
    Promise.all([
      fetch("/api/episodes").then((r) => r.json()),
      fetch("/api/survivors").then((r) => r.json()),
      fetch("/api/points?by=survivor").then((r) => r.json()),
    ]).then(([eps, survs, stats]) => {
      setEpisodes(eps);
      setSurvivors(survs);
      setStatsData(stats);
      const activeEpisode = eps.find((e: Episode) => e.is_current) || eps.find((e: Episode) => !e.locked);
      setEpisodeId(activeEpisode ? activeEpisode.id : eps[eps.length - 1]?.id || "");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user || !episodeId) return;
    fetch(`/api/picks?user_id=${user.id}&episode_id=${episodeId}`)
      .then((r) => r.json())
      .then((data) => {
        const next: Record<string, number> = {};
        for (const p of data) next[p.survivor_id] = p.multiplier;
        setPicks(next);
        setSavedPicks(next);
      });
    fetch(`/api/picks/budget?user_id=${user.id}&episode_id=${episodeId}`)
      .then((r) => r.json())
      .then(setBudget);
  }, [user, episodeId]);

  const currentEpisode = episodes.find((e) => e.id === episodeId);

  // A survivor's season-to-date points and per-episode average, counted only
  // through episodes BEFORE the one currently being drafted for.
  const survivorStats = useMemo(() => {
    const stats = new Map<string, { total: number; average: number; playedCount: number }>();
    if (!currentEpisode) return stats;
    const priorEpisodes = statsData.episodes.filter((e) => e.number < currentEpisode.number);
    for (const s of statsData.series) {
      let total = 0;
      for (const ep of priorEpisodes) total += s.points[ep.id] || 0;
      const playedCount = priorEpisodes.length;
      stats.set(s.id, {
        total,
        average: playedCount > 0 ? total / playedCount : 0,
        playedCount,
      });
    }
    return stats;
  }, [statsData, currentEpisode]);

  const totalUsed = useMemo(
    () => Object.values(picks).reduce((sum, m) => sum + m, 0),
    [picks]
  );
  const remaining = budget ? budget.budget - totalUsed : 0;

  const isDirty = useMemo(() => {
    const keys = Object.keys(picks);
    const savedKeys = Object.keys(savedPicks);
    if (keys.length !== savedKeys.length) return true;
    return keys.some((id) => picks[id] !== savedPicks[id]);
  }, [picks, savedPicks]);

  function adjust(survivorId: string, delta: number) {
    const current = picks[survivorId] || 0;
    const next = current + delta;
    if (next < 0 || next > MAX_MULTIPLIER_PER_SURVIVOR) return;
    if (delta > 0 && remaining <= 0) return;
    setPicks((prev) => {
      const copy = { ...prev };
      if (next === 0) delete copy[survivorId];
      else copy[survivorId] = next;
      return copy;
    });
  }

  async function submit() {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const body = {
      user_id: user.id,
      episode_id: episodeId,
      picks: Object.entries(picks).map(([survivor_id, multiplier]) => ({
        survivor_id,
        multiplier,
      })),
    };
    const res = await fetch("/api/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    setMessage("Picks saved.");
    setSavedPicks(picks);
  }

  if (loading) return <p className="text-sm text-muted">Loading roster…</p>;
  if (!user) return null;

  // Eliminated survivors are kept in the list (greyed out, sorted last) rather
  // than removed, so a player can still see who's out. `/api/survivors`
  // already orders eliminated last, so no re-sort is needed here.

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Your picks</h1>
      <p className="mt-2 text-sm text-muted">
        Assign your multiplier budget across any number of survivors — up to{" "}
        {MAX_MULTIPLIER_PER_SURVIVOR}× on any one survivor.
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
              {ep.locked ? " (locked)" : ""}
            </option>
          ))}
        </select>
        {currentEpisode?.locked && (
          <span className="rounded-full bg-rust/20 px-3 py-1 text-xs text-rust">
            Picks are locked for this episode
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className={`text-xs ${isDirty ? "text-gold" : "text-muted"}`}>
            {saving ? "Saving…" : isDirty ? "Unsaved changes" : "Saved"}
          </span>
          <button
            onClick={submit}
            disabled={saving || !isDirty || !budget || totalUsed !== budget.budget || currentEpisode?.locked}
            className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-jungle transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save picks"}
          </button>
        </div>
      </div>

      {budget && (
        <div className="mt-8 rounded-md border border-surface2 bg-surface px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">
              {Object.keys(picks).length} survivor(s) selected
            </span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted">
                {totalUsed}/{budget.budget} multiplier points used
              </span>
              {Object.keys(picks).length > 0 && !currentEpisode?.locked && (
                <button
                  type="button"
                  onClick={() => setPicks({})}
                  className="text-xs text-rust hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            {Array.from({ length: budget.budget }).map((_, i) => (
              <span key={i} className={`pip ${i < totalUsed ? "filled" : ""}`} />
            ))}
          </div>
          {budget.bonus > 0 && (
            <p className="mt-3 text-xs text-gold">
              +{budget.bonus} bonus multiplier{budget.bonus > 1 ? "s" : ""} — you trailed the
              leader by {budget.leaderPoints - budget.userPoints} points after episode{" "}
              {budget.previousEpisodeNumber}.
            </p>
          )}
          {Object.keys(picks).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(picks).map(([survivorId, multiplier]) => {
                const survivor = survivors.find((s) => s.id === survivorId);
                if (!survivor) return null;
                const canIncrease =
                  multiplier < MAX_MULTIPLIER_PER_SURVIVOR && remaining > 0;
                return (
                  <div
                    key={survivorId}
                    className="flex items-center gap-2 rounded-full border border-gold/40 bg-surface2 px-3 py-1.5"
                  >
                    <span className="text-sm">{survivor.name}</span>
                    <button
                      type="button"
                      onClick={() => adjust(survivorId, -1)}
                      disabled={currentEpisode?.locked}
                      className="h-5 w-5 rounded-full border border-surface2 text-xs disabled:opacity-30"
                      aria-label={`Decrease ${survivor.name} multiplier`}
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-xs font-display text-ember">
                      {multiplier}×
                    </span>
                    <button
                      type="button"
                      onClick={() => adjust(survivorId, 1)}
                      disabled={!canIncrease || currentEpisode?.locked}
                      className="h-5 w-5 rounded-full border border-surface2 text-xs disabled:opacity-30"
                      aria-label={`Increase ${survivor.name} multiplier`}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-8 rope-divider" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {survivors.map((s) => {
          const multiplier = picks[s.id] || 0;
          const stats = survivorStats.get(s.id);
          const activeAdvantages = (s.advantages || []).filter((a) => a.status === "active");
          const canIncrease =
            multiplier < MAX_MULTIPLIER_PER_SURVIVOR && remaining > 0;

          return (
            <div
              key={s.id}
              className={`rounded-md border px-4 py-4 ${
                s.eliminated
                  ? "border-surface2 bg-surface/20 opacity-50"
                  : multiplier > 0
                  ? "border-gold/50 bg-surface"
                  : "border-surface2 bg-surface/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <SurvivorAvatar name={s.name} photoUrl={s.photo_url} />
                  <div>
                    <p className="font-display text-lg">
                      {s.name}
                      {s.eliminated && (
                        <span className="ml-2 text-xs font-normal text-rust">Eliminated</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {s.current_tribe || "No tribe"}
                      {s.original_tribe && s.original_tribe !== s.current_tribe
                        ? ` (orig. ${s.original_tribe})`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjust(s.id, -1)}
                    disabled={s.eliminated || multiplier === 0 || currentEpisode?.locked}
                    className="h-7 w-7 rounded-full border border-surface2 text-sm disabled:opacity-30"
                    aria-label={`Decrease ${s.name} multiplier`}
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-display text-ember">
                    {multiplier > 0 ? `${multiplier}×` : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => adjust(s.id, 1)}
                    disabled={s.eliminated || !canIncrease || currentEpisode?.locked}
                    className="h-7 w-7 rounded-full border border-surface2 text-sm disabled:opacity-30"
                    aria-label={`Increase ${s.name} multiplier`}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>Points: {stats?.total ?? 0}</span>
                <span>Avg: {stats ? stats.average.toFixed(1) : "0.0"}</span>
                <span
                  className={
                    s.shot_in_the_dark ? "text-gold" : "text-muted/50 line-through"
                  }
                >
                  {s.shot_in_the_dark ? "Shot in the Dark: available" : "Shot in the Dark: used"}
                </span>
                <span className={s.has_vote ? "text-muted" : "text-rust"}>
                  {s.has_vote ? "Can vote" : "No vote"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {activeAdvantages.length > 0 ? (
                  activeAdvantages.map((a) => (
                    <span
                      key={a.id}
                      className="rounded-full border px-2 py-0.5 text-[11px]"
                      style={{
                        borderColor: `${ADVANTAGE_COLORS[a.type]}66`,
                        color: ADVANTAGE_COLORS[a.type],
                      }}
                    >
                      {a.type}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-muted">No advantages held</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={submit}
          disabled={saving || !isDirty || !budget || totalUsed !== budget.budget || currentEpisode?.locked}
          className="rounded-md bg-ember px-6 py-3 font-medium text-jungle transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save picks"}
        </button>
        {budget && remaining !== 0 && (
          <span className="text-sm text-muted">
            {remaining > 0
              ? `${remaining} point(s) left to assign`
              : `${-remaining} point(s) over budget`}
          </span>
        )}
      </div>

      {message && <p className="mt-4 text-sm text-gold">{message}</p>}
      {error && <p className="mt-4 text-sm text-rust">{error}</p>}
    </div>
  );
}

// Tracks load failure in React state (not by mutating the DOM node directly),
// so once a photo fails to load, it reliably stays as the fallback avatar
// even when the page re-renders for unrelated reasons (e.g. clicking +/-).
function SurvivorAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!photoUrl || failed) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-surface2 bg-surface2 font-display text-lg text-muted">
        {name.charAt(0)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl}
      alt={name}
      referrerPolicy="no-referrer"
      className="h-14 w-14 shrink-0 rounded-full border border-surface2 object-cover"
      onError={() => setFailed(true)}
    />
  );
}
