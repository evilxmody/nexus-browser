import {
  isRecord, isNavigableUrl, isSearchEngineId, normalizeAllowEntry, MAX_ALLOW_ENTRIES, NEWTAB_URL, type SearchEngineId,
} from '@nexus/shared';
import { createStore, type Store } from './store';
import type { StorageAdapter } from './storage';

export interface Settings {
  searchEngine: SearchEngineId;
  /** Empty string means the built-in new tab page. */
  homeUrl: string;
  /** Sites the person allowed to be shown inside the app (hosts, optionally host:port). Subdomains are included. */
  embedAllow: string[];
  /** Hand-swipe tab switching through the camera. Off until the person turns it on. */
  handGestures: boolean;
}
export const DEFAULT_SETTINGS: Settings = { searchEngine: 'duckduckgo', homeUrl: '', embedAllow: [], handGestures: false };
export const SETTINGS_KEY = 'nexus.settings.v1';

export function sanitizeSettings(raw: unknown): Settings {
  const r = isRecord(raw) ? raw : {};
  const home = typeof r.homeUrl === 'string' ? r.homeUrl : '';
  const embedAllow: string[] = [];
  if (Array.isArray(r.embedAllow)) {
    for (const e of r.embedAllow) {
      const n = normalizeAllowEntry(e);
      if (n.ok && !embedAllow.includes(n.entry) && embedAllow.length < MAX_ALLOW_ENTRIES) embedAllow.push(n.entry);
    }
  }
  return {
    searchEngine: isSearchEngineId(r.searchEngine) ? r.searchEngine : DEFAULT_SETTINGS.searchEngine,
    homeUrl: home !== NEWTAB_URL && isNavigableUrl(home) ? home : '',
    embedAllow,
    handGestures: r.handGestures === true,
  };
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function createSettingsStore(initial: Settings = DEFAULT_SETTINGS): Store<Settings, Partial<Settings>> {
  return createStore<Settings, Partial<Settings>>(initial, (s, patch) => {
    const n = sanitizeSettings({ ...s, ...patch });
    return n.searchEngine === s.searchEngine && n.homeUrl === s.homeUrl && sameList(n.embedAllow, s.embedAllow) && n.handGestures === s.handGestures ? s : n;
  });
}

export async function loadSettings(
  adapter: StorageAdapter,
): Promise<{ settings: Settings; recovered: boolean; error?: string }> {
  try {
    const raw = await adapter.get(SETTINGS_KEY);
    if (raw === null) return { settings: DEFAULT_SETTINGS, recovered: false };
    try {
      return { settings: sanitizeSettings(JSON.parse(raw)), recovered: false };
    } catch {
      return { settings: DEFAULT_SETTINGS, recovered: true };
    }
  } catch {
    return { settings: DEFAULT_SETTINGS, recovered: false, error: 'Storage is unavailable; settings will not be saved.' };
  }
}

export function persistSettings(store: Store<Settings, unknown>, adapter: StorageAdapter, onError?: (m: string) => void) {
  return store.subscribe(() => {
    adapter.set(SETTINGS_KEY, JSON.stringify(store.getState())).catch(() => onError?.('Could not save settings.'));
  });
}
