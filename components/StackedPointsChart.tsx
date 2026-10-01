"use client";

import {
  BarChart,
  Bar,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface EpisodeMeta {
  id: string;
  number: number;
  title: string | null;
}

interface SeriesEntry {
  id: string;
  name: string;
  eliminated?: boolean;
  eliminatedEpisodeNumber?: number | null;
  points: Record<string, number>;
}

// A palette that stays inside the app's jungle/ember/gold theme rather than
// defaulting to a generic chart library rainbow.
const PALETTE = [
  "#E2622A", // ember
  "#C9A24C", // gold
  "#6B8F71", // muted green
  "#8F3B2E", // rust
  "#D9A066", // warm sand
  "#4E6B5C", // deep moss
  "#B5854A", // bronze
  "#7A9E99", // teal-grey
  "#A85C32", // burnt clay
  "#5C7A5A", // olive
];

// A legend entry for an episode that isn't the active filter, so the
// clicked-on episode visibly stands out from the rest once filtered.
const INACTIVE_LEGEND_COLOR = "#3A463D";

// Darkens a #rrggbb color by the given fraction (0-1) — used so eliminated
// survivors' bars read as a dimmer version of each episode's own color,
// rather than losing the episode color-coding entirely.
function darken(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  const toHex = (v: number) =>
    Math.round(v * f)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function StackedPointsChart({
  episodes,
  series,
  emptyLabel,
  activeEpisodeId = null,
  onEpisodeToggle,
}: {
  episodes: EpisodeMeta[];
  series: SeriesEntry[];
  emptyLabel: string;
  // Non-null filters the chart down to a single episode's scores — clicking
  // that episode's legend entry again (handled by the caller) clears it.
  activeEpisodeId?: string | null;
  onEpisodeToggle?: (episodeId: string) => void;
}) {
  if (episodes.length === 0 || series.length === 0) {
    return <p className="mt-6 text-sm text-muted">{emptyLabel}</p>;
  }

  // The legend always lists every episode (so any of them can be clicked to
  // filter), but the bars themselves only render the active one when a
  // filter is set — otherwise the full stack.
  const barEpisodes = activeEpisodeId
    ? episodes.filter((ep) => ep.id === activeEpisodeId)
    : episodes;

  const colorForEpisode = (ep: EpisodeMeta) => {
    const i = episodes.findIndex((e) => e.id === ep.id);
    return PALETTE[i % PALETTE.length];
  };

  const data = series.map((s) => {
    const row: Record<string, string | number | boolean | null> = {
      name: s.name,
      eliminated: !!s.eliminated,
      eliminatedEpisodeNumber: s.eliminatedEpisodeNumber ?? null,
      total: 0,
    };
    let total = 0;
    for (const ep of barEpisodes) {
      const value = s.points[ep.id] || 0;
      row[`ep_${ep.number}`] = value;
      total += value;
    }
    row.total = total;
    return row;
  });

  // Renders the total followed by, for eliminated survivors, an " Out Ep N"
  // note in the same rust color the Scores page list uses for it — a plain
  // LabelList can only paint its whole string one color, so this builds the
  // two-tone label by hand from the data row matching this bar (via index).
  function totalLabel(props: {
    x?: string | number;
    y?: string | number;
    width?: string | number;
    height?: string | number;
    index?: number;
  }) {
    const { x = 0, y = 0, width = 0, height = 0, index } = props;
    if (index === undefined) return null;
    const entry = data[index];
    const cx = Number(x) + Number(width) + 6;
    const cy = Number(y) + Number(height) / 2;
    return (
      <text x={cx} y={cy} dominantBaseline="middle" fontSize={12}>
        <tspan fill="#EDE6D2">{entry.total}</tspan>
        {entry.eliminated && entry.eliminatedEpisodeNumber ? (
          <tspan fill="#8F3B2E"> • Out Ep {entry.eliminatedEpisodeNumber}</tspan>
        ) : null}
      </text>
    );
  }

  // Horizontal bars need a row's worth of height per entry rather than a
  // fixed height — with ~20 survivors, a fixed h-96 would cram them
  // illegibly.
  const chartHeight = Math.max(320, data.length * 36 + 60);

  const legendPayload = episodes.map((ep) => ({
    value: `Ep ${ep.number}`,
    type: "square" as const,
    id: ep.id,
    dataKey: `ep_${ep.number}`,
    color:
      activeEpisodeId && activeEpisodeId !== ep.id
        ? INACTIVE_LEGEND_COLOR
        : colorForEpisode(ep),
  }));

  return (
    <div className="mt-6 w-full" style={{ height: chartHeight }}>
      <p className="mb-2 text-xs text-muted">
        Click an episode in the legend below to filter the chart to just that episode — click it
        again to go back to the full season.
      </p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 90, left: 0, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2A362E" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#8FA294", fontSize: 12 }}
            axisLine={{ stroke: "#2A362E" }}
            tickLine={false}
          />
          <YAxis
            dataKey="name"
            type="category"
            width={110}
            tick={{ fill: "#8FA294", fontSize: 12 }}
            axisLine={{ stroke: "#2A362E" }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#212B24",
              border: "1px solid #2A362E",
              borderRadius: 6,
              color: "#EDE6D2",
            }}
            labelStyle={{ color: "#C9A24C" }}
          />
          <Legend
            payload={legendPayload}
            wrapperStyle={{ fontSize: 12, color: "#8FA294", cursor: "pointer" }}
            onClick={(entry) => {
              const id = (entry as { id?: string }).id;
              if (id && onEpisodeToggle) onEpisodeToggle(id);
            }}
          />
          {barEpisodes.map((ep, i) => {
            const baseColor = colorForEpisode(ep);
            const isLast = i === barEpisodes.length - 1;
            return (
              <Bar
                key={ep.id}
                dataKey={`ep_${ep.number}`}
                name={`Ep ${ep.number}`}
                stackId="a"
                fill={baseColor}
                radius={isLast ? [0, 3, 3, 0] : undefined}
              >
                {isLast && <LabelList dataKey="total" content={totalLabel} />}
                {data.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.eliminated ? darken(baseColor, 0.45) : baseColor}
                  />
                ))}
              </Bar>
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
