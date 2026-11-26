import {
  createLocalStorageAdapter, createSettingsStore, loadSettings, persistSettings, SETTINGS_KEY,
} from '@nexus/core';
import { BROWSER_KEY, connectPersistence, createBrowser, createPageRuntime, loadBrowserState } from '@nexus/browser';
import { mergeAllowlist, type EmbedContext } from '@nexus/shared';
import { toast } from './toast';

export const adapter = createLocalStorageAdapter();
export const browser = createBrowser();
export const settings = createSettingsStore();
/** Per-tab frame status (loading / loaded / verified / error). Runtime only, never persisted. */
export const pages = createPageRuntime();

/** Everything the embed policy needs. Takes the person's allowlist so React callers can pass fresh settings. */
export function embedContext(embedAllow: readonly string[] = settings.getState().embedAllow): EmbedContext {
  return { allow: mergeAllowlist(embedAllow), appOrigin: location.origin, appProtocol: location.protocol };
}

export interface BootResult { recovered: boolean; error?: string }
let booting: Promise<BootResult> | null = null;

/** Hydrates stores from storage once, then starts write-behind persistence. Never rejects. */
export function boot(): Promise<BootResult> {
  booting ??= (async () => {
    const [b, s] = await Promise.all([loadBrowserState(adapter), loadSettings(adapter)]);
    browser.store.replace(b.state);
    settings.replace(s.settings);
    const onError = (m: string) => toast(m, 'error');
    const persistence = connectPersistence(browser.store, adapter, { onError });
    persistSettings(settings, adapter, onError);
    const flush = () => void persistence.flush();
    addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
    return { recovered: b.recovered || s.recovered, error: b.error ?? s.error };
  })();
  return booting;
}

/** Wipes everything this app stored on the device and resets in-memory state. */
export async function resetAllData() {
  await Promise.allSettled([adapter.remove(BROWSER_KEY), adapter.remove(SETTINGS_KEY)]);
  location.hash = '';
  location.reload();
}
