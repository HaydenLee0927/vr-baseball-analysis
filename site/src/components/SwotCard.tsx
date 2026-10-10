import { ko } from '../i18n/ko';
import type { Swot } from '../lib/types';

const SECTIONS = ['strengths', 'weaknesses', 'opportunities', 'threats'] as const;

/** The coach's SWOT notes for a player, in four boxes; empty sections show a dash. */
export function SwotCard({ swot }: { swot: Swot }) {
  return (
    <section>
      <h2>{ko.swot.title}</h2>
      <div className="swot">
        {SECTIONS.map((k) => (
          <div key={k} className={`swot-box swot-${k}`}>
            <h3>{ko.swot[k]}</h3>
            {swot[k].length ? (
              <ul>
                {swot[k].map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">–</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
