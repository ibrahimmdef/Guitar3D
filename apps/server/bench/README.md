# Transcription benchmark

Measures how close auto tabs get to a known answer. A Guitar Pro file is the ground truth: all of
its tracks are rendered to audio, the audio goes through the same steps as a song in the app
(Demucs stems → `scripts/transcribe.py` → `buildAutoTab`), and the result is scored against the
file's guitar notes.

```sh
# from apps/server; WORK is any scratch directory (renders and stems are cached there)
~/.local/share/guitar3d/demucs-venv/bin/python bench/run.py WORK song1.gp3 song2.gp5
CASES=link,upload ~/.local/share/guitar3d/demucs-venv/bin/python bench/run.py WORK song.gp3
```

Cases:

- `clean`: the guitars alone, so this case measures the transcriber with no separation errors.
- `link`: the guitar stem, with beats tracked on all stems mixed (a song added from a link: the original file is gone).
- `upload`: the guitar stem, with beats tracked on the full mix.
- `link-old`: the guitar stem alone, which is how link songs worked before.

The `link` and `upload` cases also get the drum stem, as the server passes it.

Scores (`bench/eval.py`):

- `raw F1`: Basic Pitch notes against the ground-truth notes. A note counts when its onset is within 50 ms and its pitch is exact (mir_eval).
- `tab F1`: the same score for the notes of the final tab, timed through the tab's `barTimes`.
  - `pc`: the pitch class only, so a note in the wrong octave still counts.
  - `onset`: the timing only.
- `beats` / `bars`: F-measure (70 ms) of the tracked beats and of the tab's bar lines.

Limits:

- The audio is synthesized with the app's sound font, so it is cleaner than a real recording.
- The tab builder assumes 4/4, so songs in other meters (e.g. 6/8) score low on bars and tempo.
