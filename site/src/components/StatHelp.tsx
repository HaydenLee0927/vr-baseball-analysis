import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { glossary, pick } from '../i18n/glossary.ko';
import { ko } from '../i18n/ko';
import { formatStat, type Kind } from '../lib/format';
import type { League, Role } from '../lib/types';
import { useData } from '../lib/useData';

/** "?" button that opens a plain-language explanation of a stat (tap, not hover, so it works on phones). */
export function StatHelp(props: { id: string; role: Role; kind?: Kind; season?: string }) {
  const entry = glossary[props.id];
  const [open, setOpen] = useState(false);
  // Fixed position from the button's place on screen, so tables that scroll sideways cannot clip it.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const popId = useId();
  const league = useData<League>(open && entry?.league && props.season ? 'league.json' : null).data;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onMove = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  if (!entry) return null;
  const name = pick(entry.name, props.role);
  const leagueValue = props.season ? league?.seasons[props.season]?.[props.role]?.[props.id] : undefined;

  return (
    <span className="help" ref={box}>
      <button
        type="button"
        className="help-btn"
        aria-label={ko.help.button(name)}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          const width = Math.min(320, window.innerWidth - 16);
          setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) });
          setOpen(!open);
        }}
      >
        ?
      </button>
      {open && (
        <span className="help-pop" role="dialog" id={popId} aria-label={name} style={pos ?? undefined}>
          <strong>{name}</strong>
          <span className="help-part">
            <b>{ko.help.whatTitle}</b> {pick(entry.what, props.role)}
          </span>
          <span className="help-part">
            <b>{ko.help.readTitle}</b> {pick(entry.read, props.role)}
          </span>
          <span className="help-part">
            <b>{ko.help.referenceTitle}</b>{' '}
            {!entry.league
              ? ko.help.noLeague
              : leagueValue !== undefined && leagueValue !== null && props.season
                ? ko.help.leagueAverage(formatStat(leagueValue, props.kind ?? 'text'), props.season)
                : '–'}
          </span>
          <span className="help-part">
            <b>{ko.help.useTitle}</b> {pick(entry.use, props.role)}
          </span>
          <span className="help-links">
            <Link to={`/glossary?stat=${props.id}&role=${props.role}`}>{ko.help.more}</Link>
            <button type="button" className="link" onClick={() => setOpen(false)}>
              {ko.help.close}
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
