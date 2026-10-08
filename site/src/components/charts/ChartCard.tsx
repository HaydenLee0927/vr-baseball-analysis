import { useEffect, useRef, useState, type ReactNode } from 'react';
import { guides } from '../../i18n/guides.ko';
import { ko } from '../../i18n/ko';

/** Follows the OS color scheme so chart colors can switch to their dark-mode steps. */
export function useDark(): boolean {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [dark, setDark] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, [query]);
  return dark;
}

/** One tooltip per chart. Marks call show() on pointer enter and on keyboard focus. */
export function useTooltip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const show = (e: { currentTarget: Element }, lines: string[]) => {
    const b = box.current?.getBoundingClientRect();
    const m = e.currentTarget.getBoundingClientRect();
    if (b) setTip({ x: m.left + m.width / 2 - b.left, y: m.top - b.top, lines });
  };
  const hide = () => setTip(null);
  const element = tip && (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{tip.lines[0]}</strong>
      {tip.lines.slice(1).map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  );
  /** Props that make an SVG mark hoverable and keyboard-focusable. */
  const mark = (lines: string[]) => ({
    tabIndex: 0,
    'aria-label': lines.join(', '),
    onPointerEnter: (e: React.PointerEvent<SVGElement>) => show(e, lines),
    onPointerLeave: hide,
    onFocus: (e: React.FocusEvent<SVGElement>) => show(e, lines),
    onBlur: hide,
  });
  return { box, element, mark };
}

export interface TableView {
  headers: string[];
  rows: (string | number)[][];
}

/** A titled chart with its "사용법" guide and a table view of the same numbers. */
export function ChartCard(props: { title: string; guide: string; controls?: ReactNode; table: TableView; children: ReactNode }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const g = guides[props.guide];
  return (
    <section className="chart-card">
      <header className="chart-head">
        <h3>{props.title}</h3>
        <button type="button" className="guide-btn" onClick={() => setGuideOpen(true)}>
          {ko.charts.guide}
        </button>
      </header>
      {props.controls && <div className="chart-controls">{props.controls}</div>}
      {props.children}
      <details className="table-view">
        <summary>{ko.charts.tableView}</summary>
        <table className="stats">
          <thead>
            <tr>
              {props.table.headers.map((h) => (
                <th key={h} className="lead">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j === 0 ? 'lead' : ''}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {guideOpen && g && (
        <div className="modal" role="dialog" aria-modal="true" aria-label={g.title} onClick={() => setGuideOpen(false)}>
          <div className="card guide" onClick={(e) => e.stopPropagation()}>
            <h2>{g.title}</h2>
            <p>{g.purpose}</p>
            <ul>
              {g.example.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="muted">{g.filters}</p>
            <ul className="questions">
              {g.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            <button type="button" onClick={() => setGuideOpen(false)} autoFocus>
              {ko.charts.close}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
