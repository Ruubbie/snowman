import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

// --- hash router -------------------------------------------------------------
function readHash() {
  const h = window.location.hash.replace(/^#/, '') || '/';
  return h.startsWith('/') ? h : `/${h}`;
}

function subscribeHash(cb) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function navigate(path) {
  if (readHash() !== path) window.location.hash = path;
}

/** Current route as path + parts ('/m/running/workouts/abc' -> ['m','running','workouts','abc']). */
export function useRoute() {
  const path = useSyncExternalStore(subscribeHash, readHash);
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent) };
}

// --- data loading ------------------------------------------------------------
/**
 * Run an async loader; re-runs when deps change. `setData` lets screens apply
 * optimistic updates without a refetch.
 */
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(loader)
      .then(
        (data) => id === seq.current && setState({ data, error: null, loading: false }),
        (error) => id === seq.current && setState((s) => ({ data: s.data, error, loading: false })),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  return { ...state, reload: run, setData };
}

// --- animated exits ------------------------------------------------------------
export const EXIT_MS = 480;

/**
 * Optimistic removal with an animated exit: `leave(ids)` marks rows as
 * leaving (CSS collapses them), then calls `onGone(ids)` once the animation
 * has played. Returns [leavingSet, leave, restore].
 */
export function useLeaving() {
  const [leaving, setLeaving] = useState(() => new Set());
  const leave = useCallback((ids, onGone) => {
    setLeaving((s) => new Set([...s, ...ids]));
    setTimeout(() => {
      onGone?.(ids);
      setLeaving((s) => {
        const next = new Set(s);
        ids.forEach((i) => next.delete(i));
        return next;
      });
    }, EXIT_MS);
  }, []);
  const restore = useCallback((ids) => {
    setLeaving((s) => {
      const next = new Set(s);
      ids.forEach((i) => next.delete(i));
      return next;
    });
  }, []);
  return [leaving, leave, restore];
}

// --- count-up numbers ------------------------------------------------------------
/** Eases a number from its previous value to `target` over `ms` (900ms drift, ease-out). */
export function useCountUp(target, ms = 900) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (target == null || !Number.isFinite(Number(target))) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    const a = from.current;
    const b = Number(target);
    if (reduce) {
      setValue(b);
      from.current = b;
      return undefined;
    }
    let raf;
    // cubic-bezier(.2,.7,.2,1) is close to an ease-out-cubic
    const ease = (t) => 1 - (1 - t) ** 3;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      const v = a + (b - a) * ease(t);
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = b;
    };
  }, [target, ms]);
  return target == null ? null : value;
}

export function useMediaQuery(query) {
  const get = () => window.matchMedia(query).matches;
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    get,
  );
}
