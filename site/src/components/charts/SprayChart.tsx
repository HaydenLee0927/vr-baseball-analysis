import { useId, useState } from 'react';
import { ko } from '../../i18n/ko';
import { FAIR, FIELDER_AREAS, inkOn, PITCHER_AREA, resultClass, seqColor, type PitchRec, type ResultClass } from '../../lib/charts';
import { bases, fielderSpots, PLATE, wall } from '../../lib/field';
import { ChartCard, useDark, useTooltip } from './ChartCard';

const S = 400; // diagram units -> SVG px
const CLASSES: ResultClass[] = ['hit', 'out', 'other'];
const pts = (list: { x: number; y: number }[]) => list.map((p) => `${(p.x * S).toFixed(1)},${(p.y * S).toFixed(1)}`).join(' ');

/** Where balls in play went: exact landing spots (point mode) or share per fielder (area mode). */
export function SprayChart({ rows }: { rows: PitchRec[] }) {
  const inPlay = rows.filter((r) => r.result === 'in_play');
  const withPoints = inPlay.filter((r) => r.field_x !== null && r.field_y !== null);
  const [mode, setMode] = useState<'points' | 'areas'>(withPoints.length ? 'points' : 'areas');
  const shown = mode === 'points' && withPoints.length ? 'points' : 'areas';
  const dark = useDark();
  const tip = useTooltip();
  const clip = useId();

  const byPos = new Map<number, PitchRec[]>();
  for (const r of inPlay) if (r.fielder_pos) byPos.set(r.fielder_pos, [...(byPos.get(r.fielder_pos) ?? []), r]);
  const located = [...byPos.values()].reduce((n, l) => n + l.length, 0);
  const share = (pos: number) => (located ? (byPos.get(pos)?.length ?? 0) / located : 0);
  const maxShare = Math.max(0.0001, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(share));
  const areaLines = (pos: number) => {
    const l = byPos.get(pos) ?? [];
    const hits = l.filter((r) => resultClass(r.pa_result) === 'hit').length;
    return [
      `${ko.positions[pos]} · ${Math.round(share(pos) * 100)}%`,
      `${ko.charts.balls} ${l.length} (${ko.charts.hit} ${hits}, ${ko.charts.out} ${l.length - hits})`,
    ];
  };
  const fill = (pos: number) => (byPos.get(pos)?.length ? seqColor(share(pos) / maxShare, dark) : 'var(--viz-field)');

  const table = {
    headers: [ko.charts.fielder, ko.charts.balls, ko.charts.hit, ko.charts.out, '%'],
    rows: [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .filter((p) => byPos.has(p))
      .map((p) => {
        const l = byPos.get(p)!;
        const hits = l.filter((r) => resultClass(r.pa_result) === 'hit').length;
        return [ko.positions[p], l.length, hits, l.length - hits, `${Math.round(share(p) * 100)}%`];
      }),
  };

  return (
    <ChartCard
      title={ko.charts.spray}
      guide="spray"
      table={table}
      controls={
        <div className="seg" role="group" aria-label={ko.charts.spray}>
          {(['points', 'areas'] as const).map((m) => (
            <button key={m} type="button" className={shown === m ? 'on' : ''} disabled={m === 'points' && !withPoints.length} onClick={() => setMode(m)}>
              {m === 'points' ? ko.charts.sprayPoints : ko.charts.sprayAreas}
            </button>
          ))}
        </div>
      }
    >
      {!inPlay.length ? (
        <p className="muted">{ko.charts.none}</p>
      ) : (
        <div className="viz" ref={tip.box}>
          <svg viewBox={`0 ${0.2 * S} ${S} ${0.76 * S}`} className="spray" role="img" aria-label={ko.charts.spray}>
            <defs>
              <clipPath id={clip}>
                <polygon points={pts(FAIR)} />
              </clipPath>
            </defs>
            <polygon points={pts(FAIR)} className="viz-fair" />
            {shown === 'areas' && (
              <g clipPath={`url(#${clip})`}>
                {FIELDER_AREAS.map((a) => (
                  <polygon key={a.pos} points={pts(a.points)} fill={fill(a.pos)} className="viz-area" {...tip.mark(areaLines(a.pos))} />
                ))}
                <circle cx={PITCHER_AREA.center.x * S} cy={PITCHER_AREA.center.y * S} r={PITCHER_AREA.radius * S} fill={fill(1)} className="viz-area" {...tip.mark(areaLines(1))} />
              </g>
            )}
            <polygon points={pts([bases.home, bases.first, bases.second, bases.third])} className="viz-diamond" />
            <polyline points={pts([wall[0], PLATE, wall[wall.length - 1]])} className="viz-line" />
            {shown === 'areas' &&
              [1, 2, 3, 4, 5, 6, 7, 8, 9]
                .filter((p) => byPos.has(p))
                .map((p) => (
                  <text key={p} x={fielderSpots[p].x * S} y={fielderSpots[p].y * S} className="viz-label" fill={inkOn(fill(p))}>
                    {Math.round(share(p) * 100)}%
                  </text>
                ))}
            {shown === 'points' &&
              withPoints.map((r) => {
                const cls = resultClass(r.pa_result);
                const lines = [
                  `${ko.paResults[r.pa_result ?? ''] ?? r.pa_result ?? ''}`,
                  [r.bb_type && ko.bbTypes[r.bb_type], r.contact_quality && ko.contact[r.contact_quality]].filter(Boolean).join(' · '),
                  r.fielder_pos ? `${ko.charts.fielder}: ${ko.positions[r.fielder_pos]}` : '',
                ].filter(Boolean);
                return (
                  <g key={`${r.game_id}-${r.pitch_id}`} {...tip.mark(lines)} className="viz-dot-hit">
                    <circle cx={r.field_x! * S} cy={r.field_y! * S} r={12} fill="transparent" />
                    <circle cx={r.field_x! * S} cy={r.field_y! * S} r={5} className={`viz-dot viz-${cls}`} />
                  </g>
                );
              })}
          </svg>
          {tip.element}
          {shown === 'points' ? (
            <ul className="legend">
              {CLASSES.map((c) => (
                <li key={c}>
                  <span className={`swatch viz-${c}`} aria-hidden="true" />
                  {ko.charts[c]} {withPoints.filter((r) => resultClass(r.pa_result) === c).length}
                </li>
              ))}
            </ul>
          ) : (
            !withPoints.length && <p className="muted small">{ko.charts.sprayNoPoints}</p>
          )}
        </div>
      )}
    </ChartCard>
  );
}
