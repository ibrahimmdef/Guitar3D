#!/usr/bin/env python3
"""Guitar3D transcription runner.

Reads a mono WAV, writes JSON:
  {"duration": s, "notes": [{"start", "end", "pitch", "conf"}], "tempo": bpm, "beats": [s...], "cents": c}

- notes: Spotify Basic Pitch with the ONNX model (no TensorFlow). `conf` is the note's mean
  activation in the note posteriorgram (Basic Pitch's "amplitude"), 0..1.
- beats/tempo: librosa beat tracking (skipped with --no-beats when the tempo is known).
- cents: librosa tuning estimate (deviation from A440, -50..50).

Progress goes to stderr as "PROGRESS <0..1>" lines.
"""
import argparse
import json
import sys
import time


def progress(p):
    print(f"PROGRESS {p:.3f}", file=sys.stderr, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-beats", action="store_true")
    ap.add_argument("--onset-threshold", type=float, default=0.5)
    ap.add_argument("--frame-threshold", type=float, default=0.3)
    ap.add_argument("--min-note-ms", type=float, default=70.0)
    args = ap.parse_args()

    t0 = time.time()
    progress(0.0)
    import numpy as np
    import librosa

    y, sr = librosa.load(args.input, sr=22050, mono=True)
    duration = float(len(y) / sr)
    progress(0.05)

    from basic_pitch import FilenameSuffix, build_icassp_2022_model_path
    from basic_pitch.inference import Model, predict

    model = Model(build_icassp_2022_model_path(FilenameSuffix.onnx))
    progress(0.1)
    _, _, events = predict(
        args.input,
        model,
        onset_threshold=args.onset_threshold,
        frame_threshold=args.frame_threshold,
        minimum_note_length=args.min_note_ms,
        # guitar range with room for drop tunings: ~C#2 .. ~E6
        minimum_frequency=65.0,
        maximum_frequency=1400.0,
        multiple_pitch_bends=False,
        melodia_trick=True,
    )
    progress(0.75)
    notes = [
        {"start": round(float(s), 4), "end": round(float(e), 4), "pitch": int(p), "conf": round(float(a), 4)}
        for (s, e, p, a, *_rest) in events
    ]
    notes.sort(key=lambda n: (n["start"], n["pitch"]))

    out = {"duration": round(duration, 3), "notes": notes}
    try:
        cents = float(librosa.estimate_tuning(y=y, sr=sr)) * 100.0
        out["cents"] = round(cents, 1)
    except Exception:  # tuning is a hint only
        pass
    progress(0.85)

    if not args.no_beats:
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
        tempo = float(np.atleast_1d(tempo)[0])
        out["tempo"] = round(tempo, 2)
        out["beats"] = [round(float(b), 4) for b in beats]
    progress(1.0)
    out["seconds"] = round(time.time() - t0, 2)

    with open(args.out, "w") as f:
        json.dump(out, f)


if __name__ == "__main__":
    main()
