import * as THREE from 'three';
import type { GuitarFinish } from '@guitar3d/shared';

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
