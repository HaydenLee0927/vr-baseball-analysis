import { useState } from 'react';
import { ko } from '../../i18n/ko';
import { inkOn, seqColor, zoneShapes, zoneValue, type PitchRec, type ZoneMetric } from '../../lib/charts';
import { formatStat } from '../../lib/format';
import { ChartCard, useDark, useTooltip } from './ChartCard';

const U = 56; // px per grid unit
const MIN_N = 3; // cells with a smaller sample are shown empty
const METRICS: ZoneMetric[] = ['share', 'swing', 'whiff', 'avg'];

const fmt = (v: number | null, m: ZoneMetric) => (v === null ? '–' : m === 'avg' ? formatStat(v, 'avg') : `${Math.round(v * 100)}%`);

/** Strike zone (catcher's view) split into 9 cells plus 4 outside quadrants, shaded by a chosen metric. */
export function ZoneChart({ rows }: { rows: PitchRec[] }) {
  const [metric, setMetric] = useState<ZoneMetric>('share');
  const dark = useDark();
  const tip = useTooltip();
  const zoned = rows.filter((r) => r.zone !== null);
  const cells = zoneShapes().map((s) => ({ ...s, ...zoneValue(zoned.filter((r) => r.zone === s.zone), zoned.length, metric) }));
  const maxShare = Math.max(0.0001, ...cells.map((c) => (metric === 'share' ? (c.value ?? 0) : 0)));
  const scale = (v: number) => (metric === 'share' ? v / maxShare : metric === 'avg' ? Math.min(1, v / 0.6) : v);

  return (
    <ChartCard
      title={ko.charts.zone}
      guide="zone"
      table={{
        headers: [ko.charts.zone, ko.charts.zoneMetrics[metric], ko.charts.sample],
        rows: cells.map((c) => [ko.charts.zoneLabel(c.zone), fmt(c.value, metric), c.n]),
      }}
      controls={
        <label className="inline">
          {ko.charts.metric}{' '}
          <select value={metric} onChange={(e) => setMetric(e.target.value as ZoneMetric)}>
            {METRICS.map((m) => (
              <option key={m} value={m}>{ko.charts.zoneMetrics[m]}</option>
            ))}
          </select>
        </label>
      }
    >
      {!zoned.length ? (
        <p className="muted">{ko.charts.none}</p>
      ) : (
        <div className="viz zone" ref={tip.box}>
          <svg viewBox={`-2 -2 ${5 * U + 4} ${5 * U + 4}`} role="img" aria-label={`${ko.charts.zone} (${ko.charts.zoneMetrics[metric]})`}>
            {cells.map((c) => {
              const ok = c.value !== null && c.n >= MIN_N;
              const color = ok ? seqColor(scale(c.value!), dark) : 'var(--viz-field)';
              const lines = [`${ko.charts.zoneLabel(c.zone)} · ${fmt(c.value, metric)}`, ko.charts.sampleN(c.n)];
              return (
                <g key={c.zone} {...tip.mark(lines)}>
                  <polygon points={c.points.map(([x, y]) => `${x * U},${y * U}`).join(' ')} fill={color} className="viz-cell" />
                  <text x={c.label[0] * U} y={c.label[1] * U} className="viz-label" fill={ok ? inkOn(color) : 'var(--muted)'}>
                    {ok ? fmt(c.value, metric) : '–'}
                  </text>
                </g>
              );
            })}
            <rect x={U} y={U} width={3 * U} height={3 * U} className="viz-zone-edge" />
          </svg>
          {tip.element}
          <p className="muted small">
            {ko.charts.catcherView} · {ko.charts.pitchesShown(zoned.length)}
          </p>
        </div>
      )}
    </ChartCard>
  );
}
