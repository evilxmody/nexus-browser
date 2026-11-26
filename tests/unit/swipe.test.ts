import { describe, expect, it } from 'vitest';
import { SwipeDetector } from '@nexus/gestures';

/** Feeds a straight-line hand path: from (x0,y0) to (x1,y1) over `ms`, sampled every 33 ms (~30 fps). */
function run(d: SwipeDetector, x0: number, x1: number, ms: number, y0 = 0.5, y1 = 0.5, startT = 0) {
  const out: (string | null)[] = [];
  for (let t = 0; t <= ms; t += 33) {
    const k = t / ms;
    out.push(d.push(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, startT + t));
  }
  return out.filter(Boolean);
}

describe('SwipeDetector', () => {
  it('detects a fast swipe toward the left of the image', () => expect(run(new SwipeDetector(), 0.8, 0.4, 300)).toEqual(['left']));
  it('detects a fast swipe toward the right of the image', () => expect(run(new SwipeDetector(), 0.2, 0.6, 300)).toEqual(['right']));
  it('ignores slow drifting', () => expect(run(new SwipeDetector(), 0.8, 0.4, 3000)).toEqual([]));
  it('ignores small movements', () => expect(run(new SwipeDetector(), 0.5, 0.6, 300)).toEqual([]));
  it('ignores mostly vertical movement', () => expect(run(new SwipeDetector(), 0.5, 0.3, 300, 0.2, 0.9)).toEqual([]));
  it('fires once per swipe (cooldown), then again after the cooldown', () => {
    const d = new SwipeDetector();
    expect(run(d, 0.8, 0.4, 300, 0.5, 0.5, 0)).toEqual(['left']);
    expect(run(d, 0.8, 0.4, 300, 0.5, 0.5, 400)).toEqual([]);
    expect(run(d, 0.8, 0.4, 300, 0.5, 0.5, 2000)).toEqual(['left']);
  });
  it('clears history when the hand disappears', () => {
    const d = new SwipeDetector();
    d.push(0.9, 0.5, 0); d.push(0.85, 0.5, 33);
    d.clear();
    expect(d.push(0.4, 0.5, 66)).toBeNull();
  });
});
