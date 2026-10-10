// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { DeleteBooking } from './Data.Helper.Api';
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it('sends authenticated DELETE with encoded identifier and no booking changes in the body', async () => {
  localStorage.setItem('mss-token', 'synthetic-admin-token');
  const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetch);
  await DeleteBooking('synthetic/id?x');
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/\/admin\/bookings\/synthetic%2Fid%3Fx$/);
  expect(options.method).toBe('DELETE');
  expect(options.headers.Authorization).toBe('Bearer synthetic-admin-token');
  expect(options.body).toBeUndefined();
});
