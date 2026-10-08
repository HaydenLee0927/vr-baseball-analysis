import { useEffect, useState } from 'react';
import { loadData } from './loadData';

const cache = new Map<string, Promise<unknown>>();

/** Load (and decrypt) a data file once per page load; every component asking for it shares the result. */
export function fetchCached<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = loadData<T>(path);
    p.catch(() => cache.delete(path)); // allow a retry after a failed load
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export function useData<T>(path: string | null): { data: T | null; error: boolean } {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: boolean }>({ path: null, data: null, error: false });
  useEffect(() => {
    if (!path) return;
    let live = true;
    fetchCached<T>(path).then(
      (data) => live && setState({ path, data, error: false }),
      () => live && setState({ path, data: null, error: true }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  return state.path === path ? { data: state.data, error: state.error } : { data: null, error: false };
}
