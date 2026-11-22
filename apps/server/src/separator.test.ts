import { describe, it, expect } from 'vitest';
import { demucsPythonPath, overallProgress, parseDemucsProgress, separationTempDir } from './separator.js';

describe('demucs progress parsing', () => {
  it('reads the last tqdm percentage of a chunk', () => {
    expect(parseDemucsProgress(' 12%|█▏        | 6.3/52.65 [00:03<00:25,  1.82seconds/s]')).toBeCloseTo(0.12);
    const chunk = '\r  0%|          | 0.0/52.65 [00:00<?, ?seconds/s]\r 45%|████▌     | 23.4/52.65 [00:10<00:12]\r 47%|████▋     |';
    expect(parseDemucsProgress(chunk)).toBeCloseTo(0.47);
    expect(parseDemucsProgress('100%|██████████| 52.65/52.65 [00:21<00:00]')).toBe(1);
  });

  it('ignores lines without a bar', () => {
    expect(parseDemucsProgress('Separated tracks will be stored in /x/htdemucs_6s')).toBeNull();
    expect(parseDemucsProgress('Separating track 50% done')).toBeNull();
  });

  it('maps demucs + encoding into one 0..1 progress', () => {
    expect(overallProgress(0)).toBe(0);
    expect(overallProgress(0.5)).toBeCloseTo(0.46);
    expect(overallProgress(1, 3)).toBeCloseTo(0.96);
    expect(overallProgress(1, 6)).toBe(1);
  });
});

describe('paths', () => {
  it('finds the venv python from the env var or the default location', () => {
    expect(demucsPythonPath({ G3D_DEMUCS_PYTHON: '/opt/py/bin/python' }, '/home/u')).toBe('/opt/py/bin/python');
    expect(demucsPythonPath({}, '/home/u')).toBe('/home/u/.local/share/guitar3d/demucs-venv/bin/python');
    expect(demucsPythonPath({ XDG_DATA_HOME: '/data' }, '/home/u')).toBe('/data/guitar3d/demucs-venv/bin/python');
  });

  it('keeps scratch files out of /tmp', () => {
    expect(separationTempDir({}, '/home/u')).toBe('/home/u/.cache/g3d-tmp');
    expect(separationTempDir({ G3D_TMP_DIR: '/srv/tmp' }, '/home/u')).toBe('/srv/tmp');
  });
});
