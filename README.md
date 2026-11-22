# Guitar3D

An interactive guitar practice app that shows Guitar Pro tabs as note bubbles on a 3D model of your own guitar.

## Running

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3001

The app loads a demo étude on startup. Use "Upload tab" to load a `.gp`, `.gp5`, `.gpx`, `.gp7` or MusicXML file.

### Song stems (play along)

In the library, "From audio file" uploads an mp3/wav/flac/ogg/m4a (up to 50 MB); the server splits it with Demucs
(`htdemucs_6s`) into guitar, vocals, bass, drums, piano and other stems (one job at a time, queued).
The song screen has per-stem mute/solo/volume, 50–100% speed (pitch unchanged), an A–B loop and a
"Play along" preset (original guitar muted). Run once on the server:

```bash
apps/server/scripts/setup-demucs.sh   # needs uv + ffmpeg; installs CPU-only torch
```

Environment variables: `G3D_DEMUCS_PYTHON` (default `~/.local/share/guitar3d/demucs-venv/bin/python`),
`G3D_TMP_DIR` (default `~/.cache/g3d-tmp`), `DATA_DIR`. Songs live under `data/songs/<id>/` and are not included in backups.

#### From a link

"From link" (or paste a link anywhere on the library screen) downloads the audio of a page with
[yt-dlp](https://github.com/yt-dlp/yt-dlp) — YouTube, SoundCloud, Vimeo, Instagram, Internet Archive,
Wikimedia Commons and other sites it supports — then the song goes through the same validation and
separation queue (`POST /api/songs/from-link {url}`; status `queued → downloading → separating → ready`).
Audio only (`bestaudio`, extracted to m4a), first item of a playlist only, max 50 MB / 10 min, 120 s
timeout, no cookies and `--ignore-config`. Links must be http(s) and resolve to public addresses only.
The setup script installs yt-dlp (with `yt-dlp-ejs`; YouTube's player challenges run on the server's Node)
into the venv. Sites sometimes block server downloads (e.g. YouTube's "confirm you're not a bot"); the
card then says so and suggests uploading the file. Only add songs you have the right to use.

- `G3D_YTDLP`: yt-dlp binary (default: `yt-dlp` on PATH, else `<venv>/bin/yt-dlp`)
- `G3D_LINK_IMPORT=off`: turn the feature off (`GET /api/songs/separator` reports `linkImport`)
- `G3D_DELETE_LINK_ORIGINALS=0`: keep the downloaded original (default: deleted once the stems exist)
- `G3D_LINK_TIMEOUT_SECONDS` (default 120)

### Auto-transcription (tab + notation)

"Transcribe guitar" on a separated song, or "Transcribe my playing" in the library (microphone take,
optionally to a metronome with a count-in), turns audio into a library tab "<title> (auto)". The same setup
script installs Spotify Basic Pitch (ONNX backend, no TensorFlow) and librosa into the venv; jobs share the
one-at-a-time queue with Demucs. Post-processing (`apps/server/src/transcribe/`): beat grid and 16th
quantisation in 4/4, tuning detection (E / Eb standard, drop D, D standard, drop C#, drop C, plus detune in
cents) and capo suggestion, string/fret assignment by dynamic programming, a "Lead / riff" track (single notes,
double stops) and a "Rhythm" track (3+ note chords). Low-confidence notes are coloured in the player and
listed in the banner. Recordings are kept under `data/recordings/<jobId>/` and never served or backed up.

## Features

- **Reading and playing tabs:** powered by alphaTab. Playback supports speed control, a metronome, count-in and muting the guitar sound.
- **3D guitar:** drawn with react-three-fiber. A filled circle shows the note to play now, a ring shows the next note. Each string has its own color. The played string vibrates and the camera follows the notes.
- **Bar map:** shows the difficulty of every bar. Click a bar to loop it; Shift-click to select a range.
- **Rule-based tips:** automatically detects position shifts, wide stretches, barres, chord changes, speed and techniques (hammer-on, slide, bend, palm mute). No AI needed.
- **Tempo ladder:** speed goes up 5% after 3 clean passes. Progress is saved on the server.
- **"My guitars" screen:**
  - Click 4 points on a fretboard photo. The app corrects the perspective and maps the photo exactly onto the 3D neck.
  - The body photo is mapped onto the top of the body as well.

## The Veston model

The default model is the owner's Veston dreadnought guitar:
- matte black body with cream binding
- black pickguard and a mother-of-pearl style rosette
- tree-of-life fretboard inlay

The fretboard and headstock textures are generated from the photo `assets/photos/front-neck.jpg`:

```bash
python3 scripts/build-veston-textures.py
```

Because the photo was taken at a slight angle, all 20 fret wires were measured individually in the photo. The textures are corrected fret by fret, so the frets in the photo line up exactly with the 3D frets. The measurements are at the top of the script. The script writes its output to `apps/web/public/guitar/`.

## Your guitar's measurements

The file `data/guitar/guitar.json` overrides the `GuitarSpec` fields in `apps/web/src/fretboard/guitarSpec.ts`. Example:

```json
{ "scaleLength": 65.0, "bodyLength": 51, "lowerBout": 40, "inlayShape": "diamond", "inlays": [3, 5, 7, 9, 15], "doubleInlays": [12] }
```

## 3D body with Meshy

Meshy's official MCP server generates a 3D body model from photos.

1. Create an account at https://www.meshy.ai and get an API key. The Meshy API runs on paid credits.
2. Set the key as an environment variable in your terminal. For example, in the fish shell:

   ```bash
   set -Ux MESHY_API_KEY your-key
   ```

3. Add the MCP server to Claude Code:

   ```bash
   claude mcp add --scope user meshy -- npx -y @meshy-ai/meshy-mcp-server
   ```

Put the generated model at `data/guitar/body.glb`. The app uses it instead of the procedural body. Position and scale are set with the `bodyModel` field in `guitar.json`.

## Tests

```bash
npm test
npm run typecheck
```
