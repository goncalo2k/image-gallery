import { describe, it, expect } from 'vitest';
import type { AppContext } from '../app';
import { getPaginationParams, isValidImageName, parseCsv } from './utils';

const createContext = (params: Record<string, string | undefined>): AppContext => {
  return {
    req: {
      query: (key: string) => params[key],
    },
  } as unknown as AppContext;
};

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

describe('getPaginationParams', () => {
  it('returns sanitized pagination params when values are valid', () => {
    const ctx = createContext({ offset: '15', limit: '30' });

    expect(getPaginationParams(ctx)).toEqual({ offset: 15, limit: 30 });
  });

  it('falls back to defaults when params are invalid', () => {
    const ctx = createContext({ offset: '-5', limit: 'bad' });

    const result = getPaginationParams(ctx);
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(20);
  });

  it('caps limit at the provided maximum', () => {
    const ctx = createContext({ limit: '500' });

    expect(getPaginationParams(ctx, 10, 50)).toEqual({ offset: 0, limit: 50 });
  });
});
