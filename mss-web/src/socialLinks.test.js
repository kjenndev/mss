import { describe, expect, it } from 'vitest';
import { safeSocialUrl } from './socialLinks';

describe('safeSocialUrl', () => {
  it.each([
    [' https://example.com/a%20b?q=one%20two#music ', 'https://example.com/a%20b?q=one%20two#music'],
    ['http://example.com/legacy', 'http://example.com/legacy'],
    ['HTTPS://example.com/profile', 'HTTPS://example.com/profile'],
  ])('accepts and trims safe absolute HTTP(S) URL %j', (value, expected) => {
    expect(safeSocialUrl(value)).toBe(expected);
  });

  it.each([
    '', '   ', '/relative', '//example.com/profile', 'https:///example.com/profile',
    'javascript:alert(1)', 'https:example.com', 'https:\\example.com',
    'https://user:pass@example.com/profile', 'https://example.com/has space',
    'https://example.com/line\nbreak', 'https://example.com/\u0000control',
  ])('rejects blank, repaired, credentialed, or whitespace/control URL %j', value => {
    expect(safeSocialUrl(value)).toBeNull();
  });
});
