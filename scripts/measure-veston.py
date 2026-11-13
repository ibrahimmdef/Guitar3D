#!/usr/bin/env python3
"""Measures the Veston dreadnought from assets/photos/front-full.jpg and writes the
GuitarProfile used by the 3D viewer (apps/web/public/guitar/veston.profile.json)
plus the rosette and pickguard textures.

Method
------
1. Silhouette: pixels whose brightest channel is < DARK are "guitar"; the
   connected component that contains a seed inside the lower bout is kept,
   closed morphologically, holes are filled. The wallpaper ornaments and floor
   knots are dark-ish too but never connect to the seed once the mask is opened.
2. Guitar axis: straight line through the nut centre and the saddle centre.
3. Perspective: the photo is taken from above the neck, so the body is further
   from the camera than the headstock. Along the axis the plane projects with a
   1-D homography a(u) = a0 + A u / (C u + 1), u = distance from the nut in units of
   the scale length. a0, A and C are fitted to the 20 fret wires (12-TET positions),
   so the 12th fret is at half the scale by construction.
4. Across the axis the magnification is D / (C u + 1); D comes from the rosette,
   which is a circle: its vertical radius (through the homography) must equal its
   horizontal radius.
5. The top plate outline follows the cream binding: near the shoulders the camera
   also sees the side band above the binding, which is cut away.
6. Everything is scaled so tip of headstock -> end of body = 106.7 cm (42"), with the
   headstock length taken from the neck close-up (headstock.json).

Run: python3 scripts/measure-veston.py [--debug out.png]   (needs Pillow only)
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/photos/front-full.jpg"
OUT = ROOT / "apps/web/public/guitar"

TOTAL_LENGTH_CM = 106.7  # 42"
HEADSTOCK_ANGLE_DEG = 14.0
DARK = 50
SEED = (787, 1480)

# --- hand-checked image measurements (pixels, 1512x2016) ---
NUT = (815.5, 454.0)       # centre of the nut's fretboard-side edge
SADDLE = (777.0, 1367.5)   # centre of the saddle crest
# Fret wire rows on the guitar axis, fret 1..20 (brightness peaks along both fretboard edges).
FRET_Y = [516, 571, 621, 669, 712, 753, 791, 826, 857.5, 888,
          915, 942, 967, 990, 1012, 1032, 1051, 1069, 1086, 1102]
HEADSTOCK_TIP_Y = 186.0    # centre of the headstock's top edge
FRETBOARD_NUT = (784.0, 847.0)  # fretboard edges (x) at the nut row
FRETBOARD_F14 = (762.0, 838.0)  # fretboard edges at fret 14 (y = 990)
ROSETTE_CENTRE = (787.0, 1186.0)
# ray angles (deg, image y down) that do not cross a string or the fretboard
ROSETTE_RAYS = [0, 15, 30, 45, 60, 75, 90, 120, 135, 150, 165, 180, 195, 210, 330, 345]
SADDLE_COMPENSATION = 0.004  # saddle sits ~2.5 mm behind the theoretical scale length
# Pickguard outer edge, traced on a contrast-stretched crop (clockwise from the rosette).
PICKGUARD_PX = [(860, 1128), (880, 1128), (897, 1138), (920, 1160), (940, 1190), (957, 1223),
                (962, 1253), (962, 1293), (958, 1320), (947, 1338), (927, 1348), (893, 1348),
                (863, 1345), (843, 1333), (833, 1313), (830, 1287), (833, 1267)]


def lerp(a, b, t):
    return a + (b - a) * t


def bilinear(px, x, y):
    x0, y0 = int(x), int(y)
    fx, fy = x - x0, y - y0
    return tuple(int(px[x0, y0][c] * (1 - fx) * (1 - fy) + px[x0 + 1, y0][c] * fx * (1 - fy)
                     + px[x0, y0 + 1][c] * (1 - fx) * fy + px[x0 + 1, y0 + 1][c] * fx * fy) for c in range(3))


class Frame:
    """Image <-> guitar frame (cm) through the axis and the fitted 1-D homography."""

    def __init__(self, img):
        ax, ay = SADDLE[0] - NUT[0], SADDLE[1] - NUT[1]
        n = math.hypot(ax, ay)
        self.dir = (ax / n, ay / n)          # along, towards the body
        self.perp = (-self.dir[1], self.dir[0])  # across, towards image left (= low E, +y)
        self.saddle_a = n
        self.fit_homography()
        self.fit_rosette(img)

    def along(self, x, y):
        return (x - NUT[0]) * self.dir[0] + (y - NUT[1]) * self.dir[1]

    def across(self, x, y):
        return (x - NUT[0]) * self.perp[0] + (y - NUT[1]) * self.perp[1]

    def axis_x(self, y):
        t = (y - NUT[1]) / (SADDLE[1] - NUT[1])
        return lerp(NUT[0], SADDLE[0], t)

    def fit_homography(self):
        """a(u) = a0 + A u / (C u + 1), least squares over the 20 fret wires.

        a0 absorbs the error of the hand-picked nut edge (a few px). Earlier versions pinned
        the curve to the 12th fret and the photographed saddle; that left systematic fret
        residuals of up to 4.7 px and, together with a foreshortened headstock, produced an
        implausible 68.5 cm scale. The saddle is now only reported: it lies beyond the frets
        (u = 1 vs u <= 0.69), ~0.6 cm above their plane, and is not used as an anchor.
        """
        pts = [(1 - 2 ** (-n / 12), self.along(self.axis_x(y), y)) for n, y in enumerate(FRET_Y, start=1)]

        def lsq(a0):
            # (a - a0) = A u - C (a - a0) u
            q = [(u, a - a0) for u, a in pts]
            s11 = sum(u * u for u, _ in q)
            s12 = sum(-u * a * u for u, a in q)
            s22 = sum((a * u) ** 2 for u, a in q)
            b1 = sum(u * a for u, a in q)
            b2 = sum(-a * u * a for u, a in q)
            det = s11 * s22 - s12 * s12
            A, C = (b1 * s22 - b2 * s12) / det, (s11 * b2 - s12 * b1) / det
            err = sum((a - A * u / (C * u + 1)) ** 2 for u, a in q)
            return err, A, C

        best = min(((*lsq(k / 4), k / 4) for k in range(-40, 41)), key=lambda t: t[0])
        err, self.A, self.C, self.a0 = best
        self.fret_rms = math.sqrt(err / len(pts))
        self.fret_residuals = [round(a - self.a_of_u(u), 1) for u, a in pts]

    def a_of_u(self, u):
        return self.a0 + self.A * u / (self.C * u + 1)

    def u_of_a(self, a):
        return (a - self.a0) / (self.A - self.C * (a - self.a0))

    def fit_rosette(self, img):
        """Outer edge of the rosette on rays from its centre (rays crossing strings skipped);
        least-squares ellipse r^2 (cos^2/a^2 + sin^2/b^2) = 1."""
        px = img.load()
        xc, yc = ROSETTE_CENTRE
        rows = []
        for deg in ROSETTE_RAYS:
            t = math.radians(deg)
            last = None
            for r in range(60, 120):
                x, y = int(xc + r * math.cos(t)), int(yc + r * math.sin(t))
                if max(px[x, y]) > 110:
                    last = r
            if last:
                rows.append(((last * math.cos(t)) ** 2, (last * math.sin(t)) ** 2))
        s11 = sum(r[0] * r[0] for r in rows)
        s12 = sum(r[0] * r[1] for r in rows)
        s22 = sum(r[1] * r[1] for r in rows)
        b1 = sum(r[0] for r in rows)
        b2 = sum(r[1] for r in rows)
        det = s11 * s22 - s12 * s12
        p = (b1 * s22 - b2 * s12) / det
        q = (s11 * b2 - s12 * b1) / det
        semi_x, semi_y = 1 / math.sqrt(p), 1 / math.sqrt(q)
        self.rosette_px = (xc, yc, semi_x, semi_y)
        a0 = self.along(xc, yc)
        u_top, u_bot = self.u_of_a(a0 - semi_y), self.u_of_a(a0 + semi_y)
        r_u = (u_bot - u_top) / 2
        self.rosette_u = ((u_top + u_bot) / 2, r_u)
        # horizontal radius in px = D r_u / (C u + 1)
        self.D = semi_x * (self.C * self.rosette_u[0] + 1) / r_u

    def to_units(self, x, y):
        """Image pixel -> (along u, across v), both in scale-length units (v > 0 = low E side)."""
        a = self.along(x, y)
        u = self.u_of_a(a)
        v = self.across(x, y) * (self.C * u + 1) / self.D
        return u, v


def silhouette(img):
    gray = img.point(lambda v: v)  # copy
    r, g, b = gray.split()
    from PIL import ImageChops
    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    mask = mx.point(lambda v: 255 if v < DARK else 0)
    # open (removes thin links to wallpaper/floor), then close (bridges strings, binding gaps)
    mask = mask.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    mask = mask.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))
    ImageDraw.floodfill(mask, SEED, 128)
    comp = mask.point(lambda v: 255 if v == 128 else 0)
    # fill holes: flood the outside from a corner, everything not outside is inside
    outside = comp.copy()
    ImageDraw.floodfill(outside, (0, 0), 64)
    return outside.point(lambda v: 0 if v == 64 else 255)


def plate_mask(img, sil, frame):
    """Cuts the visible side band above the cream binding at the upper bout."""
    px = img.load()
    m = sil.copy()
    mp = m.load()
    w, h = m.size
    neck_l, neck_r = FRETBOARD_F14[0] - 6, FRETBOARD_F14[1] + 6
    tops = {}
    for x in range(0, w):
        col = [y for y in range(800, 1200) if mp[x, y]]
        if not col:
            continue
        ys = col[0]
        for y in range(ys, ys + 60):
            r, g, b = px[x, y]
            if r > 120 and r >= b and mp[x, min(y + 3, h - 1)]:
                tops[x] = y
                break
    xs = sorted(tops)
    # interpolate the binding under the neck
    left = [x for x in xs if x < neck_l]
    right = [x for x in xs if x > neck_r]
    for x in range(int(neck_l), int(neck_r) + 1):
        if left and right:
            tops[x] = lerp(tops[left[-1]], tops[right[0]], (x - left[-1]) / (right[0] - left[-1]))
    for x, yt in tops.items():
        for y in range(800, int(yt)):
            mp[x, y] = 0
    return m


def row_outline(mask, frame):
    """Left/right extents per image row -> closed outline (clockwise in the guitar frame)."""
    mp = mask.load()
    w, h = mask.size
    rows = []
    for y in range(900, h):
        xs = [x for x in range(300, 1250) if mp[x, y]]
        if len(xs) < 120:  # neck rows are ~80 px wide
            continue
        rows.append((y, xs[0] - 1.5, xs[-1] + 1.5))  # +1.5 px: cream binding outside the mask
    return rows


def resample_closed(pts, n):
    per = [0.0]
    for i in range(1, len(pts) + 1):
        a, b = pts[i - 1], pts[i % len(pts)]
        per.append(per[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    total = per[-1]
    out = []
    j = 0
    for k in range(n):
        s = total * k / n
        while per[j + 1] < s:
            j += 1
        a, b = pts[j], pts[(j + 1) % len(pts)]
        t = (s - per[j]) / max(per[j + 1] - per[j], 1e-9)
        out.append((lerp(a[0], b[0], t), lerp(a[1], b[1], t)))
    return out


def smooth_closed(pts, k=2):
    n = len(pts)
    return [(sum(pts[(i + d) % n][0] for d in range(-k, k + 1)) / (2 * k + 1),
             sum(pts[(i + d) % n][1] for d in range(-k, k + 1)) / (2 * k + 1)) for i in range(n)]


def symmetrize(outline):
    """Averages the two halves (the photographed body is symmetric up to noise/lighting)."""
    # outline: list of (x, y) with y across. Build half-width as a function of x.
    xs = [p[0] for p in outline]
    x0, x1 = max(xs), min(xs)
    n = 120
    half = []
    for k in range(n + 1):
        # cosine spacing gives more samples near the rounded ends
        x = lerp(x0, x1, (1 - math.cos(math.pi * k / n)) / 2)
        ys = []
        for i in range(len(outline)):
            a, b = outline[i], outline[(i + 1) % len(outline)]
            if (a[0] - x) * (b[0] - x) <= 0 and a[0] != b[0]:
                ys.append(lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])))
        if len(ys) >= 2:
            half.append((x, (max(ys) - min(ys)) / 2, (max(ys) + min(ys)) / 2))
        else:
            half.append((x, 0.0, 0.0))
    return half


def main():
    debug = sys.argv[sys.argv.index("--debug") + 1] if "--debug" in sys.argv else None
    img = Image.open(SRC).convert("RGB")
    fr = Frame(img)

    print(f"homography a0={fr.a0:.2f} px A={fr.A:.1f} C={fr.C:.4f}; fret rms {fr.fret_rms:.2f} px, "
          f"residuals px: {fr.fret_residuals}")

    sil = silhouette(img)
    plate = plate_mask(img, sil, fr)
    rows = row_outline(plate, fr)
    left = [fr.to_units(l, y) for y, l, r in rows]
    right = [fr.to_units(r, y) for y, l, r in rows]

    head = json.loads((OUT / "headstock.json").read_text())
    u_tip = fr.u_of_a(fr.along(fr.axis_x(HEADSTOCK_TIP_Y), HEADSTOCK_TIP_Y))
    u_bottom = max(p[0] for p in left + right)
    # Scale length. total = headstock * cos(angle) + (nut -> end of body), the second term being
    # u_bottom scale lengths. The headstock length comes from the neck close-up (headstock.json,
    # tied to the 4.3 cm nut): in this photo the headstock leans back out of the fretboard plane and
    # is seen from below, so the plane homography shortens it by far more than cos(angle).
    head_len = head["length"]
    head_proj = head_len * math.cos(math.radians(HEADSTOCK_ANGLE_DEG))
    L = (TOTAL_LENGTH_CM - head_proj) / u_bottom
    L_old = TOTAL_LENGTH_CM / (u_bottom - u_tip)
    sil_bottom = max(fr.to_units(x, y)[0] for x, y in [(fr.axis_x(y), y) for y in range(1500, 1700)
                                                        if sil.getpixel((int(fr.axis_x(y)), y))])
    u_saddle = fr.u_of_a(fr.saddle_a)
    print(f"scale length from 42\" total: {L:.2f} cm (headstock {head_len:.2f} cm from the close-up, "
          f"{head_proj:.2f} cm projected; the tip seen in this photo would give {-u_tip * L:.2f} cm "
          f"and a {L_old:.2f} cm scale)")
    print(f"checks: 12th fret {L / 2:.2f} cm, 14th fret {L * (1 - 2 ** (-14 / 12)):.2f} cm, body starts at "
          f"{min(p[0] for p in left + right) * L:.2f} cm, body ends at {u_bottom * L:.2f} cm, "
          f"total {head_proj + u_bottom * L:.2f} cm")
    print(f"photographed saddle extrapolates to {u_saddle * L:.2f} cm from the nut "
          f"({(u_saddle - 1) * L:+.2f} cm vs the scale: compensation ~0.25 cm, parallax of the raised "
          f"saddle ~0.3 cm, the rest is extrapolation error beyond the last fret)")

    # guitar frame: x = -u*L (body towards negative x), y = v*L
    outline = [(-u * L, v * L) for u, v in left] + [(-u * L, v * L) for u, v in reversed(right)]
    half = symmetrize(outline)
    centre_shift = sum(h[2] for h in half if h[1] > 5) / len([h for h in half if h[1] > 5])
    # Rebuild a symmetric, clockwise outline (seen from the front, +z towards viewer):
    # start at the neck joint on the high-e side (-y), go down the high-e side, back up the low-E side.
    pts = [(x, -hw) for x, hw, _ in half] + [(x, hw) for x, hw, _ in reversed(half)]
    pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
    pts = smooth_closed(resample_closed(pts, 400), 2)
    pts = resample_closed(pts, 240)
    body_top_x = max(p[0] for p in pts)
    body_bottom_x = min(p[0] for p in pts)

    def width_at(x):
        return 2 * max([h for xx, h, _ in half if abs(xx - x) < 0.6] or [0])

    hw = [(x, h * 2) for x, h, _ in half]
    blen = body_top_x - body_bottom_x
    waist = min([t for t in hw if body_top_x - 0.25 * blen > t[0] > body_top_x - 0.6 * blen], key=lambda t: t[1])
    upper = max([t for t in hw if t[0] > waist[0]], key=lambda t: t[1])
    lower = max([t for t in hw if t[0] < waist[0]], key=lambda t: t[1])

    xs_, ys_, sx, sy = fr.rosette_px
    rose_u, rose_r = fr.rosette_u
    rosette = {"x": -rose_u * L, "y": fr.to_units(xs_, ys_)[1] * L - centre_shift, "outerRadiusCm": rose_r * L}

    # soundhole: the rosette ring is ~1.1 cm wide plus a ~0.3 cm black purfling ring (photo)
    sh_r = rose_r * L - 1.45

    # bridge: brown pixels around the saddle
    px = img.load()
    bridge_pts = [(x, y) for y in range(1340, 1410) for x in range(640, 920)
                  if px[x, y][0] > 30 and px[x, y][0] > px[x, y][2] + 10 and max(px[x, y]) < 140]
    bx0, bx1 = min(p[0] for p in bridge_pts), max(p[0] for p in bridge_pts)
    by0, by1 = min(p[1] for p in bridge_pts), max(p[1] for p in bridge_pts)
    b_left = fr.to_units(bx0, (by0 + by1) / 2)
    b_right = fr.to_units(bx1, (by0 + by1) / 2)
    b_top = fr.to_units(fr.axis_x(by0), by0)
    b_bot = fr.to_units(fr.axis_x(by1), by1)
    # the bridge is placed around the modelled saddle (x = -L), keeping the photographed offset
    # between the saddle and the middle of the bridge
    bridge_offset = ((b_top[0] + b_bot[0]) / 2 - u_saddle) * L
    bridge = {"x": round(-L * (1 + SADDLE_COMPENSATION) - bridge_offset, 2),
              "widthCm": round(abs(b_left[1] - b_right[1]) * L, 2),
              "lengthCm": round((b_bot[0] - b_top[0]) * L, 2)}

    pg = [fr.to_units(x, y) for x, y in PICKGUARD_PX]
    # close along the rosette edge (pickguard hugs the rosette with a 2 mm gap)
    a0 = math.atan2(pg[-1][1] * L - rosette["y"] - centre_shift, -pg[-1][0] * L - rosette["x"])
    a1 = math.atan2(pg[0][1] * L - rosette["y"] - centre_shift, -pg[0][0] * L - rosette["x"])
    pickguard = [(-u * L, v * L - centre_shift) for u, v in pg]
    rr = rosette["outerRadiusCm"] + 0.2
    if a1 < a0:
        a1 += 2 * math.pi
    for k in range(1, 12):
        a = lerp(a0, a1, k / 12)
        pickguard.append((rosette["x"] + rr * math.cos(a), rosette["y"] + rr * math.sin(a)))

    fb_nut = [fr.to_units(x, NUT[1]) for x in FRETBOARD_NUT]
    fb_14 = [fr.to_units(x, 990) for x in FRETBOARD_F14]
    nut_w = abs(fb_nut[0][1] - fb_nut[1][1]) * L
    w14 = abs(fb_14[0][1] - fb_14[1][1]) * L

    k = 1.0  # headstock.json is already in centimetres

    report = {
        "scaleLengthCm": round(L, 2),
        "nutTo12thCm": round(L / 2, 2),
        "bodyLengthCm": round(body_top_x - body_bottom_x, 2),
        "neckJoinX": round(body_top_x, 2),
        "upperBoutCm": round(upper[1], 2), "upperBoutX": round(upper[0], 2),
        "waistCm": round(waist[1], 2), "waistX": round(waist[0], 2),
        "lowerBoutCm": round(lower[1], 2), "lowerBoutX": round(lower[0], 2),
        "rosette": {k2: round(v, 2) for k2, v in rosette.items()},
        "soundholeRadiusCm": round(sh_r, 2),
        "bridge": bridge,
        "nutWidthFromPhotoCm": round(nut_w, 2),
        "fretboardWidthAt14Cm": round(w14, 2),
        "headstockLengthCm": round(head_len, 2),
        "silhouetteBottomX": round(-sil_bottom * L, 2),
        "rosettePx": [round(v, 1) for v in fr.rosette_px],
    }
    print(json.dumps(report, indent=1))

    profile = {
        "id": "veston-d45",
        "name": "Veston D-45 SP/BKS",
        "totalLengthCm": TOTAL_LENGTH_CM,
        "scaleLengthCm": round(L, 2),
        "fretCount": 20,
        "bodyJoinFret": 14,
        "nutWidthCm": 4.3,
        "endWidthCm": 5.7,  # 5.51 measured at fret 14, extrapolated to fret 20
        "stringSpacingNutCm": 3.6,
        "stringSpacingSaddleCm": 5.4,
        "body": {
            "outline": [[round(x, 2), round(y, 2)] for x, y in pts],
            "depthCm": 11.5,
            "soundhole": {"x": round(rosette["x"], 2), "y": 0, "radiusCm": round(sh_r, 2)},
            "pickguard": [[round(x, 2), round(y, 2)] for x, y in pickguard],
            "bridge": bridge,
        },
        "headstock": {
            "lengthCm": round(head_len, 2),
            "profile": [[round(d * k, 2), w] for d, w in head["profile"]],
            "tunersLowE": [round(d * k, 2) for d in head["tunersLowE"]],
            "tunersHighE": [round(d * k, 2) for d in head["tunersHighE"]],
            "angleDeg": HEADSTOCK_ANGLE_DEG,
        },
        "finish": {
            "top": "#121212", "sides": "#101010", "back": "#101010", "neck": "#121212",
            "headstock": "#0e0e0e", "fretboard": "#2a2422", "binding": "#e9dfc6",
            "pickguard": "#050505", "bridge": "#3a2820", "hardware": "chrome", "gloss": 0.25,
        },
        "textures": {
            "fretboard": {"url": "/guitar/fretboard.jpg", "toFret": 20},
            "headstock": "/guitar/headstock-face.jpg",
            "rosette": "/guitar/rosette.png",
        },
        "source": "Measured from assets/photos/front-full.jpg by scripts/measure-veston.py "
                  "(perspective fitted to the 20 fret wires, headstock from the neck close-up, "
                  "scaled to 42\" = 106.7 cm).",
    }
    (OUT / "veston.profile.json").write_text(json.dumps(profile, indent=1))
    build_rosette(img, fr)
    build_headstock_face(profile["headstock"])
    print("wrote", OUT / "veston.profile.json")

    if debug:
        dbg = img.copy()
        d = ImageDraw.Draw(dbg)
        d.line([(l, y) for y, l, r in rows], fill=(255, 0, 0), width=2)
        d.line([(r, y) for y, l, r in rows], fill=(255, 0, 0), width=2)
        for y in FRET_Y:
            d.line([(fr.axis_x(y) - 40, y), (fr.axis_x(y) + 40, y)], fill=(0, 255, 0))
        sp = fr.a_of_u(1.0)
        sy_ = NUT[1] + sp * fr.dir[1]
        d.line([(SADDLE[0] - 60, sy_), (SADDLE[0] + 60, sy_)], fill=(0, 128, 255), width=2)
        d.line(PICKGUARD_PX + [PICKGUARD_PX[0]], fill=(255, 0, 255), width=2)
        d.ellipse([xs_ - sx, ys_ - sy, xs_ + sx, ys_ + sy], outline=(255, 255, 0), width=2)
        dbg.save(debug)


def build_rosette(img, fr, inner=0.78, size=512):
    """Unwarps the rosette from the photo into a square RGBA ring texture.

    The top of the rosette is covered by the fretboard and the strings cross it, so
    every texture angle samples the clean left sector (135..225 deg), mirrored per
    quadrant so there are no seams. Radii map linearly onto the photographed ellipse.
    """
    xc, yc, sx, sy = fr.rosette_px
    px = img.load()
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    op = out.load()
    for j in range(size):
        for i in range(size):
            dx, dy = (i + 0.5) / size * 2 - 1, (j + 0.5) / size * 2 - 1
            r = math.hypot(dx, dy)
            if r > 1.0 or r < inner - 0.01:
                continue
            q = (math.atan2(dy, dx) % (math.pi / 2)) / (math.pi / 2)
            seg = int((math.atan2(dy, dx) % (2 * math.pi)) // (math.pi / 2))
            tri = q if seg % 2 == 0 else 1 - q
            ang = math.radians(135 + 90 * tri)
            rr = min(r, 0.985)
            c = bilinear(px, xc + math.cos(ang) * rr * sx, yc + math.sin(ang) * rr * sy)
            edge = min(1.0, (1.0 - r) * size / 2, (r - inner + 0.01) * size / 2)
            op[i, j] = (c[0], c[1], c[2], int(255 * max(0.0, edge)))
    out.save(OUT / "rosette.png")


def build_headstock_face(head, out_w=512, out_h=1024):
    """Clean headstock face: the photographed logo on a uniform satin black.

    headstock.jpg (scripts/build-veston-textures.py) also shows the photographed tuner
    posts and strings, which would double up with the modelled hardware, so only the
    bright logo strokes above the top tuner pair are kept.
    """
    src = Image.open(OUT / "headstock.jpg").convert("RGB").resize((out_w, out_h))
    sp = src.load()
    top_tuner = max(head["tunersLowE"] + head["tunersHighE"]) / head["lengthCm"]
    logo_end = int((1 - top_tuner) * out_h) - 70
    base = (17, 17, 18)
    out = Image.new("RGB", (out_w, out_h), base)
    op = out.load()
    for j in range(8, logo_end):
        fade = min(1.0, (logo_end - j) / 20)
        for i in range(24, out_w - 24):
            r, g, b = sp[i, j]
            lum = (r + g + b) / 3
            a = max(0.0, min(1.0, (lum - 70) / 90)) * fade
            if a > 0:
                op[i, j] = tuple(int(base[c] + (235 - base[c]) * a) for c in range(3))
    out.save(OUT / "headstock-face.jpg", quality=92)


if __name__ == "__main__":
    main()
