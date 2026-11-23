/**
 * Ground truth for the transcription benchmark: a Guitar Pro file → a MIDI file of every track
 * (to render to audio) and the JSON note list of its guitar tracks.
 *   npx tsx bench/gt.ts song.gp3 out/dir
 */
import fs from 'node:fs';
import path from 'node:path';
import * as alphaTab from '@coderline/alphatab';

const [file, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const settings = new alphaTab.Settings();
const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(fs.readFileSync(file)), settings);
console.log(score.title, score.tempo, 'bpm', score.masterBars.length, 'bars');
score.tracks.forEach((t, i) => console.log(i, t.name, 'program', t.playbackInfo.program, 'ch', t.playbackInfo.primaryChannel, t.staves[0].isPercussion ? 'drums' : t.staves[0].tuning.join(',')));

const midi = new alphaTab.midi.MidiFile();
const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midi, true);
const gen = new alphaTab.midi.MidiFileGenerator(score, settings, handler);
gen.generate();
fs.writeFileSync(path.join(outDir, 'song.mid'), midi.toBinary());

// Note times come from the MIDI (repeats unrolled) in bench/eval.py; here only the track info.
const out = { title: score.title, tempo: score.tempo, tracks: score.tracks.map((t) => ({ name: t.name, program: t.playbackInfo.program, channels: [t.playbackInfo.primaryChannel, t.playbackInfo.secondaryChannel], drums: t.staves[0].isPercussion, tuning: t.staves[0].tuning })) };
fs.writeFileSync(path.join(outDir, 'gt.json'), JSON.stringify(out));

