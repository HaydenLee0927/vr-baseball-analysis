import { useState } from 'react';
import { ko } from '../../i18n/ko';
import { SWINGS, veloDomain, veloSeries, type PitchRec, type VeloMode, type VeloSeries } from '../../lib/charts';
import { formatStat } from '../../lib/format';
import type { League } from '../../lib/types';
import { useData } from '../../lib/useData';
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

const CURVE_H = 200;
const CURVE_PAD = { l: 12, r: 12, t: 22, b: 30 };
const DOT = 4;

/** One density curve per series, each scaled to the same peak height; small series as one dot per pitch. */
function Curves({ series, name, total }: { series: VeloSeries[]; name: (s: VeloSeries) => string; total: number }) {
  const tip = useTooltip();
  const [lo, hi] = veloDomain(series.flatMap((s) => s.velos));
  const iw = W - CURVE_PAD.l - CURVE_PAD.r;
  const base = CURVE_H - CURVE_PAD.b;
  const x = (v: number) => CURVE_PAD.l + ((v - lo) / (hi - lo)) * iw;
  const y = (t: number) => base - t * (base - CURVE_PAD.t);
  const step = hi - lo > 40 ? 10 : 5;
  const first = Math.ceil(lo / step) * step;
  const ticks = Array.from({ length: Math.floor((hi - first) / step) + 1 }, (_, i) => first + i * step);
  const color = (s: VeloSeries) => `var(--viz-s${s.color ?? '-none'})`;
  const share = (s: VeloSeries) => `${Math.round((s.velos.length / total) * 100)}%`;
  const lines = (s: VeloSeries) => {
    const avg = s.velos.reduce((a, b) => a + b, 0) / s.velos.length;
    return [name(s), `${ko.charts.pitchesN(s.velos.length)} · ${share(s)}`, ko.charts.veloAvgMax(formatStat(avg, 'dec1'), Math.max(...s.velos))];
  };
  // Direct labels at each curve's peak, skipped where they would overlap one already placed.
  const placed: number[] = [];
  const labels = series.flatMap((s) => {
    if (!s.curve) return [];
    const px = x(s.curve.reduce((m, p) => (p[1] > m[1] ? p : m))[0]);
    if (placed.some((p) => Math.abs(p - px) < 30)) return [];
    placed.push(px);
    return [{ key: s.key, x: px, text: s.codes.length === 1 && s.key === s.codes[0] ? s.key : name(s) }];
  });
  // Dots stack upward where pitches share a speed.
  const stack = new Map<number, number>();
  const dots = series.flatMap((s) =>
    s.curve
      ? []
      : s.velos.map((v, i) => {
          const k = Math.round(v);
          const level = stack.get(k) ?? 0;
          stack.set(k, level + 1);
          return { s, v, i, cy: base - DOT - 2 - level * (DOT * 2 + 2) };
        }),
  );
  return (
    <div className="viz small-chart" ref={tip.box}>
      <svg viewBox={`0 0 ${W} ${CURVE_H}`} role="img" aria-label={ko.charts.veloDist}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={CURVE_PAD.t} y2={base} className="viz-grid" />
            <text x={x(t)} y={CURVE_H - 10} className="viz-tick" textAnchor="middle">{t}</text>
          </g>
        ))}
        {series.map(
          (s) =>
            s.curve && (
              <g key={s.key} {...tip.mark(lines(s))}>
                <path
                  d={`M${x(s.curve[0][0])},${base} ${s.curve.map(([v, t]) => `L${x(v)},${y(t)}`).join(' ')} L${x(s.curve[s.curve.length - 1][0])},${base} Z`}
                  className="viz-curve-fill"
                  fill={color(s)}
                />
                <path d={`M${s.curve.map(([v, t]) => `${x(v)},${y(t)}`).join(' L')}`} className={`viz-curve${s.key === '' ? ' unknown' : ''}`} stroke={color(s)} />
                <path d={`M${s.curve.map(([v, t]) => `${x(v)},${y(t)}`).join(' L')}`} className="viz-curve-hit" />
              </g>
            ),
        )}
        <line x1={CURVE_PAD.l} x2={W - CURVE_PAD.r} y1={base} y2={base} className="viz-axis" />
        {dots.map((d) => (
          <g key={`${d.s.key}-${d.i}`} {...tip.mark([`${d.v} ${ko.charts.kmh}`, ...lines(d.s)])}>
            <circle cx={x(d.v)} cy={d.cy} r={DOT * 2} fill="transparent" />
            <circle cx={x(d.v)} cy={d.cy} r={DOT} className="viz-pitch" fill={color(d.s)} />
          </g>
        ))}
        {labels.map((l) => (
          <text key={l.key} x={l.x} y={CURVE_PAD.t - 8} className="viz-value" textAnchor="middle">{l.text}</text>
        ))}
      </svg>
      {tip.element}
      <ul className="legend">
        {series.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ background: color(s) }} aria-hidden="true" />
            {name(s)} {ko.charts.pitchesN(s.velos.length)} · {share(s)}
          </li>
        ))}
      </ul>
      <p className="muted small">{ko.charts.veloCurveNote}</p>
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

/** Pitchers: velocity distribution by pitch type and average by inning. Hitters: whiff rate by velocity band. */
export function VeloChart({ rows, all, role }: { rows: PitchRec[]; all: PitchRec[]; role: 'batting' | 'pitching' }) {
  const [mode, setMode] = useState<VeloMode>('type');
  const typeNames = useData<League>(role === 'pitching' ? 'league.json' : null).data?.pitch_types ?? {};
  const timed = rows.filter((r) => r.velo !== null);
  if (role === 'pitching') {
    const series = veloSeries(rows, all, mode);
    const typeName = (c: string) => typeNames[c] ?? c;
    const name = (s: VeloSeries) =>
      s.key === 'etc'
        ? `${ko.charts.veloGroups.etc} (${s.codes.map(typeName).join(', ')})`
        : mode === 'type' && s.key
          ? typeName(s.key)
          : ko.charts.veloGroups[s.key];
    const innings = [...new Set(timed.map((r) => r.inning))].sort((a, b) => a - b);
    const byInning = innings.map((i) => {
      const v = timed.filter((r) => r.inning === i).map((r) => r.velo!);
      return { inning: i, avg: v.reduce((a, b) => a + b, 0) / v.length, n: v.length, min: Math.min(...v), max: Math.max(...v) };
    });
    const summary = (v: number[]) => [formatStat(v.reduce((a, b) => a + b, 0) / v.length, 'dec1'), `${Math.min(...v)}–${Math.max(...v)}`];
    return (
      <ChartCard
        title={ko.charts.veloTitle}
        guide="velo"
        controls={
          <div className="seg" role="group" aria-label={ko.charts.veloDist}>
            {(['type', 'group'] as const).map((m) => (
              <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                {ko.charts.veloModes[m]}
              </button>
            ))}
          </div>
        }
        table={{
          headers: [ko.charts.pitchType, ko.charts.sample, ko.charts.usage, ko.charts.veloAvg, ko.charts.veloRange],
          rows: [
            ...series.map((s) => [name(s), s.velos.length, `${Math.round((s.velos.length / timed.length) * 100)}%`, ...summary(s.velos)]),
            ...byInning.map((p) => [`${ko.charts.inning(p.inning)} (${ko.charts.veloByInning})`, p.n, '', formatStat(p.avg, 'dec1'), `${p.min}–${p.max}`]),
          ],
        }}
      >
        {!timed.length ? (
          <p className="muted">{ko.charts.none}</p>
        ) : (
          <>
            <h4>{ko.charts.veloDist} ({ko.charts.kmh})</h4>
            <Curves series={series} name={name} total={timed.length} />
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
