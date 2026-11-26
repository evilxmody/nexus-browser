export interface Store<S, A> {
  getState(): S;
  dispatch(action: A): void;
  /** Swap the whole state (used after hydration). */
  replace(next: S): void;
  subscribe(listener: () => void): () => void;
}

/** Minimal framework-agnostic store. Reducers must return the same reference for no-ops. */
export function createStore<S, A>(initial: S, reduce: (s: S, a: A) => S): Store<S, A> {
  let state = initial;
  const listeners = new Set<() => void>();
  const set = (next: S) => {
    if (next === state) return;
    state = next;
    listeners.forEach((l) => l());
  };
  return {
    getState: () => state,
    dispatch: (a) => set(reduce(state, a)),
    replace: set,
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
