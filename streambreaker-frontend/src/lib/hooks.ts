import { useEffect, useState } from 'react';

/** Debounce a fast-changing value (e.g. a search box). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Run an async loader whenever `key` changes; aborts stale requests.
 * `reload()` re-runs it with the same key.
 */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>, key: string) {
  const [state, setState] = useState<AsyncState<T> & { key: string; nonce: number }>({
    data: null, error: null, loading: true, key, nonce: 0,
  });
  const [nonce, setNonce] = useState(0);

  // Reset synchronously when the key changes so stale data never flashes
  if (state.key !== key || state.nonce !== nonce) {
    setState({ data: null, error: null, loading: true, key, nonce });
  }

  useEffect(() => {
    const controller = new AbortController();
    loader(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false, key, nonce });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ data: null, error, loading: false, key, nonce });
      });
    return () => controller.abort();
    // `loader` is intentionally keyed by `key` — callers pass an inline function
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { data: state.data, error: state.error, loading: state.loading, reload: () => setNonce((n) => n + 1) };
}
