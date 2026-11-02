import { localDevelopment } from './auth';
import { describe, expect, it } from 'vitest';

describe('local sign-in boundary', () => {
  it.each([
    ['http://127.0.0.1:5173', 'true', true],
    ['http://localhost:5173', 'true', true],
    ['https://ludus.workers.dev', 'true', false],
    ['http://127.0.0.1:5173', undefined, false],
    ['https://localhost.example.com', 'true', false],
  ])('requires explicit local config and a loopback host: %s', (url, flag, expected) => {
    expect(localDevelopment(new Request(url), { LOCAL_DEV: flag } as Env)).toBe(expected);
  });
});
