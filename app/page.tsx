"use client";

import { useEffect, useState } from "react";
import { LeaderboardRow, Season } from "@/lib/types";

export default function HomePage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/seasons/current").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/standings").then((r) => r.json()),
    ])
      .then(([s, standings]) => {
        setSeason(s);
        setRows(standings);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <p className="text-sm text-gold">
        {season ? `Season ${season.number}${season.name ? ` — ${season.name}` : ""}` : "Welcome"}
      </p>
      <h1 className="mt-2 font-display text-4xl font-semibold leading-tight sm:text-5xl">
        Outwit, outplay, out-draft.
      </h1>
      <p className="mt-4 max-w-lg text-muted">
        This is the spoiler-free landing page — just season standings, nothing about who
        scored what this week. Head to Scores for the full episode-by-episode breakdown.
      </p>

      <div className="mt-12">
        <h2 className="font-display text-2xl font-semibold">Season standings</h2>
        <div className="mt-4 rope-divider" />

        {loading ? (
          <p className="mt-6 text-sm text-muted">Tallying votes…</p>
        ) : rows.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            No scores yet. Once events are logged for an episode, standings will show up here.
          </p>
        ) : (
          <ol className="mt-6 space-y-1">
            {rows.map((row, i) => (
              <li key={row.user_id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-4">
                  <span
                    className={`w-8 text-right font-display text-2xl font-semibold ${
                      i === 0 ? "text-gold" : "text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-lg">{row.name}</span>
                </div>
                <span className="font-display text-xl text-ember">{row.total_points}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
