/** Browser-only glue between DOM images/canvases and the framework-free lib. */
import type { Mask, RGBAImage } from './lib/image';

export interface LoadedPhoto {
  /** Canvas holding the (possibly downsized) photo; usable as a CanvasImageSource. */
  canvas: HTMLCanvasElement;
  rgba: RGBAImage;
  name: string;
}

/** Decodes an image file (EXIF orientation applied by the browser) and caps its size. */
export async function loadPhoto(file: File, maxDim = 3200): Promise<LoadedPhoto> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const d = g.getImageData(0, 0, canvas.width, canvas.height);
  return { canvas, rgba: { width: d.width, height: d.height, data: d.data }, name: file.name };
}

export function rgbaToCanvas(img: RGBAImage): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png', quality = 0.9): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Görsel kodlanamadı.'))), type, quality));
}

/** Semi-transparent coloured overlay of a mask (drawn stretched over the photo). */
export function maskOverlay(m: Mask, rgba: [number, number, number, number] = [76, 141, 255, 110]): HTMLCanvasElement {
  const img = new ImageData(m.width, m.height);
  for (let i = 0; i < m.data.length; i++) {
    if (!m.data[i]) continue;
    img.data.set(rgba, i * 4);
  }
  const c = document.createElement('canvas');
  c.width = m.width;
  c.height = m.height;
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}
