import { ko } from '../../i18n/ko';
import { SWINGS, type PitchRec } from '../../lib/charts';
import { formatStat } from '../../lib/format';
import { ChartCard, useTooltip } from './ChartCard';

const W = 360;
const H = 170;
const PAD = { l: 34, r: 8, t: 18, b: 30 };
const BAR = 24; // max column width

/** Column path with a 4px rounded top and a square base. */
function column(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function niceMax(v: number): number {
  const step = v <= 5 ? 1 : v <= 10 ? 2 : v <= 25 ? 5 : 10;
  return Math.max(step, Math.ceil(v / step) * step);
}

function Columns(props: { bars: { label: string; value: number; lines: string[]; top?: string }[]; max: number; ticks: number[]; fmt: (v: number) => string; aria: string }) {
  const tip = useTooltip();
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(1, props.bars.length);
  const w = Math.min(BAR, slot * 0.7);
  const y = (v: number) => PAD.t + ih - (v / props.max) * ih;
  return (
    <div className="viz small-chart" ref={tip.box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.aria}>
        {props.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="viz-grid" />
            <text x={PAD.l - 6} y={y(t)} className="viz-tick" textAnchor="end">{props.fmt(t)}</text>
          </g>
        ))}
        {props.bars.map((b, i) => {
          const x = PAD.l + slot * i + (slot - w) / 2;
          const h = Math.max(0, y(0) - y(b.value));
          return (
            <g key={b.label} {...tip.mark(b.lines)}>
              <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={ih} fill="transparent" />
              {h > 0 && <path d={column(x, y(b.value), w, h)} className="viz-bar" />}
              {b.top && <text x={x + w / 2} y={y(b.value) - 5} className="viz-value" textAnchor="middle">{b.top}</text>}
              <text x={x + w / 2} y={H - 10} className="viz-tick" textAnchor="middle">{b.label}</text>
            </g>
          );
        })}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className="viz-axis" />
      </svg>
      {tip.element}
    </div>
  );
}

function ByInning({ points }: { points: { inning: number; avg: number; n: number }[] }) {
  const tip = useTooltip();
  const lo = Math.floor(Math.min(...points.map((p) => p.avg)) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...points.map((p) => p.avg)) / 5) * 5 + 5;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <div className="viz small-chart" ref={tip.box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ko.charts.veloByInning}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="viz-grid" />
            <text x={PAD.l - 6} y={y(t)} className="viz-tick" textAnchor="end">{t}</text>
          </g>
        ))}
        <polyline points={points.map((p, i) => `${x(i)},${y(p.avg)}`).join(' ')} className="viz-trend" />
        {points.map((p, i) => (
          <g key={p.inning} {...tip.mark([`${formatStat(p.avg, 'dec1')} ${ko.charts.kmh}`, `${ko.charts.inning(p.inning)} · ${ko.charts.pitchesShown(p.n)}`])}>
            <circle cx={x(i)} cy={y(p.avg)} r={12} fill="transparent" />
            <circle cx={x(i)} cy={y(p.avg)} r={4} className="viz-point" />
            <text x={x(i)} y={H - 10} className="viz-tick" textAnchor="middle">{ko.charts.inning(p.inning)}</text>
          </g>
        ))}
      </svg>
      {tip.element}
    </div>
  );
}

/** Pitchers: velocity distribution and average by inning. Hitters: whiff rate by velocity band. */
export function VeloChart({ rows, role }: { rows: PitchRec[]; role: 'batting' | 'pitching' }) {
  const timed = rows.filter((r) => r.velo !== null);
  if (role === 'pitching') {
    const lo = Math.floor(Math.min(...timed.map((r) => r.velo!)) / 5) * 5;
    const hi = Math.floor(Math.max(...timed.map((r) => r.velo!)) / 5) * 5;
    const bins = [];
    for (let b = lo; b <= hi; b += 5) {
      const n = timed.filter((r) => r.velo! >= b && r.velo! < b + 5).length;
      bins.push({ label: String(b), value: n, lines: [ko.charts.pitchesShown(n), `${b}–${b + 4} ${ko.charts.kmh}`] });
    }
    const innings = [...new Set(timed.map((r) => r.inning))].sort((a, b) => a - b);
    const byInning = innings.map((i) => {
      const v = timed.filter((r) => r.inning === i).map((r) => r.velo!);
      return { inning: i, avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length };
    });
    const max = niceMax(Math.max(1, ...bins.map((b) => b.value)));
    return (
      <ChartCard
        title={ko.charts.veloTitle}
        guide="velo"
        table={{
          headers: [ko.charts.veloDist, ko.charts.sample],
          rows: [...bins.map((b) => [`${b.label}–${Number(b.label) + 4}`, b.value]), ...byInning.map((p) => [`${ko.charts.inning(p.inning)} ${ko.charts.veloByInning}`, formatStat(p.avg, 'dec1')])],
        }}
      >
        {!timed.length ? (
          <p className="muted">{ko.charts.none}</p>
        ) : (
          <>
            <h4>{ko.charts.veloDist} ({ko.charts.kmh})</h4>
            <Columns bars={bins} max={max} ticks={[0, max / 2, max]} fmt={(v) => String(v)} aria={ko.charts.veloDist} />
            {byInning.length > 1 && (
              <>
                <h4>{ko.charts.veloByInning}</h4>
                <ByInning points={byInning} />
              </>
            )}
          </>
        )}
      </ChartCard>
    );
  }

  const bands = [
    { key: 'lt100', lo: 0, hi: 100 },
    { key: '100', lo: 100, hi: 110 },
    { key: '110', lo: 110, hi: 120 },
    { key: '120', lo: 120, hi: Infinity },
  ].map((b) => {
    const swings = timed.filter((r) => r.velo! >= b.lo && r.velo! < b.hi && SWINGS.has(r.result));
    const whiffs = swings.filter((r) => r.result === 'swinging_strike').length;
    const value = swings.length ? whiffs / swings.length : 0;
    return { ...b, label: ko.charts.veloOptions[b.key], swings: swings.length, value, top: swings.length ? `${Math.round(value * 100)}%` : undefined };
  });
  const shown = bands.filter((b) => b.swings > 0);
  return (
    <ChartCard
      title={ko.charts.veloBand}
      guide="velo"
      table={{ headers: [ko.charts.velo, ko.charts.zoneMetrics.whiff, ko.charts.sample], rows: shown.map((b) => [b.label, `${Math.round(b.value * 100)}%`, b.swings]) }}
    >
      {!shown.length ? (
        <p className="muted">{ko.charts.none}</p>
      ) : (
        <Columns
          bars={shown.map((b) => ({ label: b.label, value: b.value, top: b.top, lines: [`${b.top} ${ko.charts.zoneMetrics.whiff}`, `${b.label} ${ko.charts.kmh} · ${ko.charts.swings(b.swings)}`] }))}
          max={1}
          ticks={[0, 0.5, 1]}
          fmt={(v) => `${Math.round(v * 100)}%`}
          aria={ko.charts.veloBand}
        />
      )}
    </ChartCard>
  );
}
