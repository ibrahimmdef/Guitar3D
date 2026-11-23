"""Transcription benchmark scores against a Guitar Pro ground truth (see bench/README.md).

  python bench/eval.py song.mid raw.json tab.json [--offset S]

Notes: onset F1 (50 ms, mir_eval) for the raw notes and for the final tab, exact pitch and
pitch class; beats and bar lines: F-measure (70 ms) of the tracked beats and the tab's bar lines.
"""
import argparse
import json

import mir_eval
import numpy as np
import pretty_midi


def gt_notes(midi, programs=range(24, 32)):
    out = []
    for inst in midi.instruments:
        if inst.is_drum or inst.program not in programs:
            continue
        out += [(n.start, n.end, n.pitch) for n in inst.notes]
    out.sort()
    return out


def f1(ref, est, tol=0.05, pc=False):
    if not ref or not est:
        return 0.0, 0.0, 0.0
    r_int = np.array([[s, s + 0.1] for s, _, _ in ref])
    e_int = np.array([[s, s + 0.1] for s, _, _ in est])
    hz = lambda p: 440.0 * 2 ** ((p - 69) / 12)
    if pc:  # fold to one octave: wrong octave still counts
        r_p = np.array([hz(60 + p % 12) for _, _, p in ref])
        e_p = np.array([hz(60 + p % 12) for _, _, p in est])
    else:
        r_p = np.array([hz(p) for _, _, p in ref])
        e_p = np.array([hz(p) for _, _, p in est])
    p, r, f, _ = mir_eval.transcription.precision_recall_f1_overlap(r_int, r_p, e_int, e_p, onset_tolerance=tol, offset_ratio=None)
    return p, r, f


def onset_f1(ref, est, tol=0.05):
    if not len(ref) or not len(est):
        return 0.0
    return mir_eval.onset.f_measure(np.unique(np.round(ref, 3)), np.unique(np.round(est, 3)), window=tol)[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("midi")
    ap.add_argument("raw")
    ap.add_argument("tab")
    ap.add_argument("--offset", type=float, default=0.0, help="audio time of MIDI time 0")
    a = ap.parse_args()
    midi = pretty_midi.PrettyMIDI(a.midi)
    ref = [(s + a.offset, e + a.offset, p) for s, e, p in gt_notes(midi)]
    raw = json.load(open(a.raw))
    tab = json.load(open(a.tab))
    est_raw = [(n["start"], n["end"], n["pitch"]) for n in raw["notes"] if n["conf"] >= 0.12]
    est_tab = [(n["start"], n["start"] + 0.1, n["pitch"]) for n in tab["notes"]]
    res = {}
    for name, est in (("raw", est_raw), ("tab", est_tab)):
        p, r, f = f1(ref, est)
        _, _, fpc = f1(ref, est, pc=True)
        res[name] = {"n": len(est), "P": round(p, 3), "R": round(r, 3), "F1": round(f, 3), "F1_pitchclass": round(fpc, 3),
                     "F1_onset": round(onset_f1([x[0] for x in ref], [x[0] for x in est]), 3)}
    beats = midi.get_beats() + a.offset
    downs = midi.get_downbeats() + a.offset
    res["beats_F"] = round(mir_eval.beat.f_measure(beats, np.array(raw.get("beats") or []), 0.07), 3)
    bt = np.array(tab["barTimes"])
    res["barlines_F"] = round(mir_eval.beat.f_measure(downs, bt[bt >= 0], 0.07), 3)
    res["tempo"] = {"gt": round(float(60 / np.median(np.diff(beats))), 1), "est": tab["summary"]["tempo"]}
    res["ref_notes"] = len(ref)
    res["tuning"] = tab["summary"]["detected"]
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
