# Guitar3D

A guitar practice app that runs entirely in the browser. Load a Guitar Pro tab and practise it with
the notes shown as bubbles on a 3D model of **your own guitar**.

No server, no account: everything (tabs, guitars, progress) is stored in the browser's IndexedDB.

## Features

- **Tabs:** Guitar Pro (`.gp`, `.gp3`–`.gp7`, `.gpx`), MusicXML and alphaTex files; also plain-text
  ASCII tabs, PDFs and tab images (OCR). Rendered and played with [alphaTab](https://alphatab.net).
- **3D guitar:** react-three-fiber. A filled disc shows the note to play now, rings show the next
  ones, the camera follows the hand.
- **Your guitar:** build it from a template, or from photos: click the corners of the fretboard and
  the photo is warped fret by fret onto the 3D neck.
- **Practice:** speed control, A–B loop, metronome, a speed trainer that raises the tempo after
  clean passes, and rule-based tips (position shifts, stretches, barres…).
- **Microphone:** tuner, listen mode (waits until you play the right note) and a coach that scores
  a recorded pass against the tab.
- **Learning:** chord and scale libraries on your guitar, a tab editor, progress charts and badges.
- **Backup:** export everything to one JSON file and import it in another browser.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm test           # unit tests (vitest)
npm run typecheck
npm run build      # static site in apps/web/dist
```

## Layout

```
apps/web/src
  storage/       IndexedDB database, tab library, guitars, backup file
  player/        alphaTab wrapper (useAlphaTab), beats → fret notes, speed ladder
  fretboard/     3D guitar: geometry (pure math), meshes, note markers, camera
  guitar-setup/  "My guitars": wizard, photo pipeline (lib/), templates
  audio/         pitch detection (YIN), metronome clicks, mic input
  coach/         scoring a recorded pass: onsets, expected notes, matching
  tips/          rule-based difficulty analysis of a tab
  tabs/          importers: ASCII tab, PDF text, OCR, built-in lessons
  screens/       one folder per screen (library, player, guitar, tuner…)
packages/shared  types and music helpers (guitar profile, chords, fingering)
```

A guide in Turkish explaining how each part works and what to learn: [docs/OGRENME.md](docs/OGRENME.md).

## The Veston model

The built-in guitar is a Veston dreadnought. Its fretboard and headstock textures are generated
from `assets/photos/front-neck.jpg` with `python3 scripts/build-veston-textures.py` (output in
`apps/web/public/guitar/`). Guitar templates are written by `npx tsx scripts/gen-guitar-templates.ts`.
