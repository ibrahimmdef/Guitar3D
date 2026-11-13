/** Size the UI was designed for. */
export const DESIGN_WIDTH = 1440;
export const DESIGN_HEIGHT = 860;
export const ZOOM_STEP = 0.1;

/**
 * Page zoom for a window content size: the design size scaled to fit (the smaller of the width and
 * height ratios), times the user's own Ctrl +/− adjustment, kept within 0.75–2.5 and rounded.
 */
export function fitZoom(width: number, height: number, user = 1): number {
  const fit = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const z = Math.min(2.5, Math.max(0.75, fit * user));
  return Math.round(z * 100) / 100;
}
