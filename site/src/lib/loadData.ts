// Single entry point for site data. In encrypted mode it fetches `<path>.enc`
// and decrypts with the key derived from the password (see pipeline/encrypt.py);
// in public mode it fetches plain JSON. Page code never needs to know which.
// While locked it serves the plain example files in `sample/` (one player's page, see export_json.py).

const PUBLIC_MODE = import.meta.env.VITE_PUBLIC_MODE === 'true';
const DATA_URL = `${import.meta.env.BASE_URL}data/`;
const SAMPLE_URL = `${import.meta.env.BASE_URL}sample/`;
const STORAGE_KEY = 'vr-savant-key';

let key: CryptoKey | null = null;

export const isPublicMode = PUBLIC_MODE;

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function fetchOk(path: string, base = DATA_URL): Promise<Response> {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res;
}

async function decryptFile(k: CryptoKey, path: string): Promise<unknown> {
  const blob = new Uint8Array(await (await fetchOk(`${path}.enc`)).arrayBuffer());
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: blob.slice(0, 12) },
    k,
    blob.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

// True if `k` decrypts meta.json. A wrong key fails the GCM tag check.
async function verify(k: CryptoKey): Promise<boolean> {
  try {
    await decryptFile(k, 'meta.json');
    return true;
  } catch {
    return false;
  }
}

function storages(): Storage[] {
  try {
    return [sessionStorage, localStorage];
  } catch {
    return [];
  }
}

export function lock(): void {
  key = null;
  for (const s of storages()) {
    try {
      s.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }
}

/** Restore a key saved on this device. False if none, or if the data was re-encrypted since. */
export async function tryStoredKey(): Promise<boolean> {
  for (const s of storages()) {
    let saved: string | null = null;
    try {
      saved = s.getItem(STORAGE_KEY);
    } catch {
      continue;
    }
    if (!saved) continue;
    const k = await crypto.subtle.importKey('raw', fromBase64(saved), 'AES-GCM', true, ['decrypt']);
    if (await verify(k)) {
      key = k;
      return true;
    }
  }
  lock();
  return false;
}

/** Derive the key from the password. Returns false on a wrong password. */
export async function unlock(password: string, remember: boolean): Promise<boolean> {
  const params = (await (await fetchOk('crypto.json')).json()) as { salt: string; iterations: number };
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const k = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(params.salt), iterations: params.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt'],
  );
  if (!(await verify(k))) return false;
  key = k;
  try {
    const raw = toBase64(await crypto.subtle.exportKey('raw', k));
    (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, raw);
  } catch {
    /* storage unavailable: stay unlocked for this page load only */
  }
  return true;
}

/** True once the password has been entered (or the whole site is public). */
export function isUnlocked(): boolean {
  return PUBLIC_MODE || key !== null;
}

export async function loadData<T>(path: string): Promise<T> {
  if (PUBLIC_MODE) return (await fetchOk(path)).json() as Promise<T>;
  if (!key) return (await fetchOk(path, SAMPLE_URL)).json() as Promise<T>;
  return decryptFile(key, path) as Promise<T>;
}
