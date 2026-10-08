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
import SurvivorAvatar from "@/components/SurvivorAvatar";
import UserPicksList, { UserPicksGroup } from "@/components/UserPicksList";

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

  const [winnerPickSurvivorId, setWinnerPickSurvivorId] = useState<string | null>(null);
  const [winnerPickDraft, setWinnerPickDraft] = useState<string>("");
  const [winnerPicksLocked, setWinnerPicksLocked] = useState(false);
  const [savingWinnerPick, setSavingWinnerPick] = useState(false);
  const [winnerPickError, setWinnerPickError] = useState<string | null>(null);

  const [sortBy, setSortBy] = useState<"alphabetical" | "average" | "total">("alphabetical");

  const [allPicks, setAllPicks] = useState<UserPicksGroup[]>([]);

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
    fetch(`/api/winner-pick?user_id=${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        setWinnerPickSurvivorId(data.survivor_id || null);
        setWinnerPickDraft(data.survivor_id || "");
        setWinnerPicksLocked(!!data.locked);
      });
  }, [user]);

  async function saveWinnerPick() {
    if (!user || !winnerPickDraft) return;
    setSavingWinnerPick(true);
    setWinnerPickError(null);
    const res = await fetch("/api/winner-pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id, survivor_id: winnerPickDraft }),
    });
    const data = await res.json();
    setSavingWinnerPick(false);
    if (!res.ok) {
      setWinnerPickError(data.error || "Something went wrong.");
      return;
    }
    setWinnerPickSurvivorId(data.survivor_id);
  }

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

  // Handicap-only: lets a struggling player see everyone else's picks for
  // the episode before locking in their own, as an opt-in disadvantage
  // offset — see is_handicap in schema.sql.
  useEffect(() => {
    if (!user?.is_handicap || !episodeId) {
      setAllPicks([]);
      return;
    }
    fetch(`/api/picks/all?episode_id=${episodeId}`)
      .then((r) => r.json())
      .then(setAllPicks);
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

  // Groups survivors before applying the chosen sort within each group —
  // active survivors first, then the host (who has no stats to rank by),
  // then eliminated survivors last, matching the ordering rule set when
  // the host was added to the roster.
  function groupRank(s: Survivor) {
    if (s.eliminated) return 2;
    if (s.is_host) return 1;
    return 0;
  }

  const sortedSurvivors = useMemo(() => {
    const arr = [...survivors];
    arr.sort((a, b) => {
      const rankDiff = groupRank(a) - groupRank(b);
      if (rankDiff !== 0) return rankDiff;
      if (sortBy === "alphabetical") return a.name.localeCompare(b.name);
      const statsA = survivorStats.get(a.id);
      const statsB = survivorStats.get(b.id);
      const valA = sortBy === "average" ? statsA?.average ?? 0 : statsA?.total ?? 0;
      const valB = sortBy === "average" ? statsB?.average ?? 0 : statsB?.total ?? 0;
      if (valB !== valA) return valB - valA;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [survivors, survivorStats, sortBy]);

  // New winner-pick selections exclude eliminated/host survivors, but an
  // *existing* pick must stay selectable even after they're eliminated —
  // the pick itself stays valid and keeps scoring, only new choices are
  // restricted.
  const winnerPickOptions = useMemo(() => {
    const eligible = survivors.filter((s) => !s.eliminated && !s.is_host);
    const current = survivors.find((s) => s.id === winnerPickSurvivorId);
    if (current && !eligible.some((s) => s.id === current.id)) {
      return [current, ...eligible];
    }
    return eligible;
  }, [survivors, winnerPickSurvivorId]);

  const winnerPickSurvivor = survivors.find((s) => s.id === winnerPickSurvivorId);
  const winnerPickDraftSurvivor = survivors.find((s) => s.id === winnerPickDraft);

  // Other players' picks for the currently selected episode (self excluded)
  // — only populated when the signed-in user is a handicap account.
  const otherUserPicks = useMemo(
    () => allPicks.filter((g) => g.user_id !== user?.id),
    [allPicks, user]
  );

  // survivor id -> who else picked them, for the per-card indicator.
  const otherPicksBySurvivor = useMemo(() => {
    const map = new Map<string, { user_name: string; multiplier: number }[]>();
    for (const group of otherUserPicks) {
      for (const p of group.picks) {
        const list = map.get(p.survivor_id) || [];
        list.push({ user_name: group.user_name, multiplier: p.multiplier });
        map.set(p.survivor_id, list);
      }
    }
    return map;
  }, [otherUserPicks]);

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

      <div className="mt-6 rounded-md border border-surface2 bg-surface px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg">Winner pick</span>
          {winnerPicksLocked && (
            <span className="rounded-full bg-rust/20 px-3 py-1 text-xs text-rust">Locked</span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
          One survivor for the whole season — worth +1× their points every episode on top of
          your weekly picks, even after they're eliminated. Doesn&apos;t use any of your weekly
          budget.
        </p>
        {winnerPicksLocked ? (
          <div className="mt-3 flex items-center gap-3">
            {winnerPickSurvivor && (
              <SurvivorAvatar
                name={winnerPickSurvivor.name}
                photoUrl={winnerPickSurvivor.photo_url}
                className="h-12 w-12"
              />
            )}
            <p className="text-sm text-parchment">
              {winnerPickSurvivor?.name || "You didn't lock one in."}
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {winnerPickDraftSurvivor && (
              <SurvivorAvatar
                name={winnerPickDraftSurvivor.name}
                photoUrl={winnerPickDraftSurvivor.photo_url}
                className="h-12 w-12"
              />
            )}
            <select
              value={winnerPickDraft}
              onChange={(e) => setWinnerPickDraft(e.target.value)}
              className="rounded-md border border-surface2 bg-surface2 px-3 py-2 text-sm"
            >
              <option value="">No pick yet</option>
              {winnerPickOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.eliminated ? " (eliminated)" : ""}
                </option>
              ))}
            </select>
            {winnerPickDraft && winnerPickDraft !== (winnerPickSurvivorId || "") && (
              <button
                type="button"
                onClick={saveWinnerPick}
                disabled={savingWinnerPick}
                className="rounded-md bg-ember px-4 py-2 text-sm font-medium text-jungle hover:opacity-90 disabled:opacity-40"
              >
                {savingWinnerPick ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        )}
        {winnerPickError && <p className="mt-2 text-sm text-rust">{winnerPickError}</p>}
      </div>

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
              {ep.is_current ? " (current)" : ""}
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

      {user.is_handicap && (
        <div className="mt-6 rounded-md border border-gold/30 bg-surface px-5 py-4">
          <span className="font-display text-lg">Other players&apos; picks</span>
          <p className="mt-1 text-xs text-muted">
            You can see everyone else&apos;s picks for this episode before locking in your own.
          </p>
          <UserPicksList
            groups={otherUserPicks}
            emptyMessage="No one else has made picks for this episode yet."
          />
        </div>
      )}

      {budget && (
        <div className="sticky top-2 z-20 mt-8 rounded-md border border-surface2 bg-surface px-5 py-4 shadow-lg shadow-black/40">
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

      <div className="mt-6 flex items-center justify-end gap-2">
        <label className="text-xs text-muted" htmlFor="sort-by">
          Sort by:
        </label>
        <select
          id="sort-by"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-md border border-surface2 bg-surface px-3 py-1.5 text-sm"
        >
          <option value="alphabetical">Alphabetical</option>
          <option value="average">Average score</option>
          <option value="total">Total score</option>
        </select>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {sortedSurvivors.map((s) => {
          const multiplier = picks[s.id] || 0;
          const stats = survivorStats.get(s.id);
          const activeAdvantages = (s.advantages || []).filter((a) => a.status === "active");
          const canIncrease =
            multiplier < MAX_MULTIPLIER_PER_SURVIVOR && remaining > 0;

          return (
            <div
              key={s.id}
              className={`rounded-md border px-4 py-4 transition-colors ${
                s.eliminated
                  ? "border-surface2 bg-surface/20 opacity-50"
                  : multiplier > 0
                  ? "border-gold bg-gold/10 ring-1 ring-gold/40"
                  : "border-surface2 bg-surface/50"
              }`}
              style={
                s.current_tribe
                  ? { borderLeftColor: s.current_tribe.color, borderLeftWidth: "4px" }
                  : undefined
              }
            >
              <div className="flex items-start gap-4">
                <SurvivorAvatar name={s.name} photoUrl={s.photo_url} className="h-20 w-20 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg">
                        {s.name}
                        {s.is_host && (
                          <span className="ml-2 text-xs font-normal text-gold">Host</span>
                        )}
                        {s.eliminated && (
                          <span className="ml-2 text-xs font-normal text-rust">Eliminated</span>
                        )}
                      </p>
                      {!s.is_host && (
                        <p className="text-xs text-muted">
                          {s.tribe_history && s.tribe_history.length > 0 ? (
                            s.tribe_history.map((h, i, arr) => (
                              <span key={h.id}>
                                {i > 0 && <span className="mx-1 text-muted/40">→</span>}
                                <span
                                  className={i < arr.length - 1 ? "text-muted/50 line-through" : ""}
                                >
                                  {h.tribe_name}
                                </span>
                              </span>
                            ))
                          ) : (
                            "No tribe"
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
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
                      {s.id === winnerPickSurvivorId && (
                        <span className="whitespace-nowrap text-[10px] text-gold">
                          Winner pick! (+1)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    <span>Points: {stats?.total ?? 0}</span>
                    <span>Avg: {stats ? stats.average.toFixed(1) : "0.0"}</span>
                    {!s.is_host && (
                      <span className={s.has_vote ? "text-muted" : "text-rust"}>
                        {s.has_vote ? "Can vote" : "No vote"}
                      </span>
                    )}
                  </div>

                  {user.is_handicap && otherPicksBySurvivor.has(s.id) && (
                    <p className="mt-2 text-[11px] text-gold">
                      Picked by{" "}
                      {otherPicksBySurvivor
                        .get(s.id)!
                        .map((p) =>
                          p.multiplier > 1 ? `${p.user_name} (${p.multiplier})` : p.user_name
                        )
                        .join(", ")}
                    </p>
                  )}

                  {!s.is_host && (
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
                  )}
                </div>
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
