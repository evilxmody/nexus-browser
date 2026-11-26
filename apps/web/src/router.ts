import { useSyncExternalStore } from 'react';

export type Route = 'browse' | 'tabs' | 'bookmarks' | 'history' | 'settings';
const PANELS = ['tabs', 'bookmarks', 'history', 'settings'];

export function parseRoute(hash: string): Route {
  const r = hash.replace(/^#\/?/, '');
  return PANELS.includes(r) ? (r as Route) : 'browse';
}
let pushed = false; // true when the current panel was pushed on top of the browse view
const notify = () => dispatchEvent(new HashChangeEvent('hashchange'));
addEventListener('hashchange', () => { if (parseRoute(location.hash) === 'browse') pushed = false; });

export function openRoute(r: Exclude<Route, 'browse'>) {
  const target = `#/${r}`;
  if (location.hash === target) return;
  if (parseRoute(location.hash) === 'browse') { pushed = true; location.hash = target; }
  else { history.replaceState(null, '', target); notify(); }
}
export function closeRoute() {
  if (parseRoute(location.hash) === 'browse') return;
  if (pushed) { pushed = false; history.back(); }
  else { history.replaceState(null, '', location.pathname + location.search); notify(); }
}
export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => { addEventListener('hashchange', cb); return () => removeEventListener('hashchange', cb); },
    () => parseRoute(location.hash),
    () => 'browse' as Route,
  );
}
