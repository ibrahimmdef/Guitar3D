import { describe, expect, it } from 'vitest';
import { findLink } from './data';

describe('findLink', () => {
  it('picks the first http(s) link out of pasted text', () => {
    expect(findLink('check this https://youtu.be/abc?t=3 out')).toBe('https://youtu.be/abc?t=3');
    expect(findLink('http://archive.org/details/x\nmore')).toBe('http://archive.org/details/x');
    expect(findLink('no link here')).toBeNull();
    expect(findLink('file:///etc/passwd')).toBeNull();
  });
});
