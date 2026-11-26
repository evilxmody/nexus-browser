import { useEffect, useRef, useState } from 'react';
import { useStore } from '../hooks';
import { settings } from '../runtime';
import { gestureUi, getTracker } from '../gestureControl';

/**
 * Small debug view of what the hand tracker sees: the camera picture (mirrored like a selfie), hand dots, and live counters.
 * It only draws on this screen. Nothing is recorded or sent. Hide it with the button in Settings > Gesture control.
 */
export function GesturePreview() {
  const { handGestures } = useStore(settings);
  const ui = useStore(gestureUi);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState('');
  const active = handGestures && ui.preview && ui.status.state === 'running';

  useEffect(() => {
    if (!active) return;
    let raf = 0; let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 66) return; // ~15 drawings per second is plenty
      last = now;
      const t = getTracker(); const c = canvas.current; const v = t?.getVideo();
      const ctx = c?.getContext('2d');
      if (!t || !c || !v || !ctx) return;
      const w = c.width; const h = c.height;
      ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); // mirror so it behaves like a mirror
      try { ctx.drawImage(v, 0, 0, w, h); } catch { /* video not ready yet */ }
      const hand = t.lastFrame?.hands[0];
      if (hand) { ctx.fillStyle = '#35e0a1'; for (const p of hand) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 3, 0, 7); ctx.fill(); } }
      ctx.restore();
      const s = t.stats;
      setText(`${s.delegate} ${s.videoSize} frames ${s.frames} hand ${hand ? 'YES' : 'no'} (${s.handFrames}) err ${s.errors}${s.lastError ? ' ' + s.lastError : ''}`);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;
  return (
    <div style={{ position: 'fixed', right: 8, bottom: 60, zIndex: 50, width: 168, background: '#000c', border: '1px solid #444', borderRadius: 8, padding: 4, pointerEvents: 'none' }}
      aria-hidden="true">
      <canvas ref={canvas} width={160} height={120} style={{ width: 160, height: 120, display: 'block', borderRadius: 6 }} />
      <div style={{ font: '10px/1.3 monospace', color: '#cfd', wordBreak: 'break-word', marginTop: 2 }}>{text}</div>
    </div>
  );
}
