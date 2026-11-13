import { it, expect } from 'vitest';
import { importer, Settings } from '@coderline/alphatab';
import { firstOctave, neckNotes, scaleExercise, scalePositions } from './scales';
import { sequenceTex } from './tex';
import { withTitle } from '../tabs/textImport';
it('scale exercise tex parses', () => {
  for (const p of ['updown', 'thirds', 'threes', 'fours'] as const) {
    const notes = scalePositions(9, 'minor-pent')[0].notes;
    const tex = withTitle(sequenceTex(scaleExercise(notes, p), { tempo: 100 }), 'A minör · 1. kutu');
    const imp = new importer.AlphaTexImporter();
    imp.initFromString(tex, new Settings());
    const score = imp.readScore();
    expect(score.title).toBe('A minör · 1. kutu');
    expect(score.tracks[0].staves[0].bars.length).toBeGreaterThan(1);
  }
  expect(firstOctave(neckNotes(0, 'major')).length).toBe(8);
});
