#!/usr/bin/env python3
"""Guitar3D transcription runner.

Reads a mono WAV, writes JSON:
  {"duration": s, "notes": [{"start", "end", "pitch", "conf"}], "tempo": bpm, "beats": [s...], "cents": c}

- notes: Spotify Basic Pitch with the ONNX model (no TensorFlow). `conf` is the note's mean
  activation in the note posteriorgram (Basic Pitch's "amplitude"), 0..1.
- beats/tempo: librosa beat tracking (skipped with --no-beats when the tempo is known), on
  --beats-from when given (a song's full mix: drums keep the beat steadier than the guitar alone).
- cents: librosa tuning estimate (deviation from A440, -50..50).
- strums: every onset (librosa onset detection) with features for the strum analysis:
  strength (onset envelope, 0..1 of the loudest), spread (s: when the high strings' new energy
  arrives minus when the low strings' does, > 0 = low strings first = down stroke), flatness
  (spectral flatness of the attack, noise-like = high) and decay (level 80-160 ms after the onset
  over the level of its first 40 ms; a muted "chuck" dies fast) and level (RMS of the attack, for
  accents).

Progress goes to stderr as "PROGRESS <0..1>" lines.
"""
import argparse
import json
import sys
import time


def progress(p):
    print(f"PROGRESS {p:.3f}", file=sys.stderr, flush=True)


def strum_features(y, sr):
    import numpy as np
    import librosa

    hop = 256
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    frames = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="frames")
    if len(frames) == 0:
        return []
    peak = float(env.max()) or 1.0
    # short windows for timing: 23 ms frames every 1.5 ms, log magnitude so quiet strings count
    n_fft, h = 512, 32
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    low = (freqs >= 60) & (freqs < 220)  # fundamentals of the low strings
    high = (freqs >= 280) & (freqs < 1200)  # the high strings (and the low ones' overtones)
    out = []
    for f in frames:
        t = float(librosa.frames_to_time(f, sr=sr, hop_length=hop))
        a = max(0, int((t - 0.1) * sr))
        b = min(len(y), int((t + 0.2) * sr))
        seg = y[a:b]
        if len(seg) < n_fft:
            continue
        S = np.abs(librosa.stft(seg, n_fft=n_fft, hop_length=h, center=True))
        L = np.log1p(S * 100)
        ft = a / sr + np.arange(S.shape[1]) * h / sr
        flux = np.maximum(0.0, np.diff(L, axis=1))
        fluxt = ft[1:]
        win = (fluxt >= t - 0.04) & (fluxt <= t + 0.05)

        def ctime(mask):
            w = flux[mask][:, win].sum(axis=0)
            return float((w * fluxt[win]).sum() / w.sum()) if win.any() and w.sum() > 0 else None

        lo_t, hi_t = ctime(low), ctime(high)
        att = (ft >= t - 0.01) & (ft <= t + 0.04)
        flat = float(librosa.feature.spectral_flatness(S=S[:, att] + 1e-9).mean()) if att.any() else 0.0
        i0 = int(t * sr)
        e1 = y[max(0, i0 - int(0.01 * sr)):i0 + int(0.04 * sr)]
        e2 = y[i0 + int(0.08 * sr):i0 + int(0.16 * sr)]
        r1 = float(np.sqrt(np.mean(e1 ** 2))) if len(e1) else 0.0
        r2 = float(np.sqrt(np.mean(e2 ** 2))) if len(e2) else 0.0
        out.append({
            "t": round(t, 4),
            "strength": round(float(env[f]) / peak, 4),
            "spread": round(hi_t - lo_t, 5) if lo_t is not None and hi_t is not None else None,
            "flatness": round(flat, 4),
            "decay": round(r2 / r1, 4) if r1 > 0 else 1.0,
            "level": round(r1, 5),
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-beats", action="store_true")
    ap.add_argument("--onset-threshold", type=float, default=0.5)
    ap.add_argument("--frame-threshold", type=float, default=0.3)
    ap.add_argument("--min-note-ms", type=float, default=70.0)
    ap.add_argument("--beats-from", help="audio to track the beat on (default: the input)")
    ap.add_argument("--only-strums", action="store_true", help="debug: strum features only")
    args = ap.parse_args()

    t0 = time.time()
    progress(0.0)
    import numpy as np
    import librosa

    y, sr = librosa.load(args.input, sr=22050, mono=True)
    duration = float(len(y) / sr)
    progress(0.05)
    if args.only_strums:
        with open(args.out, "w") as f:
            json.dump({"duration": duration, "notes": [], "strums": strum_features(y, sr)}, f)
        return

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
        yb = y
        if args.beats_from:
            try:
                yb, _ = librosa.load(args.beats_from, sr=sr, mono=True)
            except Exception as e:  # fall back to the input
                print(f"beat source unreadable: {e}", file=sys.stderr)
        tempo, beats = librosa.beat.beat_track(y=yb, sr=sr, units="time")
        del yb
        tempo = float(np.atleast_1d(tempo)[0])
        out["tempo"] = round(tempo, 2)
        out["beats"] = [round(float(b), 4) for b in beats]
    progress(0.9)
    try:
        out["strums"] = strum_features(y, sr)
    except Exception as e:  # the strum pattern is an extra; never fail the tab for it
        print(f"strum features failed: {e}", file=sys.stderr)
    progress(1.0)
    out["seconds"] = round(time.time() - t0, 2)

    with open(args.out, "w") as f:
        json.dump(out, f)


if __name__ == "__main__":
    main()
