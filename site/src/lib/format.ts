// Number and date formatting in Korean baseball-media style.

export type Kind = 'int' | 'avg' | 'pct' | 'dec1' | 'dec2' | 'ip' | 'text';

const intFmt = new Intl.NumberFormat('ko-KR');

export function formatStat(value: unknown, kind: Kind): string {
  if (value === null || value === undefined || value === '') return '–';
  if (kind === 'ip' || kind === 'text') return String(value);
  const v = Number(value);
  if (Number.isNaN(v)) return '–';
  switch (kind) {
    case 'int':
      return intFmt.format(v);
    case 'avg': // .312, 1.000 — no leading zero, as in Korean baseball media
      return v.toFixed(3).replace(/^0(?=\.)/, '').replace(/^-0(?=\.)/, '-');
    case 'pct':
      return `${(v * 100).toFixed(1)}%`;
    case 'dec1':
      return v.toFixed(1);
    case 'dec2':
      return v.toFixed(2);
  }
}

/** 2026-10-07 -> 2026.10.07 */
export function formatDate(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10).replaceAll('-', '.') : '';
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
