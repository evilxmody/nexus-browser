import type { HandLandmarker } from '@mediapipe/tasks-vision';

/**
 * Camera + MediaPipe hand tracking. This module only SEES: it turns camera frames into hand landmarks.
 * It never decides what a gesture means and never touches the browser (that is @nexus/gestures + commands.ts).
 *
 * Privacy: everything runs on this device. Video frames are never stored or sent anywhere. The only network use
 * is downloading the MediaPipe runtime and model files (see TRACKING_ASSETS).
 */

/** One normalized landmark: x and y are 0..1 across the camera image (image space, NOT mirrored), z is relative depth. */
export interface Landmark { x: number; y: number; z: number }
export interface HandFrame { /** milliseconds, monotonic (performance.now) */ t: number; hands: Landmark[][] }

export type TrackerStatus =
  | { state: 'off' }
  | { state: 'starting' }
  | { state: 'running' }
  | { state: 'denied'; message: string }
  | { state: 'unavailable'; message: string }
  | { state: 'error'; message: string };

/** Where the runtime and model are downloaded from. For fully offline use, copy them into apps/web/public and change these. */
export const TRACKING_ASSETS = {
  wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
  handModel: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
};

export interface HandTrackerOptions { maxHands: number; targetFps: number }
const DEFAULTS: HandTrackerOptions = { maxHands: 1, targetFps: 15 };

export class HandTracker {
  private status: TrackerStatus = { state: 'off' };
  private statusListeners = new Set<(s: TrackerStatus) => void>();
  private frameListeners = new Set<(f: HandFrame) => void>();
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private landmarker: HandLandmarker | null = null;
  private raf = 0;
  private lastVideoTime = -1;
  private lastRun = 0;
  private runId = 0;
  private readonly o: HandTrackerOptions;

  constructor(options: Partial<HandTrackerOptions> = {}) { this.o = { ...DEFAULTS, ...options }; }

  getStatus() { return this.status; }
  onStatus(l: (s: TrackerStatus) => void) { this.statusListeners.add(l); return () => void this.statusListeners.delete(l); }
  onFrame(l: (f: HandFrame) => void) { this.frameListeners.add(l); return () => void this.frameListeners.delete(l); }
  private set(s: TrackerStatus) { this.status = s; this.statusListeners.forEach((l) => l(s)); }

  /** Asks for the camera. Call this ONLY from an explicit user action (e.g. switching the setting on). Never throws. */
  async start(): Promise<void> {
    if (this.status.state === 'starting' || this.status.state === 'running') return;
    const id = ++this.runId;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.set({ state: 'unavailable', message: 'This browser or page cannot use the camera (it needs https or localhost).' });
      return;
    }
    this.set({ state: 'starting' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' }, audio: false,
      });
      if (id !== this.runId) { stream.getTracks().forEach((t) => t.stop()); return; }
      this.stream = stream;
    } catch (e) {
      if (id !== this.runId) return;
      const name = e instanceof DOMException ? e.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') this.set({ state: 'denied', message: 'Camera permission was denied. Allow it in the browser address bar to use hand gestures.' });
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') this.set({ state: 'unavailable', message: 'No camera was found.' });
      else this.set({ state: 'error', message: 'The camera could not be started (is another app using it?).' });
      return;
    }
    try {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(TRACKING_ASSETS.wasmBase);
      const make = (delegate: 'GPU' | 'CPU') => HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: TRACKING_ASSETS.handModel, delegate },
        runningMode: 'VIDEO', numHands: this.o.maxHands,
      });
      // Phones usually do better on the GPU; some cannot, so fall back to the CPU instead of failing.
      const landmarker = await make('GPU').catch(() => make('CPU'));
      if (id !== this.runId) { landmarker.close(); return; }
      this.landmarker = landmarker;
      // The video element is never shown. It exists only so MediaPipe can read frames.
      const video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.setAttribute('aria-hidden', 'true');
      video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0';
      document.body.appendChild(video);
      video.srcObject = this.stream;
      await video.play();
      if (id !== this.runId) { video.remove(); return; }
      this.video = video;
      this.lastVideoTime = -1;
      this.set({ state: 'running' });
      this.loop();
    } catch (e) {
      if (id !== this.runId) return;
      this.release();
      this.set({ state: 'error', message: 'Hand tracking could not load. Check your internet connection (the model is downloaded once) and try again.' });
      console.error('[nexus] hand tracker failed to start', e);
    }
  }

  /** Stops the camera completely (the camera light goes off) and frees the model. Safe to call any time. */
  stop() {
    this.runId++;
    this.release();
    this.set({ state: 'off' });
  }

  private release() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video.remove(); this.video = null; }
    try { this.landmarker?.close(); } catch { /* already closed */ }
    this.landmarker = null;
  }

  private loop = () => {
    const v = this.video; const lm = this.landmarker;
    if (!v || !lm) return;
    const now = performance.now();
    if (document.visibilityState === 'visible' && v.readyState >= 2 && v.currentTime !== this.lastVideoTime
      && now - this.lastRun >= 1000 / this.o.targetFps) {
      this.lastVideoTime = v.currentTime; this.lastRun = now;
      try {
        const r = lm.detectForVideo(v, now);
        const hands = r.landmarks.map((h) => h.map((p) => ({ x: p.x, y: p.y, z: p.z })));
        this.frameListeners.forEach((l) => l({ t: now, hands }));
      } catch (e) {
        console.error('[nexus] hand tracking frame failed', e);
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };
}
