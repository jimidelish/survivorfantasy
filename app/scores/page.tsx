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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/points?by=${view}`)
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
  }, [view]);

  const chartEpisodes =
    scope === "episode"
      ? data.episodes.filter((ep) => ep.id === selectedEpisodeId)
      : data.episodes;

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

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button onClick={() => setScope("overall")} className={pillClass(scope === "overall")}>
          Overall
        </button>
        <span className="mx-1 h-5 w-px bg-surface2" />
        {data.episodes.map((ep) => (
          <button
            key={ep.id}
            onClick={() => {
              setScope("episode");
              setSelectedEpisodeId(ep.id);
            }}
            title={ep.title ?? undefined}
            className={pillClass(scope === "episode" && selectedEpisodeId === ep.id)}
          >
            Ep {ep.number}
            {ep.is_current && <span className="ml-1 text-gold">•</span>}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => setView("user")} className={pillClass(view === "user")}>
          By player
        </button>
        <button onClick={() => setView("survivor")} className={pillClass(view === "survivor")}>
          By survivor
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-muted">Loading scores…</p>
      ) : (
        <>
          <StackedPointsChart
            episodes={chartEpisodes}
            series={totals}
            emptyLabel="No episodes logged yet this season."
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
