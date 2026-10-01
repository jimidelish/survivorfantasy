"use client";

import { useEffect, useState } from "react";
import StackedPointsChart from "@/components/StackedPointsChart";

interface EpisodeMeta {
  id: string;
  number: number;
  title: string | null;
  is_current?: boolean;
}
interface SeriesEntry {
  id: string;
  name: string;
  eliminated?: boolean;
  eliminatedEpisodeNumber?: number | null;
  points: Record<string, number>;
}
interface PointsResponse {
  episodes: EpisodeMeta[];
  series: SeriesEntry[];
}

export default function ScoresPage() {
  const [view, setView] = useState<"user" | "survivor">("user");
  const [scope, setScope] = useState<"overall" | "episode">("overall");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [data, setData] = useState<PointsResponse>({ episodes: [], series: [] });
  const [loading, setLoading] = useState(true);

  // The winner-pick bonus only affects player totals (it's a per-user bet on
  // a survivor), not survivor totals, so this toggle is only shown/applied
  // in the "By player" view — see schema.sql's user_episode_points vs
  // _with_winner_pick views.
  const [withWinnerPick, setWithWinnerPick] = useState(true);
  const [winnerPickStats, setWinnerPickStats] = useState<{ total: number; picked: number } | null>(
    null
  );

  useEffect(() => {
    fetch("/api/seasons/current")
      .then((r) => (r.ok ? r.json() : null))
      .then((season) => {
        if (!season) return;
        fetch(`/api/admin/winner-picks-count?season_id=${season.id}`)
          .then((r) => r.json())
          .then(setWinnerPickStats);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/points?by=${view}&with_winner_pick=${withWinnerPick}`)
      .then((r) => r.json())
      .then((result: PointsResponse) => {
        setData(result);
        setSelectedEpisodeId((prev) => {
          if (prev && result.episodes.some((ep) => ep.id === prev)) return prev;
          const active = result.episodes.find((ep) => ep.is_current);
          return active?.id || result.episodes[result.episodes.length - 1]?.id || "";
        });
      })
      .finally(() => setLoading(false));
  }, [view, withWinnerPick]);

  const totals = data.series
    .map((s) => ({
      ...s,
      total:
        scope === "episode"
          ? s.points[selectedEpisodeId] || 0
          : Object.values(s.points).reduce((sum, v) => sum + v, 0),
    }))
    .sort((a, b) => b.total - a.total);

  // Active-state styling uses parchment rather than the app's usual ember
  // accent specifically on this page — ember is also episode 1's bar color
  // in the chart below, so an ember-highlighted button next to an
  // ember-colored bar read as the same thing.
  function pillClass(active: boolean) {
    return `rounded-full px-4 py-1.5 text-sm ${
      active
        ? "bg-parchment text-jungle"
        : "border border-surface2 text-parchment hover:border-gold/50"
    }`;
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Scores</h1>
      <p className="mt-2 text-sm text-muted">
        {scope === "overall"
          ? "Full episode-by-episode breakdown — each bar is stacked by episode, so you can see both the season total and how it was built up week to week."
          : "Scores for a single episode."}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted">View:</span>
          <button onClick={() => setView("user")} className={pillClass(view === "user")}>
            By player
          </button>
          <button onClick={() => setView("survivor")} className={pillClass(view === "survivor")}>
            By survivor
          </button>
        </div>

        {winnerPickStats && (
          <span className="text-xs text-gold">
            {winnerPickStats.picked}/{winnerPickStats.total} winner picks locked in!
          </span>
        )}

        {view === "user" && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <span>Include winner pick bonus</span>
            <button
              type="button"
              role="switch"
              aria-checked={withWinnerPick}
              onClick={() => setWithWinnerPick((v) => !v)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                withWinnerPick ? "bg-gold" : "bg-surface2"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-jungle transition-transform ${
                  withWinnerPick ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
        )}
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-muted">Loading scores…</p>
      ) : (
        <>
          <StackedPointsChart
            episodes={data.episodes}
            series={totals}
            emptyLabel="No episodes logged yet this season."
            activeEpisodeId={scope === "episode" ? selectedEpisodeId : null}
            onEpisodeToggle={(episodeId) => {
              if (scope === "episode" && selectedEpisodeId === episodeId) {
                setScope("overall");
              } else {
                setScope("episode");
                setSelectedEpisodeId(episodeId);
              }
            }}
          />

          <div className="mt-10 rope-divider" />

          <ul className="mt-6 divide-y divide-surface2">
            {totals.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <span className={s.eliminated ? "text-muted" : "text-parchment"}>
                  {s.name}
                  {s.eliminated && s.eliminatedEpisodeNumber && (
                    <span className="ml-2 text-xs text-rust">
                      Out Ep {s.eliminatedEpisodeNumber}
                    </span>
                  )}
                </span>
                <span className="font-display text-lg text-ember">{s.total}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
