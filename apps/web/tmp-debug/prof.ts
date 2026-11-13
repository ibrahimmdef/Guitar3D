import fs from 'node:fs';
import jpeg from 'jpeg-js';
import { luminance, sampleGray } from '../src/guitar-setup/lib/image';
const j = jpeg.decode(fs.readFileSync(process.argv[2]), { useTArray: true, maxMemoryUsageInMB: 1024 });
const g = luminance({ width: j.width, height: j.height, data: new Uint8ClampedArray(j.data.buffer) });
const [x0, y0, x1, y1] = process.argv.slice(3, 7).map(Number);
for (const off of [-28, -20, 20, 28]) {
  const n = Math.round(Math.hypot(x1 - x0, y1 - y0));
  const prof: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n; let s = 0;
    for (let d = -2; d <= 2; d++) s += sampleGray(g, x0 + (x1 - x0) * t + (off + d) * (1 + 0.3 * t), y0 + (y1 - y0) * t);
    prof.push(s / 5);
  }
  const hp = prof.map((v, i) => v - prof.slice(Math.max(0, i - 7), i + 8).reduce((a, b) => a + b, 0) / prof.slice(Math.max(0, i - 7), i + 8).length);
  const pk: number[] = [];
  for (let i = 3; i < n - 4; i++) if (hp[i] > 10 && hp[i] === Math.max(...hp.slice(i - 3, i + 4))) pk.push(Math.round(y0 + (y1 - y0) * (i / n)));
  console.log(off, pk.join(' '));
}
