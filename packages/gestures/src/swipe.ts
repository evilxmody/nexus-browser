/**
 * Pure swipe detector. It knows nothing about cameras or MediaPipe: feed it the horizontal hand position
 * (0..1 across the camera image) with a timestamp, and it tells you when a fast sideways swipe happened.
 * Kept in @nexus/gestures so it can be unit tested without a camera.
 */
export type SwipeDirection = 'left' | 'right';

export interface SwipeOptions {
  /** Only samples newer than this many ms are considered. */
  windowMs: number;
  /** Minimum horizontal travel (fraction of image width) inside the window. */
  minTravel: number;
  /** Horizontal travel must be at least this many times the vertical travel. */
  minHorizontalRatio: number;
  /** After a swipe, ignore new swipes for this long (stops one wave from firing twice). */
  cooldownMs: number;
  /** A gap longer than this between samples (hand lost) clears the history. */
  maxGapMs: number;
}

export const DEFAULT_SWIPE_OPTIONS: SwipeOptions = {
  windowMs: 450, minTravel: 0.25, minHorizontalRatio: 2, cooldownMs: 900, maxGapMs: 250,
};

interface Sample { x: number; y: number; t: number }

export class SwipeDetector {
  private samples: Sample[] = [];
  private lastFire = -Infinity;
  private readonly o: SwipeOptions;
  constructor(options: Partial<SwipeOptions> = {}) { this.o = { ...DEFAULT_SWIPE_OPTIONS, ...options }; }

  /** Call when no hand is visible. */
  clear() { this.samples = []; }

  /**
   * Returns the direction in IMAGE space: 'left' means x decreased (hand moved toward the left edge of the image).
   * With an un-mirrored webcam image that is the USER's right. The caller decides how to map it.
   */
  push(x: number, y: number, t: number): SwipeDirection | null {
    const last = this.samples[this.samples.length - 1];
    if (last && t - last.t > this.o.maxGapMs) this.samples = [];
    if (last && t < last.t) this.samples = [];
    this.samples.push({ x, y, t });
    while (this.samples.length > 1 && t - this.samples[0]!.t > this.o.windowMs) this.samples.shift();
    if (t - this.lastFire < this.o.cooldownMs || this.samples.length < 3) return null;

    const first = this.samples[0]!;
    const dx = x - first.x;
    const dy = y - first.y;
    if (Math.abs(dx) < this.o.minTravel) return null;
    if (Math.abs(dx) < Math.abs(dy) * this.o.minHorizontalRatio) return null;
    // Mostly one direction: reject back-and-forth shaking.
    let wrong = 0;
    for (let i = 1; i < this.samples.length; i++) {
      if (Math.sign(this.samples[i]!.x - this.samples[i - 1]!.x) === -Math.sign(dx)) wrong++;
    }
    if (wrong > (this.samples.length - 1) * 0.25) return null;

    this.lastFire = t;
    this.samples = [];
    return dx < 0 ? 'left' : 'right';
  }
}
