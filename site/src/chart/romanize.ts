// Port of pipeline/romanize.py, so player IDs created in the charting tool match the importer's.

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const FINALS = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

export function romanize(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0) - 0xac00;
    out += code >= 0 && code < 11172 ? INITIALS[Math.floor(code / 588)] + MEDIALS[Math.floor((code % 588) / 28)] + FINALS[code % 28] : ch;
  }
  return out;
}

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** ASCII slug, e.g. '__Daki__' -> 'daki'; a short hash when nothing romanizes. */
export async function slugify(name: string): Promise<string> {
  const slug = romanize(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'p-' + (await sha1Hex(name)).slice(0, 6);
}

/** A slug not in `taken`, adding -2, -3, ... like the importer. */
export async function uniqueId(name: string, taken: Set<string>): Promise<string> {
  const base = await slugify(name);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}
