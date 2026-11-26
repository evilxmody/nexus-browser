import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Store } from '@nexus/core';

export function useStore<S>(store: Store<S, never> | { getState(): S; subscribe(l: () => void): () => void }): S {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** Captures the (Chromium) install prompt so the menu can offer a real "Install app" action. */
interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
export function useInstallPrompt() {
  const [ev, setEv] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent); };
    const done = () => setEv(null);
    addEventListener('beforeinstallprompt', on);
    addEventListener('appinstalled', done);
    return () => { removeEventListener('beforeinstallprompt', on); removeEventListener('appinstalled', done); };
  }, []);
  return ev ? async () => { await ev.prompt(); await ev.userChoice; setEv(null); } : null;
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => { addEventListener('online', cb); addEventListener('offline', cb); return () => { removeEventListener('online', cb); removeEventListener('offline', cb); }; },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Keeps --app-h equal to the visible viewport so the toolbar stays on screen when a mobile keyboard opens
 * (iOS Safari does not resize the layout viewport), and re-measures on rotation.
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const apply = () => {
      const h = vv ? vv.height : innerHeight;
      root.style.setProperty('--app-h', `${Math.round(h)}px`);
      if (vv && vv.offsetTop > 0) scrollTo(0, 0);
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    addEventListener('orientationchange', apply);
    addEventListener('resize', apply);
    return () => {
      vv?.removeEventListener('resize', apply); vv?.removeEventListener('scroll', apply);
      removeEventListener('orientationchange', apply); removeEventListener('resize', apply);
      root.style.removeProperty('--app-h');
    };
  }, []);
}
