"""Transcription benchmark: Guitar Pro files as ground truth.

  ~/.local/share/guitar3d/demucs-venv/bin/python bench/run.py WORK_DIR song1.gp3 [song2.gp5 ...]

For every file: every track → MIDI → audio (fluidsynth, the app's sound font) → Demucs stems
(cached) → the app's transcriber and tab builder → scores (bench/eval.py). Cases:
  clean  the guitars alone, beats from the mix (transcriber upper bound)
  link   guitar stem, beats from all stems mixed (a song added from a link: no original kept)
  upload guitar stem, beats from the full mix (an uploaded file)
The song cases also get the drum stem (bar lines), as the server passes it.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(SERVER))
PY = sys.executable
SF2 = os.path.join(ROOT, "apps/web/public/soundfont/sonivox.sf2")


def sh(*cmd, **kw):
    subprocess.run(cmd, check=True, **kw)


def cached(path, make):
    if not os.path.exists(path):
        make()
    return path


def mono(src, dst):
    return cached(dst, lambda: sh("ffmpeg", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "22050", dst))


def prepare(work, gp):
    os.makedirs(work, exist_ok=True)
    mid = cached(os.path.join(work, "song.mid"), lambda: sh("npx", "tsx", os.path.join(HERE, "gt.ts"), gp, work, cwd=SERVER, stdout=subprocess.DEVNULL))
    mix = cached(os.path.join(work, "mix.wav"), lambda: sh("fluidsynth", "-ni", "-g", "0.6", "-r", "44100", "-F", os.path.join(work, "mix.wav"), SF2, mid, stdout=subprocess.DEVNULL))

    def guitars():
        import pretty_midi as pm
        m = pm.PrettyMIDI(mid)
        m.instruments = [i for i in m.instruments if not i.is_drum and 24 <= i.program < 32]
        m.write(os.path.join(work, "guitars.mid"))
        sh("fluidsynth", "-ni", "-g", "0.6", "-r", "44100", "-F", os.path.join(work, "guitars.wav"), SF2, os.path.join(work, "guitars.mid"), stdout=subprocess.DEVNULL)

    cached(os.path.join(work, "guitars.wav"), guitars)
    sep = os.path.join(work, "sep", "htdemucs_6s")
    cached(os.path.join(sep, "guitar.wav"), lambda: sh(PY, "-m", "demucs.separate", "-n", "htdemucs_6s", "-d", "cpu", "-j", "0", "--segment", "7", "--overlap", "0.1", "-o", os.path.join(work, "sep"), "--filename", "{stem}.{ext}", mix, stderr=subprocess.DEVNULL))
    return mid, mix, sep


def stem_sum(sep, dst):
    stems = sorted(os.path.join(sep, f) for f in os.listdir(sep) if f.endswith(".wav"))
    inputs = [x for f in stems for x in ("-i", f)]
    return cached(dst, lambda: sh("ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", f"amix=inputs={len(stems)}:normalize=0:duration=longest", "-ac", "1", "-ar", "22050", dst))


def run_case(work, name, audio, beats_from, extra):
    raw = os.path.join(work, f"raw_{name}.json")
    tab = os.path.join(work, f"tab_{name}.json")
    args = [PY, os.path.join(SERVER, "scripts/transcribe.py"), audio, "--out", raw] + (["--beats-from", beats_from] if beats_from else []) + extra
    sh(*args, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    sh("npx", "tsx", os.path.join(HERE, "tab.ts"), raw, tab, cwd=SERVER, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    out = subprocess.run([PY, os.path.join(HERE, "eval.py"), os.path.join(work, "song.mid"), raw, tab], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def main():
    work_root, files = sys.argv[1], sys.argv[2:]
    cases = os.environ.get("CASES", "clean,link,upload").split(",")
    rows = []
    for gp in files:
        name = os.path.splitext(os.path.basename(gp))[0][:8]
        work = os.path.join(work_root, name)
        mid, mix, sep = prepare(work, os.path.abspath(gp))
        g = mono(os.path.join(work, "guitars.wav"), os.path.join(work, "guitars_mono.wav"))
        m = mono(mix, os.path.join(work, "mix_mono.wav"))
        stem = mono(os.path.join(sep, "guitar.wav"), os.path.join(work, "guitar_stem.wav"))
        drums = mono(os.path.join(sep, "drums.wav"), os.path.join(work, "drums_mono.wav"))
        summed = stem_sum(sep, os.path.join(work, "stems_sum.wav"))
        plan = {"clean": (g, m), "link": (stem, summed), "upload": (stem, m), "link-old": (stem, None)}
        for case in cases:
            audio, beats = plan[case]
            extra = ["--drums", drums] if case in ("link", "upload") else []
            r = run_case(work, case, audio, beats, extra)
            rows.append((name, case, r))
            print(f"{name:9} {case:7} raw F1 {r['raw']['F1']:.3f}  tab F1 {r['tab']['F1']:.3f} pc {r['tab']['F1_pitchclass']:.3f} onset {r['tab']['F1_onset']:.3f}  beats {r['beats_F']:.3f} bars {r['barlines_F']:.3f}  tempo {r['tempo']['est']}/{r['tempo']['gt']}  {r['tuning']}", flush=True)
    json.dump([{"song": a, "case": b, **c} for a, b, c in rows], open(os.path.join(work_root, "results.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
