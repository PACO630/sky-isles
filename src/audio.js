// Tiny synthesized chimes, no audio files to download.
let ctx = null;

export function initAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

export function chime(notes, { dur = 0.7, gap = 0.08, vol = 0.1, type = 'sine' } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    const t = t0 + i * gap;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  });
}

export const SFX = {
  shard: () => chime([1046.5, 1318.5, 1568], { dur: 0.6, gap: 0.06, vol: 0.08, type: 'triangle' }),
  altar: () => chime([523.25, 659.25, 783.99, 1046.5, 1318.5], { dur: 1.8, gap: 0.12, vol: 0.09 }),
  join: () => chime([784, 1046.5], { dur: 0.5, gap: 0.1, vol: 0.06 }),
  deny: () => chime([392, 311], { dur: 0.35, gap: 0.1, vol: 0.06, type: 'triangle' }),
  whoosh: () => chime([220], { dur: 0.4, vol: 0.03, type: 'sine' }),
};
