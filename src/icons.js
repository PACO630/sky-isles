// Hand-drawn icon set (24x24 grid) shared by the DOM HUD (inline SVG) and in-world
// sprites (canvas Path2D), so the whole game uses one consistent style instead of emoji.
// Each part is a path: stroked by default; f = fill, eo = even-odd fill,
// hl = faint stroke in the icon colour, lt = light stroke drawn over a filled shape.

export const ICONS = {
  shard: [
    { d: 'M12 2.5 18.5 10 12 21.5 5.5 10Z', f: 1 },
    { d: 'M5.5 10h13M12 2.5 9.6 10 12 21.5 14.4 10Z', lt: 1 },
  ],
  island: [
    { d: 'M2.5 10.5Q12 7.5 21.5 10.5L14.5 19.5Q12 22 9.5 19.5Z', f: 1 },
    { d: 'M15.5 8.6V5.5' },
    { d: 'M15.5 1.8a2.1 2.1 0 1 1 0 4.2a2.1 2.1 0 1 1 0-4.2Z', f: 1 },
    { d: 'M6 12.2h5M9 15h4', lt: 1 },
  ],
  altar: [
    { d: 'M6.5 21.5h11M9 21.5V16h6v5.5' },
    { d: 'M12 8.2a3 3 0 1 1 0 6a3 3 0 1 1 0-6Z', f: 1 },
    { d: 'M12 2.2v2.6M5.4 5.2l1.8 1.8M18.6 5.2l-1.8 1.8M3.5 11.2H6M18 11.2h2.5' },
  ],
  book: [
    { d: 'M3.5 5.2Q8 3.6 12 5.8Q16 3.6 20.5 5.2V19Q16 17.4 12 19.6Q8 17.4 3.5 19Z' },
    { d: 'M12 5.8v13.8' },
    { d: 'M6.3 9q2.2-.6 3.6.3M6.3 12.4q2.2-.6 3.6.3M14.1 9.3q1.4-.9 3.6-.3', hl: 1 },
  ],
  home: [
    { d: 'M3.5 11.5 12 4l8.5 7.5' },
    { d: 'M6 10v10h12V10' },
    { d: 'M10.2 20v-5h3.6v5' },
  ],
  wave: [
    { d: 'M8 13V7.2M11 12V5M14 12V5.6M17 13.2V8.2' },
    { d: 'M8 12.6Q7 19.5 12.2 21Q17.6 21 17 13' },
    { d: 'M8 15.4 5.4 12.6' },
    { d: 'M3.6 4.8Q2.4 8 3.6 11.2M20.8 3.2Q22.4 6.2 21.4 9.4', hl: 1 },
  ],
  cheer: [
    { d: 'M11 4 12.9 10.1 19 12 12.9 13.9 11 20 9.1 13.9 3 12 9.1 10.1Z', f: 1 },
    { d: 'M19 2.5l.75 1.75 1.75.75-1.75.75L19 7.5l-.75-1.75L16.5 5l1.75-.75Z', f: 1 },
    { d: 'M19.5 16.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z', f: 1 },
  ],
  heart: [
    { d: 'M12 20.6C5.2 15.8 3 12.2 3 8.9 3 6.3 5 4.4 7.4 4.4c1.9 0 3.6 1.1 4.6 2.8 1-1.7 2.7-2.8 4.6-2.8C19 4.4 21 6.3 21 8.9c0 3.3-2.2 6.9-9 11.7Z', f: 1 },
    { d: 'M6.4 8.6Q6.8 6.9 8.4 6.7', lt: 1 },
  ],
  ping: [
    { d: 'M12 2.4C8.5 2.4 5.9 5 5.9 8.4 5.9 12.7 12 19.2 12 19.2s6.1-6.5 6.1-10.8C18.1 5 15.5 2.4 12 2.4ZM12 6.2a2.2 2.2 0 1 1 0 4.4a2.2 2.2 0 1 1 0-4.4Z', f: 1, eo: 1 },
    { d: 'M8 21.6h8' },
  ],
  smile: [
    { d: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z' },
    { d: 'M9 9.8v.6M15 9.8v.6' },
    { d: 'M8.4 14.2Q12 17.8 15.6 14.2' },
  ],
  jump: [{ d: 'M5.5 15.5 12 9l6.5 6.5' }],
  touch: [
    { d: 'M10.6 21V10.6q0-1.5 1.4-1.5t1.4 1.5V14l3.4.9q1.5.5 1.2 2l-.8 4.1' },
    { d: 'M7.6 9.2a5 5 0 0 1 8.8 0M5 7.6a8 8 0 0 1 14 0', hl: 1 },
  ],
  dice: [
    { d: 'M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5Z' },
    { d: 'M8.6 8.6h.01M15.4 15.4h.01M12 12h.01M15.4 8.6h.01M8.6 15.4h.01', w: 2.8 },
  ],
  sparkle: [{ d: 'M12 2.5 14 10l7.5 2-7.5 2-2 7.5-2-7.5-7.5-2L10 10Z', f: 1 }],
  rotate: [
    { d: 'M8.5 3.5h7A1.5 1.5 0 0 1 17 5v14a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19V5a1.5 1.5 0 0 1 1.5-1.5Z' },
    { d: 'M11 18h2', hl: 1 },
  ],
};

export function iconSvg(name, cls = 'ico') {
  const parts = (ICONS[name] || [])
    .map((p) => {
      if (p.f) return `<path d="${p.d}" fill="currentColor" stroke="none"${p.eo ? ' fill-rule="evenodd"' : ''}/>`;
      if (p.hl) return `<path d="${p.d}" stroke-opacity=".55" stroke-width="1.5"/>`;
      if (p.lt) return `<path d="${p.d}" stroke="#fff" stroke-opacity=".6" stroke-width="1.3"/>`;
      return `<path d="${p.d}"${p.w ? ` stroke-width="${p.w}"` : ''}/>`;
    })
    .join('');
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
}

export function drawIcon(ctx, name, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of ICONS[name] || []) {
    const path = new Path2D(p.d);
    if (p.f) {
      ctx.fill(path, p.eo ? 'evenodd' : 'nonzero');
    } else {
      ctx.globalAlpha = p.hl ? 0.55 : p.lt ? 0.6 : 1;
      ctx.strokeStyle = p.lt ? '#fff' : color;
      ctx.lineWidth = p.hl ? 1.5 : p.lt ? 1.3 : p.w || 2;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
