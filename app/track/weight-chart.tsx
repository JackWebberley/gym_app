import type { TrendPoint } from "@/lib/body";
import { formatDayKey } from "@/lib/day";

/// The chart the spec asks for: raw readings as faint dots, the trailing average
/// as the line (spec §6). Seeing the scatter sit around a steadily falling line
/// is the point — a chart of the raw figure alone looks like failure every other
/// morning, and a chart of the average alone hides how noisy the input is.
///
/// Hand-rolled SVG rather than a charting library. It is a polyline and some
/// circles, and the Worker has a 3MiB bundle ceiling to respect.

const WIDTH = 320;
const HEIGHT = 132;
const PAD = { top: 10, right: 8, bottom: 20, left: 36 };

/// A cut moves the average by grams a day. Without a floor on the range, a
/// steady week would be drawn as dramatic peaks and troughs across the full
/// height of the chart.
const MIN_SPAN_KG = 1.5;

export function WeightChart({ series }: { series: TrendPoint[] }) {
  // Start the axis at the first thing ever logged: ninety days of blank chart
  // with four dots in the corner reads as broken rather than as new.
  const firstLogged = series.findIndex((p) => p.weightKg != null);
  const points = firstLogged < 0 ? [] : series.slice(Math.max(0, firstLogged - 1));

  const values = points.flatMap((p) =>
    [p.weightKg, p.averageKg].filter((v): v is number => v != null),
  );

  if (points.length < 2 || values.length === 0) return null;

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const mid = (rawMin + rawMax) / 2;
  const span = Math.max(rawMax - rawMin, MIN_SPAN_KG);
  // A little headroom so the line never runs along the very edge.
  const min = mid - span / 2 - span * 0.12;
  const max = mid + span / 2 + span * 0.12;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * plotHeight;

  // Broken into runs so a fortnight away from the scales is drawn as a gap
  // rather than as a straight line through data that does not exist.
  const runs: string[] = [];
  let run: string[] = [];
  points.forEach((p, i) => {
    if (p.averageKg == null) {
      if (run.length > 1) runs.push(run.join(" "));
      run = [];
      return;
    }
    run.push(`${x(i).toFixed(1)},${y(p.averageKg).toFixed(1)}`);
  });
  if (run.length > 1) runs.push(run.join(" "));

  const gridValues = [max - (max - min) * 0.12, mid, min + (max - min) * 0.12];
  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={`Bodyweight over ${points.length} days, from ${formatDayKey(firstDate)} to ${formatDayKey(lastDate)}.`}
        className="overflow-visible"
      >
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke="var(--border-hairline)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 6}
              y={y(value) + 3}
              textAnchor="end"
              fill="var(--text-faint)"
              className="font-mono"
              style={{ fontSize: "9px" }}
            >
              {value.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Raw readings, faint and behind: the noise the average is smoothing. */}
        {points.map((p, i) =>
          p.weightKg == null ? null : (
            <circle
              key={p.date}
              cx={x(i)}
              cy={y(p.weightKg)}
              r="1.7"
              fill="var(--text-faint)"
              opacity="0.55"
            />
          ),
        )}

        {runs.map((run) => (
          <polyline
            key={run.slice(0, 24)}
            points={run}
            fill="none"
            stroke="var(--surface-accent)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        <text
          x={PAD.left}
          y={HEIGHT - 6}
          fill="var(--text-faint)"
          className="font-mono"
          style={{ fontSize: "9px" }}
        >
          {shortDate(firstDate)}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 6}
          textAnchor="end"
          fill="var(--text-faint)"
          className="font-mono"
          style={{ fontSize: "9px" }}
        >
          {shortDate(lastDate)}
        </text>
      </svg>
      <figcaption className="mt-2 flex items-center gap-4 text-micro tracking-wide text-fg-faint">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-pill bg-accent" />
          7-day average
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-fg-faint opacity-55" />
          each morning
        </span>
      </figcaption>
    </figure>
  );
}

function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
