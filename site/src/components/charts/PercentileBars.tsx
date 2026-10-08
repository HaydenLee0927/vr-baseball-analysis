import { glossary, pick } from '../../i18n/glossary.ko';
import { ko } from '../../i18n/ko';
import { divColor, inkOn } from '../../lib/charts';
import { formatStat, type Kind } from '../../lib/format';
import type { Percentiles, Role } from '../../lib/types';
import { StatHelp } from '../StatHelp';
import { ChartCard, useDark } from './ChartCard';

const KIND: Record<string, Kind> = { ops: 'avg', velo_avg: 'dec1' };

/** Savant-style percentile bars: red = top of the league, blue = bottom, ranked among qualified players. */
export function PercentileBars({ data, role, season }: { data: Percentiles | null; role: Role; season: string }) {
  const dark = useDark();
  return (
    <ChartCard
      title={ko.charts.percentiles}
      guide="percentiles"
      table={{
        headers: [ko.charts.percentiles, '', ko.charts.sample],
        rows: (data?.stats ?? []).map((s) => [pick(glossary[s.key].label, role), s.pct ?? '–', formatStat(s.den, 'int')]),
      }}
    >
      {!data ? (
        <p className="muted">{ko.charts.percentileNone}</p>
      ) : (
        <>
          <ul className="pctl">
            {data.stats.map((s) => {
              const color = s.pct === null ? null : divColor(s.pct, dark);
              return (
                <li key={s.key}>
                  <span className="pctl-name">
                    {pick(glossary[s.key].label, role)}
                    <StatHelp id={s.key} role={role} season={season} kind={KIND[s.key] ?? 'pct'} />
                  </span>
                  <span className={`pctl-track${s.pct === null ? ' empty' : ''}`}>
                    {s.pct === null ? (
                      <span className="muted small">{ko.charts.notQualified}</span>
                    ) : (
                      <>
                        <span className="pctl-fill" style={{ width: `${s.pct}%`, background: color! }} />
                        <span className="pctl-dot" style={{ left: `${s.pct}%`, background: color!, color: inkOn(color!) }}>
                          {s.pct}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="pctl-value">
                    {formatStat(s.value, KIND[s.key] ?? 'pct')}
                    <small className="n">{formatStat(s.den, 'int')}</small>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="muted small">{ko.charts.percentileNote(data.pool)}</p>
        </>
      )}
    </ChartCard>
  );
}
