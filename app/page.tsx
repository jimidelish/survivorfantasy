"use client";

import { useEffect, useState } from "react";
import { LeaderboardRow, Season } from "@/lib/types";
import SurvivorAvatar from "@/components/SurvivorAvatar";

interface WinnerPickRow {
  user_id: string;
  user_name: string;
  survivor_id: string;
  survivor_name: string;
  photo_url: string | null;
}

export default function HomePage() {
  const [season, setSeason] = useState<Season | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [winnerPicksRevealed, setWinnerPicksRevealed] = useState(false);
  const [winnerPicks, setWinnerPicks] = useState<WinnerPickRow[] | null>(null);
  const [winnerPicksLoading, setWinnerPicksLoading] = useState(false);

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

  function toggleWinnerPicks() {
    const next = !winnerPicksRevealed;
    setWinnerPicksRevealed(next);
    if (next && winnerPicks === null) {
      setWinnerPicksLoading(true);
      fetch("/api/winner-pick/all")
        .then((r) => r.json())
        .then(setWinnerPicks)
        .finally(() => setWinnerPicksLoading(false));
    }
  }

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

      <div className="mt-12">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold">Winner picks</h2>
          {season?.winner_picks_locked && (
            <button
              type="button"
              onClick={toggleWinnerPicks}
              className="shrink-0 rounded-full border border-gold/50 px-4 py-1.5 text-xs text-gold hover:bg-gold/10"
            >
              {winnerPicksRevealed ? "Hide" : "Show"} winner picks
            </button>
          )}
        </div>
        <div className="mt-4 rope-divider" />

        {!season?.winner_picks_locked ? (
          <p className="mt-6 text-sm text-muted">
            Winner picks haven&apos;t been locked in yet — they&apos;ll be revealed here once the
            admin locks them.
          </p>
        ) : !winnerPicksRevealed ? (
          <p className="mt-6 text-sm text-muted">
            Who everyone&apos;s betting on to take the season — hidden by default so it doesn&apos;t
            spoil anyone&apos;s strategy. Click above to reveal.
          </p>
        ) : winnerPicksLoading ? (
          <p className="mt-6 text-sm text-muted">Loading winner picks…</p>
        ) : !winnerPicks || winnerPicks.length === 0 ? (
          <p className="mt-6 text-sm text-muted">No one has locked in a winner pick yet.</p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {winnerPicks.map((p) => (
              <li
                key={p.user_id}
                className="flex items-center gap-3 rounded-md border border-surface2 bg-surface px-4 py-3"
              >
                <SurvivorAvatar name={p.survivor_name} photoUrl={p.photo_url} className="h-12 w-12" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-parchment">{p.user_name}</p>
                  <p className="truncate font-display text-lg text-gold">{p.survivor_name}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
