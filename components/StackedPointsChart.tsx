"use client";

import {
  BarChart,
  Bar,
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

export default function StackedPointsChart({
  episodes,
  series,
  emptyLabel,
}: {
  episodes: EpisodeMeta[];
  series: SeriesEntry[];
  emptyLabel: string;
}) {
  if (episodes.length === 0 || series.length === 0) {
    return <p className="mt-6 text-sm text-muted">{emptyLabel}</p>;
  }

  const data = series.map((s) => {
    const row: Record<string, string | number> = { name: s.name };
    for (const ep of episodes) {
      row[`ep_${ep.number}`] = s.points[ep.id] || 0;
    }
    return row;
  });

  // Horizontal bars need a row's worth of height per entry rather than a
  // fixed height — with ~20 survivors, a fixed h-96 would cram them
  // illegibly.
  const chartHeight = Math.max(320, data.length * 36 + 60);

  return (
    <div className="mt-6 w-full" style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
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
          <Legend wrapperStyle={{ fontSize: 12, color: "#8FA294" }} />
          {episodes.map((ep, i) => (
            <Bar
              key={ep.id}
              dataKey={`ep_${ep.number}`}
              name={`Ep ${ep.number}`}
              stackId="a"
              fill={PALETTE[i % PALETTE.length]}
              radius={i === episodes.length - 1 ? [0, 3, 3, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
