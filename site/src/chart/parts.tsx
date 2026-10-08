import { useEffect, useRef, useState, type ReactNode } from 'react';
import { bases, fielderSpots, PLATE, wall } from '../lib/field';
import type { NewPlayer, SchemaProp } from './data';
import { typedValue } from './data';
import type { PitchRow } from './engine';
import type { People } from './people';

/** Text box with autocomplete over known VRChat names. Unknown names can be added as new players. */
export function PlayerPicker(props: {
  people: People;
  placeholder: string;
  onPick: (id: string) => void;
  onNewPlayer: (p: NewPlayer) => void;
}) {
  const [text, setText] = useState('');
  const listId = useRef(`names-${Math.random().toString(36).slice(2)}`).current;

  async function pick() {
    const name = text.trim();
    if (!name) return;
    let id = props.people.resolve(name);
    if (!id) {
      if (!confirm(`"${name}" is not a known player.\n\nAdd as a new player with this exact VRChat name?`)) return;
      const p = await props.people.newPlayer(name);
      props.onNewPlayer(p);
      id = p.player_id;
    }
    props.onPick(id);
    setText('');
  }

  return (
    <span className="picker">
      <input
        list={listId}
        value={text}
        placeholder={props.placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void pick();
          }
        }}
      />
      <button type="button" onClick={() => void pick()}>
        Add
      </button>
      <datalist id={listId}>
        {props.people.names().map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </span>
  );
}

/** Select from a list of player ids (lineup members first). */
export function PlayerSelect(props: {
  people: People;
  value: string | null;
  options: string[];
  onChange: (id: string | null) => void;
  allowEmpty?: boolean;
}) {
  const opts = props.value && !props.options.includes(props.value) ? [props.value, ...props.options] : props.options;
  return (
    <select value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value || null)}>
      {(props.allowEmpty ?? true) && <option value="">—</option>}
      {opts.map((id) => (
        <option key={id} value={id}>
          {props.people.name(id)}
        </option>
      ))}
    </select>
  );
}

export function Choice<T extends string | number>(props: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T | null) => void;
  labels?: Partial<Record<string, ReactNode>>;
  keys?: Partial<Record<string, string>>;
  highlight?: T | null;
}) {
  return (
    <div className="choice">
      {props.options.map((o) => (
        <button
          type="button"
          key={String(o)}
          className={[o === props.value ? 'on' : '', o === props.highlight && o !== props.value ? 'hint' : ''].join(' ')}
          onClick={() => props.onChange(o === props.value ? null : o)}
        >
          {props.labels?.[String(o)] ?? String(o)}
          {props.keys?.[String(o)] && <kbd>{props.keys[String(o)]}</kbd>}
        </button>
      ))}
    </div>
  );
}

// Savant zones from the catcher's view: 1-9 in the zone, 11-14 the four outside quadrants.
const OUTER: Record<string, number> = { tl: 11, tr: 12, bl: 13, br: 14 };

export function ZoneGrid(props: { value: number | null; onChange: (z: number | null) => void }) {
  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const inner = r >= 1 && r <= 3 && c >= 1 && c <= 3;
      const zone = inner ? (r - 1) * 3 + c : OUTER[(r <= 2 ? 't' : 'b') + (c <= 2 ? 'l' : 'r')];
      cells.push(
        <button
          type="button"
          key={`${r}-${c}`}
          className={`zcell ${inner ? 'in' : 'out'} ${props.value === zone ? 'on' : ''}`}
          onClick={() => props.onChange(props.value === zone ? null : zone)}
          title={`zone ${zone}`}
        >
          {inner || (r === 0 && c === 0) || (r === 0 && c === 4) || (r === 4 && c === 0) || (r === 4 && c === 4) ? zone : ''}
        </button>,
      );
    }
  }
  return (
    <div>
      <div className="zgrid">{cells}</div>
      <div className="muted small">catcher's view</div>
    </div>
  );
}

/** Field diagram (lib/field.ts coordinates). Click to mark the landing spot. */
export function FieldDiagram(props: {
  point: { x: number; y: number } | null;
  fielder: number | null;
  onPoint: (p: { x: number; y: number } | null, nearestFielder: number) => void;
}) {
  const S = 300;
  const pts = (list: { x: number; y: number }[]) => list.map((p) => `${p.x * S},${p.y * S}`).join(' ');
  const fair = [PLATE, ...wall];
  return (
    <svg
      className="field"
      viewBox={`0 ${0.15 * S} ${S} ${0.85 * S}`}
      onClick={(e) => {
        const svg = e.currentTarget;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const loc = pt.matrixTransform(svg.getScreenCTM()!.inverse());
        const p = { x: Math.min(1, Math.max(0, loc.x / S)), y: Math.min(1, Math.max(0, loc.y / S)) };
        const nearest = Object.entries(fielderSpots).sort(
          ([, a], [, b]) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
        )[0][0];
        props.onPoint({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }, Number(nearest));
      }}
    >
      <polygon points={pts(fair)} className="grass" />
      <polygon points={pts([bases.home, bases.first, bases.second, bases.third])} className="infield" />
      {Object.entries(fielderSpots).map(([pos, p]) => (
        <text key={pos} x={p.x * S} y={p.y * S} className={`pos ${props.fielder === Number(pos) ? 'on' : ''}`}>
          {pos}
        </text>
      ))}
      {props.point && <circle cx={props.point.x * S} cy={props.point.y * S} r={5} className="landing" />}
    </svg>
  );
}

/** SOOP VODs can be embedded, but their playback time cannot be read (no player API). */
function soopEmbed(url: string | null): string | null {
  const m = url?.match(/vod\.sooplive\.(?:com|co\.kr)\/player\/(\d+)/);
  return m ? `https://vod.sooplive.com/player/${m[1]}/embed` : null;
}

function youtubeId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: object) => { getCurrentTime(): number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  return new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    if (!document.querySelector('script[data-yt]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.dataset.yt = '1';
      document.head.appendChild(s);
    }
  });
}

function parseClock(text: string): number | null {
  const parts = text.trim().split(':').map(Number);
  if (!parts.length || parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function formatClock(sec: number | null): string {
  if (sec === null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + `:${String(s).padStart(2, '0')}`;
}

/**
 * YouTube VODs are embedded and their playback time is read directly. SOOP VODs are embedded but
 * their time cannot be read; CHZZK cannot be embedded at all. For those a manual clock is used:
 * set it to the video time once and start it together with the video.
 */
export function VideoPane(props: { url: string | null; onClock: (get: () => number | null) => void }) {
  const ytId = youtubeId(props.url);
  const box = useRef<HTMLDivElement>(null);
  // `synced` stays false until the charter sets or starts the clock, so no fake times get stamped.
  const [clock, setClock] = useState({ base: 0, startedAt: null as number | null, synced: false });
  const [clockText, setClockText] = useState('0:00');
  const [, tick] = useState(0);
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const { onClock } = props;

  useEffect(() => {
    if (!ytId || !box.current) return;
    let player: { getCurrentTime(): number } | null = null;
    const el = document.createElement('div');
    box.current.replaceChildren(el);
    void loadYouTubeApi().then(() => {
      player = new window.YT!.Player(el, { videoId: ytId, width: '100%', height: '100%', playerVars: { rel: 0 } });
    });
    onClock(() => (player ? Math.floor(player.getCurrentTime()) : null));
  }, [ytId, onClock]);

  useEffect(() => {
    if (ytId) return;
    onClock(() => {
      const c = clockRef.current;
      return c.synced ? Math.floor(c.base + (c.startedAt ? (Date.now() - c.startedAt) / 1000 : 0)) : null;
    });
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [ytId, onClock]);

  if (ytId) return <div className="video" ref={box} />;
  const now = clock.base + (clock.startedAt ? (Date.now() - clock.startedAt) / 1000 : 0);
  const soop = soopEmbed(props.url);
  return (
    <div>
      {soop && <iframe className="video" src={soop} allow="autoplay; fullscreen" allowFullScreen title="video" />}
    <div className="video manual">
      <p className="muted small">
        {soop ? (
          'SOOP does not let the tool read the video time: set the clock below to the video time and start it together with the video.'
        ) : props.url ? (
          <>
            This video cannot be embedded.{' '}
            <a href={props.url} target="_blank" rel="noreferrer">
              Open it in another window
            </a>
            , then keep this clock in step with it.
          </>
        ) : (
          'No video link set. Use the clock to stamp times.'
        )}
      </p>
      <div className="clock">{formatClock(now)}</div>
      <div className="row">
        <input value={clockText} onChange={(e) => setClockText(e.target.value)} size={8} aria-label="video time" />
        <button
          type="button"
          onClick={() => {
            const s = parseClock(clockText);
            if (s !== null) setClock({ base: s, startedAt: clock.startedAt ? Date.now() : null, synced: true });
          }}
        >
          Set
        </button>
        <button
          type="button"
          onClick={() =>
            setClock(clock.startedAt ? { base: now, startedAt: null, synced: true } : { base: clock.base, startedAt: Date.now(), synced: true })
          }
        >
          {clock.startedAt ? 'Pause' : 'Start'}
        </button>
      </div>
    </div>
    </div>
  );
}

/** Edit any field of an existing row. Later rows are not recomputed. */
export function RowEditor(props: {
  row: PitchRow;
  schema: Record<string, SchemaProp>;
  people: People;
  onSave: (row: PitchRow) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(props.schema).map((k) => [k, String((props.row as unknown as Record<string, unknown>)[k] ?? '')])),
  );
  const locked = new Set(['game_id', 'pitch_id']);
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <form
        className="card editor"
        onSubmit={(e) => {
          e.preventDefault();
          const row = Object.fromEntries(Object.entries(props.schema).map(([k, p]) => [k, typedValue(p, values[k].trim())]));
          props.onSave(row as unknown as PitchRow);
        }}
      >
        <h2>Edit pitch {props.row.pitch_id}</h2>
        <p className="muted small">Changes apply to this row only; later rows keep their recorded state.</p>
        <div className="fields">
          {Object.entries(props.schema).map(([k, p]) => (
            <label key={k}>
              <span>{k}</span>
              {p.enum ? (
                <select value={values[k]} onChange={(e) => setValues({ ...values, [k]: e.target.value })}>
                  {p.enum.map((v) => (
                    <option key={String(v)} value={v === null ? '' : String(v)}>
                      {v === null ? '—' : String(v)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[k]}
                  disabled={locked.has(k)}
                  onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                  title={k.endsWith('_id') || k.startsWith('runner') ? props.people.name(values[k]) : undefined}
                />
              )}
            </label>
          ))}
        </div>
        <div className="row">
          <button type="submit">Save row</button>
          <button type="button" className="secondary" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
