/**
 * Benchmark step: raw transcription JSON → the auto tab the app would make → every tab note with
 * its time in the audio (from the tab's barTimes), as the player would play it along the song.
 *   npx tsx bench/tab.ts raw.json out.json
 */
import fs from 'node:fs';
import * as alphaTab from '@coderline/alphatab';
import { autoBarTimes } from '@guitar3d/shared';
import { buildAutoTab, type RawTranscription } from '../src/transcribe/index.js';

const [rawFile, outFile] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(rawFile, 'utf8')) as RawTranscription;
const auto = buildAutoTab(raw, { title: 'bench' });
const barTimes = autoBarTimes(auto.info)!;
const imp = new alphaTab.importer.AlphaTexImporter();
imp.initFromString(auto.tex, new alphaTab.Settings());
const score = imp.readScore();
const notes: { track: string; start: number; pitch: number; string: number; fret: number }[] = [];
for (const track of score.tracks)
  for (const bar of track.staves[0].bars) {
    const mb = bar.masterBar;
    const t0 = barTimes[mb.index];
    const t1 = barTimes[mb.index + 1] ?? t0 + (t0 - (barTimes[mb.index - 1] ?? t0 - 2));
    for (const beat of bar.voices[0].beats)
      for (const n of beat.notes) {
        if (n.isTieDestination || n.isDead) continue;
        notes.push({ track: track.name, start: t0 + (beat.playbackStart / mb.calculateDuration()) * (t1 - t0), pitch: n.realValue, string: n.string, fret: n.fret });
      }
  }
fs.writeFileSync(outFile, JSON.stringify({ summary: auto.summary, barTimes, notes }));
console.log(JSON.stringify({ ...auto.summary, strum: undefined }));
