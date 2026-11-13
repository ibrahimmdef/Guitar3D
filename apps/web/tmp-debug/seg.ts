import fs from 'node:fs';
import jpeg from 'jpeg-js';
import { downscale, type Mask, type RGBAImage } from '../src/guitar-setup/lib/image';
import { segmentGuitar, sampleBackground, maskArea } from '../src/guitar-setup/lib/segment';
export function load(f: string): RGBAImage {
  const j = jpeg.decode(fs.readFileSync(f), { useTArray: true, maxMemoryUsageInMB: 1024 });
  return { width: j.width, height: j.height, data: new Uint8ClampedArray(j.data.buffer, j.data.byteOffset, j.data.length) };
}
export function dump(img: RGBAImage, m: Mask | null, out: string, pts: [number, number][] = []) {
  const b = Buffer.alloc(img.width * img.height * 3);
  for (let i = 0; i < img.width * img.height; i++) {
    const on = m ? m.data[i] : 0;
    b[i * 3] = on ? img.data[i * 4] * 0.4 + 150 : img.data[i * 4];
    b[i * 3 + 1] = on ? img.data[i * 4 + 1] * 0.4 + 60 : img.data[i * 4 + 1];
    b[i * 3 + 2] = on ? img.data[i * 4 + 2] * 0.4 : img.data[i * 4 + 2];
  }
  for (const [x, y] of pts) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const i = (Math.round(y) + dy) * img.width + Math.round(x) + dx;
    if (i >= 0 && i < img.width * img.height) { b[i * 3] = 0; b[i * 3 + 1] = 255; b[i * 3 + 2] = 0; }
  }
  fs.writeFileSync(out, Buffer.concat([Buffer.from(`P6\n${img.width} ${img.height}\n255\n`), b]));
}
if (process.argv[1].endsWith('seg.ts')) {
  const img = load(process.argv[2]);
  const small = downscale(img, 700);
  console.log('thr0');
  const t0 = Date.now();
  const seg = segmentGuitar(small.image, process.env.T ? { threshold: Number(process.env.T) } : {}); console.log("fg", seg.foreground.map((c) => c.map(Math.round).join(",")).join(" | ")); console.log(seg.palette.map((c) => c.map(Math.round).join(",")).join(" | "));
  console.log('thr', seg.threshold, 'area', seg.area / (small.image.width * small.image.height), Date.now() - t0, 'ms');
  dump(small.image, seg.mask, process.argv[3]);
}
