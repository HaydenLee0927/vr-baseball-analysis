import { useMemo, useState, type ReactNode } from 'react';
import { glossary, pick } from '../i18n/glossary.ko';
import { ko } from '../i18n/ko';
import { formatStat } from '../lib/format';
import { glossaryId, type StatCol } from '../lib/stats';
import type { Line, Role } from '../lib/types';
import { StatHelp } from './StatHelp';

export interface TableRow {
  key: string;
  line: Line;
  /** Cells shown before the stat columns (name, team, date…). */
  lead: ReactNode[];
  /** Values to sort the lead columns by. */
  leadSort?: (string | number)[];
}

/** A stat value; rates also show their sample size (every rate on the site shows its n). */
export function StatCell({ col, line }: { col: StatCol; line: Line }) {
  const value = formatStat(line[col.key], col.kind);
  if (!col.den || line[col.key] === null || line[col.key] === undefined) return <>{value}</>;
  const n = formatStat(line[col.den], col.den === 'ip' ? 'ip' : 'int');
  return (
    <>
      {value}
      <small className="n" title={ko.common.sampleTitle(n, ko.denominators[col.den] ?? '')}>
        {n}
      </small>
    </>
  );
}

export function StatTable(props: {
  cols: StatCol[];
  rows: TableRow[];
  role: Role;
  season?: string;
  leadHeaders: ReactNode[];
  /** Enables sorting by clicking headers; value is the initial sort column key. */
  sortBy?: string;
  caption?: string;
}) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(() => {
    const c = props.cols.find((x) => x.key === props.sortBy);
    return c ? { key: c.key, desc: !c.lowerBetter } : null;
  });

  const rows = useMemo(() => {
    if (!sort) return props.rows;
    const value = (r: TableRow): number | string | null => {
      if (sort.key.startsWith('lead:')) return r.leadSort?.[Number(sort.key.slice(5))] ?? null;
      const v = r.line[sort.key];
      return typeof v === 'string' && /^\d+(\.\d)?$/.test(v) ? Number(v) : v; // innings pitched "5.2"
    };
    return [...props.rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === null || va === undefined) return 1; // blanks last either way
      if (vb === null || vb === undefined) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko');
      return sort.desc ? -cmp : cmp;
    });
  }, [props.rows, sort]);

  const sortable = props.sortBy !== undefined;
  const onSort = (key: string, lowerBetter = false) =>
    setSort((s) => (s?.key === key ? { key, desc: !s.desc } : { key, desc: !lowerBetter && !key.startsWith('lead:') }));
  const ariaSort = (key: string) => (sort?.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined);

  return (
    <div className="table-wrap">
      <table className="stats">
        {props.caption && <caption>{props.caption}</caption>}
        <thead>
          <tr>
            {props.leadHeaders.map((h, i) => (
              <th key={`lead-${i}`} className="lead" aria-sort={ariaSort(`lead:${i}`)}>
                {sortable ? (
                  <button type="button" className="sort" onClick={() => onSort(`lead:${i}`)}>
                    {h}
                  </button>
                ) : (
                  h
                )}
              </th>
            ))}
            {props.cols.map((c) => {
              const entry = glossary[glossaryId(c)];
              const label = entry ? pick(entry.label, props.role) : c.key;
              return (
                <th key={c.key} aria-sort={ariaSort(c.key)}>
                  <span className="th">
                    {sortable ? (
                      <button type="button" className="sort" onClick={() => onSort(c.key, c.lowerBetter)}>
                        {label}
                        {sort?.key === c.key && <span aria-hidden="true">{sort.desc ? ' ▼' : ' ▲'}</span>}
                      </button>
                    ) : (
                      label
                    )}
                    <StatHelp id={glossaryId(c)} role={props.role} kind={c.kind} season={props.season} />
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {r.lead.map((cell, i) => (
                <td key={`lead-${i}`} className="lead">
                  {cell}
                </td>
              ))}
              {props.cols.map((c) => (
                <td key={c.key}>
                  <StatCell col={c} line={r.line} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
