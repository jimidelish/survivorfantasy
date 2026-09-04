"use client";

import { useEffect, useState } from "react";
import StackedPointsChart from "@/components/StackedPointsChart";

interface EpisodeMeta {
  id: string;
  number: number;
  title: string | null;
}
interface SeriesEntry {
  id: string;
  name: string;
  eliminated?: boolean;
  points: Record<string, number>;
}
interface PointsResponse {
  episodes: EpisodeMeta[];
  series: SeriesEntry[];
}

export default function ScoresPage() {
  const [view, setView] = useState<"user" | "survivor">("user");
  const [data, setData] = useState<PointsResponse>({ episodes: [], series: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/points?by=${view}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [view]);

  const totals = data.series
    .map((s) => ({
      ...s,
      total: Object.values(s.points).reduce((sum, v) => sum + v, 0),
    }))
    .sort((a, b) => b.total - a.total);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Scores</h1>
      <p className="mt-2 text-sm text-muted">
        Full episode-by-episode breakdown — each bar is stacked by episode, so you can see
        both the season total and how it was built up week to week.
      </p>

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => setView("user")}
          className={`rounded-full px-4 py-1.5 text-sm ${
            view === "user"
              ? "bg-ember text-jungle"
              : "border border-surface2 text-parchment hover:border-gold/50"
          }`}
        >
          By player
        </button>
        <button
          onClick={() => setView("survivor")}
          className={`rounded-full px-4 py-1.5 text-sm ${
            view === "survivor"
              ? "bg-ember text-jungle"
              : "border border-surface2 text-parchment hover:border-gold/50"
          }`}
        >
          By survivor
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-muted">Loading scores…</p>
      ) : (
        <>
          <StackedPointsChart
            episodes={data.episodes}
            series={data.series}
            emptyLabel="No episodes logged yet this season."
          />

          <div className="mt-10 rope-divider" />

          <ul className="mt-6 divide-y divide-surface2">
            {totals.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <span className={s.eliminated ? "text-muted line-through" : "text-parchment"}>
                  {s.name}
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
