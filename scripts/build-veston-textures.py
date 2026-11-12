#!/usr/bin/env python3
"""Builds the 3D textures for the Veston dreadnought from assets/photos/front-neck.jpg.

The photo is taken at a slight angle, so a single 4-corner homography misplaces
the frets by up to ~80 px. Instead every fret wire was measured by hand in the
photo and the fretboard is warped piecewise between consecutive frets, so the
photographed fret wires land exactly on the 12-TET positions used by the 3D neck.
The photographed strings are kept: they sit right under the 3D strings and read as
their shadows, while inpainting them damaged the pearl inlays.

Run: python3 scripts/build-veston-textures.py   (needs Pillow)
"""
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/photos/front-neck.jpg"
OUT = ROOT / "apps/web/public/guitar"

# --- fretboard measurements (image pixels, photo is 1512x2016, neck pointing up) ---
NUT_Y = 622.7
# Fret wire centre rows, fret 1..20.
FRET_Y = [741, 847, 945, 1032, 1114, 1195, 1270, 1337, 1395, 1450,
          1507, 1556, 1602, 1645, 1690, 1727, 1762, 1795, 1827, 1860]
# Fret wires tilt: left (low E) end sits lower than the right end, growing towards the body.
SLANT_AT_FRET20 = 24.0
# Fretboard edges incl. binding. Low E edge is on the left of the photo.
LEFT_EDGE = [(NUT_Y, 699.0), (1556, 683.0), (1860, 681.7)]
RIGHT_EDGE_X = 826.7
PHOTO_FRET = 20

# --- headstock (image pixels): side edges from the nut (first point) to the top corner (last) ---
HEAD_LEFT = [(698, 603), (668, 560), (642, 505), (630, 300), (621, 77)]   # low E side
HEAD_RIGHT = [(829, 603), (838, 560), (846, 505), (845, 300), (838, 95)]  # high e side
HEAD_TUNERS_LEFT_Y = [220, 320, 435]
HEAD_TUNERS_RIGHT_Y = [235, 335, 440]
PX_PER_CM_ACROSS = 128.0 / 4.3        # nut width 4.3 cm spans 128 px
ALONG_FORESHORTENING = 1.07            # headstock leans away from the camera


def lerp(a, b, t):
    return a + (b - a) * t


def left_edge(y):
    pts = LEFT_EDGE
    if y <= pts[0][0]:
        return pts[0][1]
    for (y0, x0), (y1, x1) in zip(pts, pts[1:]):
        if y <= y1:
            return lerp(x0, x1, (y - y0) / (y1 - y0))
    return pts[-1][1]


def bilinear(px, w, h, x, y):
    x = min(max(x, 0), w - 1.001)
    y = min(max(y, 0), h - 1.001)
    x0, y0 = int(x), int(y)
    fx, fy = x - x0, y - y0
    out = []
    for c in range(3):
        a = px[x0, y0][c] * (1 - fx) + px[x0 + 1, y0][c] * fx
        b = px[x0, y0 + 1][c] * (1 - fx) + px[x0 + 1, y0 + 1][c] * fx
        out.append(int(a * (1 - fy) + b * fy))
    return tuple(out)


def build_fretboard(img, out_w=2048, out_h=256):
    w, h = img.size
    px = img.load()
    ys = [NUT_Y] + FRET_Y
    total = 1 - 2 ** (-PHOTO_FRET / 12)
    res = Image.new("RGB", (out_w, out_h))
    rp = res.load()
    for i in range(out_w):
        # physical position along the board -> fractional fret number
        u = (i + 0.5) / out_w
        f = -12 * math.log2(1 - u * total)
        n = min(int(f), PHOTO_FRET - 1)
        yc = lerp(ys[n], ys[n + 1], f - n)
        slant = SLANT_AT_FRET20 * (yc - NUT_Y) / (FRET_Y[-1] - NUT_Y)
        xl, yl = left_edge(yc), yc + slant / 2
        xr, yr = RIGHT_EDGE_X, yc - slant / 2
        for j in range(out_h):
            v = (j + 0.5) / out_h  # top row = low E edge
            rp[i, j] = bilinear(px, w, h, lerp(xl, xr, v), lerp(yl, yr, v))
    return res


def side_at(pts, t):
    """Point on a side polyline at parameter t (0 = nut row, 1 = top), interpolated by y."""
    y = lerp(pts[0][1], pts[-1][1], t)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if y1 <= y <= y0:
            return lerp(x0, x1, (y0 - y) / (y0 - y1)), y
    return pts[-1]


def build_headstock(img, out_w=512, out_h=1024):
    """Straightens the headstock (the photo leans) into a symmetric texture: rows = along, cols = across."""
    w, h = img.size
    px = img.load()
    res = Image.new("RGB", (out_w, out_h))
    rp = res.load()
    for j in range(out_h):
        t = 1 - (j + 0.5) / out_h  # top row of the image = tip of the headstock
        xl, yl = side_at(HEAD_LEFT, t)
        xr, yr = side_at(HEAD_RIGHT, t)
        for i in range(out_w):
            s = 0.02 + 0.96 * (i + 0.5) / out_w  # left column = low E side (2% inset avoids wall bleed)
            rp[i, j] = bilinear(px, w, h, lerp(xl, xr, s), lerp(yl, yr, s))

    s_along = PX_PER_CM_ACROSS / ALONG_FORESHORTENING
    length = ((HEAD_LEFT[0][1] - HEAD_LEFT[-1][1]) + (HEAD_RIGHT[0][1] - HEAD_RIGHT[-1][1])) / 2 / s_along
    profile = []
    for k in range(21):
        t = k / 20
        xl, _ = side_at(HEAD_LEFT, t)
        xr, _ = side_at(HEAD_RIGHT, t)
        profile.append([round(t * length, 3), round((xr - xl) / 2 / PX_PER_CM_ACROSS, 3)])

    def along(pts, y):
        return round((pts[0][1] - y) / (pts[0][1] - pts[-1][1]) * length, 3)

    meta = {
        "length": round(length, 3),
        "profile": profile,
        "tunersLowE": [along(HEAD_LEFT, y) for y in HEAD_TUNERS_LEFT_Y],
        "tunersHighE": [along(HEAD_RIGHT, y) for y in HEAD_TUNERS_RIGHT_Y],
    }
    return res, meta


def main():
    img = Image.open(SRC).convert("RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    build_fretboard(img).save(OUT / "fretboard.jpg", quality=90)
    head, meta = build_headstock(img)
    head.save(OUT / "headstock.jpg", quality=90)
    meta["photoFret"] = PHOTO_FRET
    (OUT / "headstock.json").write_text(json.dumps(meta, indent=2))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
