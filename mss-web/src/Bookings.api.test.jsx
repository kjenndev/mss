// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as api from './Data.Helper.Api';
beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true })); });
afterEach(() => vi.unstubAllGlobals());
it('uses the exact booking endpoints, public/auth boundaries and no-store admin reads', async () => {
  localStorage.setItem('mss-token', 'admin-token');
  await api.SubmitBooking({ submission_id: 'test' });
  expect(fetch.mock.calls[0][0]).toMatch(/\/api\/bookings$/);
  expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  expect(fetch.mock.calls[0][1].method).toBe('POST');
  await api.GetBookings(2, 20);
  await api.GetBooking(7);
  await api.AddBookingComment(7, { content: 'Note', submission_id: 'uuid' });
  await api.RetryBookingNotifications(7);
  expect(fetch.mock.calls.slice(1).map(([url]) => url.replace(/^.*\/api/, ''))).toEqual(['/admin/bookings?page=2&pageSize=20', '/admin/bookings/7', '/admin/bookings/7/comments', '/admin/bookings/7/retry-notifications']);
  for (const [, options] of fetch.mock.calls.slice(1)) expect(options.headers.Authorization).toBe('Bearer admin-token');
  expect(fetch.mock.calls[1][1].cache).toBe('no-store');
  expect(fetch.mock.calls[2][1].cache).toBe('no-store');
  expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({ content: 'Note', submission_id: 'uuid' });
  expect(JSON.parse(fetch.mock.calls[4][1].body)).toEqual({});
});
it('discards an obsolete admin read after the account changes', async () => {
  localStorage.setItem('mss-token', 'old');
  let finish; fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const pending = api.GetBooking(1);
  localStorage.setItem('mss-token', 'new'); finish({ ok: true });
  await expect(pending).rejects.toThrow(/Session changed/);
});
