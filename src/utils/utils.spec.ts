import { describe, it, expect } from 'vitest';
import { isValidImageName, parseCsv } from './utils';

describe('parseCsv', () => {
  it('splits and trims values', () => {
    expect(parseCsv('a, b , ,c')).toEqual(['a', 'b', 'c']);
  });
});

describe('isValidImageName', () => {
  it('accepts alphanumeric names with optional extension', () => {
    expect(isValidImageName('photo.png')).toBe(true);
    expect(isValidImageName('Photo.PNG')).toBe(true);
    expect(isValidImageName('my image-01.jpg')).toBe(true);
  });

  it('rejects paths with invalid characters', () => {
    expect(isValidImageName('../secret.png')).toBe(false);
    expect(isValidImageName('')).toBe(false);
    expect(isValidImageName(undefined)).toBe(false);
  });
});
