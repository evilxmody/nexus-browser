import { createStore } from '@nexus/core';
import { SwipeDetector } from '@nexus/gestures';
import { HandTracker, type TrackerStatus } from '@nexus/tracking';
import { registerCommandSource, type BrowserCommand, type CommandSource } from './commands';
import { settings } from './runtime';
import { toast } from './toast';

/**
 * Wires camera tracking (@nexus/tracking) and gesture logic (@nexus/gestures) into the ONE command system (commands.ts).
 * A gesture can only emit a BrowserCommand, so it can never do more than a button can.
 *
 * Camera rules: the camera starts only after the person switches "Hand gestures" on (never on page load),
 * stops when they switch it off or pause, and nothing leaves the device.
 */

/**
 * Which way to swipe for the next tab. The camera image is not mirrored, so a hand moving to the USER'S RIGHT moves
 * toward the LEFT edge of the image. 'left' (image) = swipe right = next tab. Flip this one line if it feels backwards.
 */
export const NEXT_TAB_IMAGE_DIRECTION: 'left' | 'right' = 'left';

/** Landmarks used for the palm center: wrist (0) and the four finger knuckles (5, 9, 13, 17). */
const PALM = [0, 5, 9, 13, 17] as const;

export interface GestureUiState { status: TrackerStatus; paused: boolean; lastGesture: string | null }
type A = Partial<GestureUiState>;
export const gestureUi = createStore<GestureUiState, A>(
  { status: { state: 'off' }, paused: false, lastGesture: null },
  (s, a) => ({ ...s, ...a }),
);

let tracker: HandTracker | null = null;
let unregister: (() => void) | null = null;

const handSwipeSource: CommandSource = {
  id: 'hand-swipe',
  start(run) {
    const t = (tracker ??= new HandTracker({ maxHands: 1 }));
    const detector = new SwipeDetector();
    const offStatus = t.onStatus((status) => {
      gestureUi.dispatch({ status });
      if (status.state === 'denied' || status.state === 'unavailable' || status.state === 'error') {
        toast(status.message, 'error', 6000);
        // Leave the setting on so the message stays visible in Settings; the person can switch it off and on to retry.
      }
    });
    const offFrame = t.onFrame((f) => {
      if (gestureUi.getState().paused) { detector.clear(); return; }
      const hand = f.hands[0];
      if (!hand) { detector.clear(); return; }
      let x = 0; let y = 0;
      for (const i of PALM) { x += hand[i]!.x; y += hand[i]!.y; }
      const dir = detector.push(x / PALM.length, y / PALM.length, f.t);
      if (!dir) return;
      const cmd: BrowserCommand = { type: dir === NEXT_TAB_IMAGE_DIRECTION ? 'nextTab' : 'previousTab' };
      run(cmd);
      gestureUi.dispatch({ lastGesture: cmd.type === 'nextTab' ? 'Swipe right: next tab' : 'Swipe left: previous tab' });
    });
    void t.start();
    return () => { offStatus(); offFrame(); t.stop(); };
  },
};

/**
 * Call once after boot. Turns the camera gesture source on or off whenever the setting changes.
 * Privacy: a saved "on" is reset to off at startup, so the camera never opens unless the person switches it on in this session.
 */
export function connectGestureControl(): () => void {
  if (settings.getState().handGestures) settings.dispatch({ handGestures: false });
  const apply = () => {
    const wanted = settings.getState().handGestures;
    if (wanted && !unregister) unregister = registerCommandSource(handSwipeSource);
    if (!wanted && unregister) { unregister(); unregister = null; gestureUi.dispatch({ status: { state: 'off' }, lastGesture: null, paused: false }); }
  };
  const off = settings.subscribe(apply);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && unregister) setGesturesPaused(!gestureUi.getState().paused);
  };
  addEventListener('keydown', onKey);
  return () => { off(); removeEventListener('keydown', onKey); };
}

/** Emergency pause: keeps the camera running but ignores all gestures. Also bound to the Escape key. */
export function setGesturesPaused(paused: boolean) {
  gestureUi.dispatch({ paused });
  toast(paused ? 'Gestures paused' : 'Gestures resumed', 'info', 1500);
}
