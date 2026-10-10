// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { UpdateArtist } from './Data.Helper.Api';
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('sends exactly a nullable cover association through the real API whitelist', async () => {
  localStorage.setItem('mss-token', 'synthetic-token');
  const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetch);
  await UpdateArtist({ id: 7, cover_photo: null });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/\/api\/artists\/7$/);
  expect(options.method).toBe('PUT');
  expect(options.headers.Authorization).toBe('Bearer synthetic-token');
  expect(JSON.parse(options.body)).toEqual({ cover_photo: null });
});
