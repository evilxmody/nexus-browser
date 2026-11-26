/** Async so a native storage backend (Capacitor Preferences) can drop in later. */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createLocalStorageAdapter(): StorageAdapter {
  const ls = () => globalThis.localStorage; // may throw in locked-down privacy modes
  return {
    get: async (k) => ls().getItem(k),
    set: async (k, v) => ls().setItem(k, v),
    remove: async (k) => ls().removeItem(k),
  };
}

export function createMemoryAdapter(initial: Record<string, string> = {}): StorageAdapter {
  const m = new Map(Object.entries(initial));
  return {
    get: async (k) => m.get(k) ?? null,
    set: async (k, v) => void m.set(k, v),
    remove: async (k) => void m.delete(k),
  };
}
