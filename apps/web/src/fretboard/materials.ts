import * as THREE from 'three';
import type { GuitarFinish, GuitarProfile } from '@guitar3d/shared';

/** The one accent colour of the app: the note being played now. */
export const ACCENT = '#F5B83D';
export const NEXT_OUTLINE = '#F4F1EA';

export interface GuitarMaterials {
  top: THREE.MeshPhysicalMaterial;
  sides: THREE.MeshPhysicalMaterial;
  back: THREE.MeshPhysicalMaterial;
  neck: THREE.MeshPhysicalMaterial;
  headstock: THREE.MeshPhysicalMaterial;
  binding: THREE.MeshPhysicalMaterial;
  pickguard: THREE.MeshPhysicalMaterial;
  bridge: THREE.MeshPhysicalMaterial;
  bone: THREE.MeshPhysicalMaterial;
  pin: THREE.MeshPhysicalMaterial;
  chrome: THREE.MeshPhysicalMaterial;
  fret: THREE.MeshPhysicalMaterial;
  interior: THREE.MeshBasicMaterial;
  hole: THREE.MeshBasicMaterial;
  dot: THREE.MeshPhysicalMaterial;
  inlay: THREE.MeshPhysicalMaterial;
  plainString: THREE.MeshPhysicalMaterial;
  woundString: THREE.MeshPhysicalMaterial;
}

/** Satin lacquer: low clearcoat, soft sheen; gloss 0..1 tightens the highlight. */
function satin(color: string, gloss: number) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.62 - gloss * 0.45,
    metalness: 0,
    clearcoat: 0.1 + gloss * 0.8,
    clearcoatRoughness: 0.55 - gloss * 0.45,
    specularIntensity: 0.6 + gloss * 0.4,
    envMapIntensity: 0.5 + gloss * 0.5,
  });
}

export function createMaterials(finish: GuitarFinish, wound: THREE.Texture): GuitarMaterials {
  const g = Math.min(1, Math.max(0, finish.gloss));
  const chromeColor = finish.hardware === 'gold' ? '#d8b56a' : finish.hardware === 'black' ? '#1c1c1e' : '#e4e6ea';
  return {
    top: satin(finish.top, g),
    sides: satin(finish.sides, g),
    back: satin(finish.back, g),
    neck: satin(finish.neck, g),
    headstock: satin(finish.headstock, g),
    binding: new THREE.MeshPhysicalMaterial({ color: finish.binding ?? finish.top, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
    pickguard: new THREE.MeshPhysicalMaterial({ color: finish.pickguard ?? '#050505', roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.35 }),
    bridge: new THREE.MeshPhysicalMaterial({ color: finish.bridge, roughness: 0.6, specularIntensity: 0.5 }),
    bone: new THREE.MeshPhysicalMaterial({ color: '#efe9d8', roughness: 0.42, clearcoat: 0.2 }),
    pin: new THREE.MeshPhysicalMaterial({ color: '#f3f1ea', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 }),
    chrome: new THREE.MeshPhysicalMaterial({ color: chromeColor, metalness: 1, roughness: 0.14 }),
    fret: new THREE.MeshPhysicalMaterial({ color: '#d6d3cc', metalness: 1, roughness: 0.26 }),
    interior: new THREE.MeshBasicMaterial({ color: '#1d140e' }),
    hole: new THREE.MeshBasicMaterial({ color: '#070605', side: THREE.BackSide }),
    dot: new THREE.MeshPhysicalMaterial({ color: '#f1efe8', roughness: 0.3 }),
    inlay: pearlMaterial(),
    plainString: new THREE.MeshPhysicalMaterial({ color: '#d9dadc', metalness: 1, roughness: 0.22 }),
    woundString: new THREE.MeshPhysicalMaterial({
      color: '#c7aa7c', metalness: 1, roughness: 0.32, bumpMap: wound, bumpScale: 1.4,
    }),
  };
}

/** Helical winding stripes for wound strings (v runs along the string). */
export function woundTexture() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 64);
  for (let i = 0; i <= 8; i++) grd.addColorStop(i / 8, i % 2 ? '#000' : '#fff');
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const labelCache = new Map<string, THREE.CanvasTexture>();

/**
 * Glyph texture for markers and fret numbers: white fill (red channel) inside a dark round stroke
 * (alpha), so shaders can draw a crisp number with a halo: fill = tex.r, outline = tex.a.
 * Drawn with the system font (no font downloads), 256 px with mipmaps for crisp minification.
 */
export function labelTexture(text: string) {
  const hit = labelCache.get(text);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const size = text.length > 1 ? 128 : 150;
  g.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const m = g.measureText(text);
  const dy = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  g.lineJoin = 'round';
  g.lineWidth = 30;
  g.strokeStyle = '#000';
  g.strokeText(text, 128, 128 + dy);
  g.fillStyle = '#fff';
  g.fillText(text, 128, 128 + dy);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.premultiplyAlpha = false;
  labelCache.set(text, t);
  return t;
}

/* ------------------------------------------------------------------ procedural wood */

/** Small deterministic PRNG so every wood texture looks the same on every load. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, k: number, alpha = 1) {
  const c = new THREE.Color(hex);
  const f = (v: number) => Math.round(Math.min(1, Math.max(0, v * k)) * 255);
  return `rgba(${f(c.r)},${f(c.g)},${f(c.b)},${alpha})`;
}

/** Grain recipe per wood: line count, contrast, waviness, pores, flame. */
const GRAIN: Record<string, { lines: number; dark: number; light: number; wave: number; width: [number, number]; pores: number; flame: number }> = {
  spruce: { lines: 150, dark: 0.82, light: 1.06, wave: 1.2, width: [0.6, 1.6], pores: 0, flame: 0 },
  cedar: { lines: 110, dark: 0.78, light: 1.08, wave: 1.6, width: [0.8, 2.4], pores: 0, flame: 0 },
  mahogany: { lines: 70, dark: 0.8, light: 1.12, wave: 0.8, width: [2, 7], pores: 900, flame: 0 },
  rosewood: { lines: 90, dark: 0.62, light: 1.25, wave: 3.5, width: [1, 6], pores: 600, flame: 0 },
  maple: { lines: 60, dark: 0.9, light: 1.06, wave: 0.6, width: [1, 3], pores: 0, flame: 0.12 },
  ebony: { lines: 40, dark: 0.75, light: 1.35, wave: 2, width: [0.5, 2], pores: 0, flame: 0 },
  walnut: { lines: 80, dark: 0.7, light: 1.15, wave: 3, width: [1, 5], pores: 500, flame: 0 },
  alder: { lines: 60, dark: 0.86, light: 1.08, wave: 2, width: [1, 4], pores: 0, flame: 0 },
};

/** Draws `wood` grain (running along canvas x) over the base colour into a 2D context. */
function drawGrain(g: CanvasRenderingContext2D, w: number, h: number, wood: string, color: string, seed: number) {
  const spec = GRAIN[wood];
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  if (!spec) return;
  const r = rng(seed);
  for (let i = 0; i < spec.lines; i++) {
    const y0 = r() * h;
    const lw = spec.width[0] + r() * (spec.width[1] - spec.width[0]);
    const dark = r() < 0.7;
    g.strokeStyle = shade(color, dark ? spec.dark : spec.light, 0.18 + r() * 0.3);
    g.lineWidth = lw * (h / 512);
    const ph = r() * Math.PI * 2;
    const f = 1 + r() * 2;
    g.beginPath();
    for (let x = 0; x <= w; x += 16) {
      const y = y0 + Math.sin((x / w) * Math.PI * 2 * f + ph) * spec.wave * (h / 512) * 3;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  if (spec.flame > 0) {
    for (let x = 0; x < w; x += 6 + r() * 10) {
      g.fillStyle = shade(color, r() < 0.5 ? 0.85 : 1.15, spec.flame);
      g.fillRect(x, 0, 3 + r() * 5, h);
    }
  }
  for (let i = 0; i < spec.pores; i++) {
    g.fillStyle = shade(color, 0.55, 0.35);
    g.fillRect(r() * w, r() * h, 2 + r() * 6, 1);
  }
}

const woodCache = new Map<string, THREE.CanvasTexture>();

/**
 * Tileable wood texture (grain along u), tinted with the finish colour, 512² with mipmaps. Each call
 * returns its own Texture object (sharing the canvas) so callers can set repeat/rotation freely.
 */
export function woodTexture(wood: string, color: string, seed = 1) {
  const key = `${wood}|${color}|${seed}`;
  let base = woodCache.get(key);
  if (!base) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    drawGrain(c.getContext('2d')!, 512, 512, wood, color, seed);
    base = new THREE.CanvasTexture(c);
    base.colorSpace = THREE.SRGBColorSpace;
    woodCache.set(key, base);
  }
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export function hasGrain(wood: string | undefined): wood is string {
  return !!wood && wood in GRAIN;
}

/**
 * Body top texture over `body.bounds` (the bodyTop uv contract): wood grain and, for a sunburst,
 * an edge colour that follows the body shape (drawn as progressively inset outlines).
 */
export function topTexture(outline: [number, number][], bounds: { minX: number; maxX: number; minY: number; maxY: number }, finish: GuitarFinish) {
  const W = 1024;
  const H = Math.round((W * (bounds.maxY - bounds.minY)) / (bounds.maxX - bounds.minX));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // grain tiles every ~40 cm along the body
  const tile = document.createElement('canvas');
  tile.width = tile.height = 512;
  drawGrain(tile.getContext('2d')!, 512, 512, hasGrain(finish.topWood) ? finish.topWood : 'none', finish.top, 7);
  const px = W / (bounds.maxX - bounds.minX);
  for (let x = 0; x < W; x += 40 * px) for (let y = 0; y < H; y += 40 * px) g.drawImage(tile, x, y, 40 * px + 1, 40 * px + 1);
  if (finish.sunburstEdge) {
    // centroid-scaled outlines from the edge inwards, each a little more transparent
    let cx = 0;
    let cy = 0;
    for (const [x, y] of outline) {
      cx += x;
      cy += y;
    }
    cx /= outline.length;
    cy /= outline.length;
    const toPx = (x: number, y: number): [number, number] => [(x - bounds.minX) * px, H - (y - bounds.minY) * px];
    const steps = 28;
    for (let i = 0; i < steps; i++) {
      const k = 1 - (i / steps) * 0.42;
      const a = Math.pow(1 - i / steps, 2.2) * 0.22;
      g.beginPath();
      outline.forEach(([x, y], j) => {
        const [u, v] = toPx(cx + (x - cx) * k, cy + (y - cy) * k);
        if (j) g.lineTo(u, v);
        else g.moveTo(u, v);
      });
      g.closePath();
      g.lineWidth = (0.42 / steps) * 30 * px;
      g.strokeStyle = shade(finish.sunburstEdge, 1, Math.min(1, a * 4));
      g.stroke();
    }
    // solid band at the very edge
    g.beginPath();
    outline.forEach(([x, y], j) => {
      const [u, v] = toPx(x, y);
      if (j) g.lineTo(u, v);
      else g.moveTo(u, v);
    });
    g.closePath();
    g.lineWidth = 2.6 * px;
    g.strokeStyle = finish.sunburstEdge;
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Procedural rosette ring (soundhole edge at ROSETTE_INNER of the radius) for profiles without a photo. */
export function rosetteTexture(wood: string | undefined) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const R = S / 2;
  const ring = (r0: number, r1: number, color: string) => {
    g.beginPath();
    g.arc(R, R, r1 * R, 0, Math.PI * 2);
    g.arc(R, R, r0 * R, 0, Math.PI * 2, true);
    g.fillStyle = color;
    g.fill();
  };
  const dark = wood === 'mahogany' ? '#1c0f08' : '#140d09';
  ring(0.78, 0.8, '#efe6d0');
  ring(0.8, 0.83, dark);
  ring(0.86, 0.94, dark);
  // herringbone-ish band between two thin cream lines
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    g.strokeStyle = i % 2 ? '#d8c9a6' : '#2a1a10';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(R + Math.cos(a) * 0.865 * R, R + Math.sin(a) * 0.865 * R);
    g.lineTo(R + Math.cos(a + 0.03) * 0.935 * R, R + Math.sin(a + 0.03) * 0.935 * R);
    g.stroke();
  }
  ring(0.855, 0.865, '#efe6d0');
  ring(0.935, 0.945, '#efe6d0');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Mother-of-pearl: white with a thin-film iridescent sheen under a clear coat. */
export function pearlMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: '#f4f1ea', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08,
    iridescence: 0.9, iridescenceIOR: 1.6, iridescenceThicknessRange: [240, 620], sheen: 0.4, sheenColor: new THREE.Color('#d9e6ff'),
    polygonOffset: true, polygonOffsetFactor: -2,
  });
}

/** Nylon treble strings: translucent, non-metallic. */
export function nylonMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: '#efe8d8', roughness: 0.3, clearcoat: 0.6, transmission: 0, metalness: 0 });
}

/** Repeat of a tiling 512² wood texture so it covers `cm` × `cmV` (one tile ≈ 40 cm). */
function grainMap(wood: string, color: string, seed: number, repeatU: number, repeatV: number, rotate = false) {
  const t = woodTexture(wood, color, seed);
  t.repeat.set(repeatU, repeatV);
  if (rotate) {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
  }
  return t;
}

/**
 * Adds the profile-specific looks to freshly created materials: procedural wood grain, the body top
 * (wood + sunburst, or the bodyTop photo when given), nylon strings. Returns the textures it made so
 * the caller can dispose of them.
 */
export function decorateMaterials(m: GuitarMaterials, p: GuitarProfile, bodyTopPhoto?: THREE.Texture | null) {
  const f = p.finish;
  const made: THREE.Texture[] = [];
  const use = (mat: THREE.MeshPhysicalMaterial, t: THREE.Texture) => {
    mat.map = t;
    mat.color.set('#ffffff');
    mat.needsUpdate = true;
    made.push(t);
  };
  if (bodyTopPhoto) {
    m.top.map = bodyTopPhoto;
    m.top.color.set('#ffffff');
  } else if (hasGrain(f.topWood) || f.sunburstEdge) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of p.body.outline) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    use(m.top, topTexture(p.body.outline, p.body.bounds ?? { minX, maxX, minY, maxY }, f));
  }
  // back: planar uv in cm; sides: u = length / 10 cm, v = 0..1 over the depth
  if (hasGrain(f.backWood)) {
    use(m.back, grainMap(f.backWood, f.back, 3, 1 / 40, 1 / 40));
    use(m.sides, grainMap(f.backWood, f.sides, 4, 10 / 40, p.body.depthCm / 40));
  }
  // neck: v runs along the neck in decimetres, so the grain is turned
  if (hasGrain(f.neckWood)) use(m.neck, grainMap(f.neckWood, f.neck, 5, 0.25, 10 / 40, true));
  if (p.strings === 'nylon' || (p.kind === 'classical' && p.strings !== 'steel')) {
    m.plainString.dispose();
    m.plainString = nylonMaterial();
    m.woundString.color.set('#d4d6da');
  }
  return made;
}

/** Fretboard material colour map when there is no fretboard photo (u along the board, v across). */
export function fretboardWoodMap(p: GuitarProfile) {
  const wood = hasGrain(p.finish.fretboardWood) ? p.finish.fretboardWood : 'rosewood';
  return grainMap(wood, p.finish.fretboard, 9, 1.1, 0.14);
}
