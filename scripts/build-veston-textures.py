#!/usr/bin/env python3
"""Builds the 3D textures for the Veston dreadnought from assets/photos/front-neck.jpg.

The photo is taken at a slight angle, so a single 4-corner homography misplaces
the frets by up to ~80 px. Instead every fret wire was measured by hand in the
photo and the fretboard is warped piecewise between consecutive frets, so the
photographed fret wires land exactly on the 12-TET positions used by the 3D neck.
The final fretboard texture is *clean*: only the pearl tree-of-life inlay is lifted
from the photo (bright, low-saturation, wide shapes; strings and fret wires are thin
lines and are removed by a morphological opening followed by a short constrained
reconstruction) and composited onto a procedural dark rosewood. No strings, string
shadows, fret wires or wallpaper remain; the 3D model draws frets, binding and strings.

Run: python3 scripts/build-veston-textures.py   (needs Pillow)
"""
import json
import math
from pathlib import Path

import random

from PIL import Image, ImageChops, ImageFilter

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


def fret_columns(out_w):
    total = 1 - 2 ** (-PHOTO_FRET / 12)
    return [(1 - 2 ** (-n / 12)) / total * out_w for n in range(0, PHOTO_FRET + 1)]


def _runs(seq):
    """(start, end) of the True runs in a list of booleans."""
    out, start = [], None
    for i, v in enumerate(seq):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(seq)))
    return out


# Rows of the photographed strings in the 2048x256 rectified board (low E first), measured as
# brightness peaks of the column-median at u = 128 and u = 1920; linear in between.
STRING_ROWS = [(36, 25), (80, 70), (121, 115), (163, 160), (204, 201), (242, 243)]
STRING_U = (128, 1920)


def inlay_mask(rect, edge=12, band=6, fret_px=16):
    """Pearl inlay of the rectified fretboard photo -> (alpha mask, pearl colour image).

    1. candidate pixels: bright and low-saturation (pearl), away from the binding.
    2. strings: a band of +-band px around every photographed string is cleared; per
       column the band is re-filled only where pearl continues on both sides of it
       (the string crossed an inlay), its colour interpolated from above and below.
    3. fret wires run across the board: per row, short runs (< fret_px) centred near
       a fret column are dropped (the 3D frets sit there anyway).
    4. specks are removed by a small opening; the edge is softened.
    """
    w, h = rect.size
    hsv = rect.convert("HSV").load()
    px = rect.load()
    colour = rect.copy()
    cp = colour.load()
    m = [[False] * h for _ in range(w)]  # m[x][y]
    for x in range(w):
        col = m[x]
        for y in range(edge, h - edge):
            _, s_, v = hsv[x, y]
            col[y] = v > 125 and s_ < 70
        t = (x - STRING_U[0]) / (STRING_U[1] - STRING_U[0])
        for r0, r1 in STRING_ROWS:
            c = r0 + (r1 - r0) * t
            a, b = max(0, int(c - band)), min(h - 1, int(c + band) + 1)
            ya = next((y for y in range(a - 1, max(a - 7, -1), -1) if col[y]), None)
            yb = next((y for y in range(b + 1, min(b + 7, h)) if col[y]), None)
            for y in range(a, b + 1):
                col[y] = False
            if ya is not None and yb is not None:
                # the string crossed the pearl: bridge the gap, colour from both sides
                top, bot = px[x, max(ya - 1, 0)], px[x, min(yb + 1, h - 1)]
                for y in range(ya + 1, yb):
                    k = (y - ya) / (yb - ya)
                    col[y] = True
                    cp[x, y] = tuple(int(top[q] + (bot[q] - top[q]) * k) for q in range(3))
    frets = fret_columns(w)
    for y in range(h):
        row = [m[x][y] for x in range(w)]
        for a, b in _runs(row):
            c = (a + b) / 2
            if b - a < fret_px and min(abs(c - f) for f in frets) < 12:
                for x in range(a, b):
                    m[x][y] = False
    mask = Image.new("L", (w, h))
    mp = mask.load()
    for x in range(w):
        for y in range(h):
            if m[x][y]:
                mp[x, y] = 255
    mask = mask.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    return mask.filter(ImageFilter.GaussianBlur(0.8)), colour


def rosewood(w, h, seed=7):
    """Procedural dark rosewood: long streaks along u (the grain) at two scales."""
    rnd = random.Random(seed)

    def streaks(cols, rows):
        n = Image.new("L", (cols, rows))
        n.putdata([rnd.randint(0, 255) for _ in range(cols * rows)])
        return n.resize((w, h), Image.BICUBIC)

    coarse = streaks(24, 40)
    fine = streaks(160, 220)
    cp, fp = coarse.load(), fine.load()
    out = Image.new("RGB", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            t = (cp[x, y] - 128) / 128 * 0.55 + (fp[x, y] - 128) / 128 * 0.45
            k = 1 + 0.22 * t
            op[x, y] = (int(44 * k), int(34 * k), int(31 * k))
    return out


def build_clean_fretboard(img):
    rect = build_fretboard(img)
    alpha, pearl = inlay_mask(rect)
    pearl = pearl.filter(ImageFilter.MedianFilter(3))
    pearl = Image.blend(pearl, Image.new("RGB", rect.size, (226, 228, 222)), 0.2)
    wood = rosewood(*rect.size)
    # thin dark cut line around the inlay
    rim = alpha.filter(ImageFilter.MaxFilter(3))
    wood = Image.composite(Image.new("RGB", rect.size, (20, 16, 15)), wood, rim.point(lambda v: v // 2))
    return Image.composite(pearl, wood, alpha), alpha


def main():
    img = Image.open(SRC).convert("RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    clean, alpha = build_clean_fretboard(img)
    clean.save(OUT / "fretboard.jpg", quality=86, optimize=True, progressive=True)
    head, meta = build_headstock(img)
    head.save(OUT / "headstock.jpg", quality=90)
    meta["photoFret"] = PHOTO_FRET
    (OUT / "headstock.json").write_text(json.dumps(meta, indent=2))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
