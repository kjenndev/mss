// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import AdminBookings from './components/Bookings/AdminBookings';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api', () => ({ GetBookings: vi.fn(), DeleteBooking: vi.fn() }));
const booking = { id: '1', venue_name: 'Synthetic venue', reference: 'MSS-TEST-001', contact_name: 'Sam', created_at: '2026-10-10T10:00:00Z', comment_count: 2, notification_status: 'pending' };
const response = data => ({ ok: true, json: async () => data });
const page = (requests = [booking], total = requests.length) => response({ requests, total });
const show = () => render(<MemoryRouter><AdminBookings /></MemoryRouter>);
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); api.GetBookings.mockResolvedValue(page()); });
afterEach(cleanup);
it('opens a named permanent-delete confirmation by keyboard and cancels without a request', async () => {
  const user = userEvent.setup(); show();
  const trigger = await screen.findByRole('button', { name: 'Delete booking request MSS-TEST-001' });
  act(() => trigger.focus()); await user.keyboard('{Enter}');
  const dialog = screen.getByRole('dialog', { name: 'Delete booking request?' });
  expect(within(dialog).getByText(/Synthetic venue/)).toBeTruthy();
  expect(within(dialog).getByText(/MSS-TEST-001/)).toBeTruthy();
  expect(dialog.textContent).toMatch(/permanently/i);
  expect(dialog.textContent).toMatch(/cannot be undone/i);
  expect(dialog.textContent).toMatch(/already sent|in flight/i);
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(api.DeleteBooking).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
  expect(screen.getByRole('link', { name: booking.venue_name })).toBeTruthy();
});

it('guards duplicate deletes, preserves the row on failure, then refreshes only after success', async () => {
  const user = userEvent.setup(); let finish;
  api.DeleteBooking.mockReturnValueOnce(new Promise(r => { finish = r; })).mockResolvedValueOnce(response({ deleted: true }));
  show(); await user.click(await screen.findByRole('button', { name: 'Delete booking request MSS-TEST-001' }));
  await user.dblClick(screen.getByRole('button', { name: 'Permanently delete' }));
  expect(api.DeleteBooking).toHaveBeenCalledTimes(1);
  expect(api.DeleteBooking).toHaveBeenCalledWith('1');
  expect(screen.getByRole('button', { name: 'Deleting…' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
  await user.keyboard('{Escape}'); expect(screen.getByRole('dialog')).toBeTruthy();
  await act(async () => finish({ ok: false, json: async () => ({ error: 'Unable to delete.' }) }));
  expect((await screen.findByRole('alert')).textContent).toBe('Unable to delete.');
  expect(api.GetBookings).toHaveBeenCalledTimes(1);
  expect(document.querySelector('a[href="/admin/bookings/1"]')).toBeTruthy();
  api.GetBookings.mockResolvedValue(page([]));
  await user.click(screen.getByRole('button', { name: 'Permanently delete' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByText('No booking requests on this page.')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toMatch(/MSS-TEST-001.*deleted/);
  expect(api.GetBookings).toHaveBeenCalledTimes(2);
});

it('refetches the current page then falls back to the new last page without skipping rows', async () => {
  const user = userEvent.setup();
  api.GetBookings.mockResolvedValueOnce(page([{ ...booking, id: 'first', reference: 'FIRST' }], 21))
    .mockResolvedValueOnce(page([booking], 21))
    .mockResolvedValueOnce(page([], 20))
    .mockResolvedValueOnce(page([{ ...booking, id: 'remaining', reference: 'REMAINING' }], 20));
  api.DeleteBooking.mockResolvedValue(response({ deleted: true }));
  show(); await screen.findByText(/21 requests/);
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await user.click(await screen.findByRole('button', { name: 'Delete booking request MSS-TEST-001' }));
  await user.click(screen.getByRole('button', { name: 'Permanently delete' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByRole('button', { name: 'Delete booking request REMAINING' })).toBeTruthy();
  expect(api.GetBookings.mock.calls).toEqual([[1, 20], [2, 20], [2, 20], [1, 20]]);
  expect(screen.getByText('20 requests · Page 1')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next page' }).disabled).toBe(true);
});

it('refills the same offset page after deletion rather than locally removing and skipping a row', async () => {
  const user = userEvent.setup();
  api.GetBookings.mockResolvedValueOnce(page([booking], 22)).mockResolvedValueOnce(page([{ ...booking, id: 'replacement', reference: 'REFILL' }], 21));
  api.DeleteBooking.mockResolvedValue(response({ deleted: true }));
  show(); await user.click(await screen.findByRole('button', { name: 'Delete booking request MSS-TEST-001' }));
  await user.click(screen.getByRole('button', { name: 'Permanently delete' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByRole('button', { name: 'Delete booking request REFILL' })).toBeTruthy();
  expect(api.GetBookings.mock.calls).toEqual([[1, 20], [1, 20]]);
});
it.each(['network', 'malformed'])('keeps the target after %s failure', async kind => {
  const user = userEvent.setup();
  if (kind === 'network') api.DeleteBooking.mockRejectedValue(Error('offline'));
  else api.DeleteBooking.mockResolvedValue(response({}));
  show(); await user.click(await screen.findByRole('button', { name: 'Delete booking request MSS-TEST-001' }));
  await user.click(screen.getByRole('button', { name: 'Permanently delete' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/Unable to delete/);
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('link', { name: booking.venue_name })).toBeTruthy();
  expect(api.GetBookings).toHaveBeenCalledTimes(1);
});
it('retains a confirmed success when refresh fails, and Retry only reloads the inbox', async () => {
  const user = userEvent.setup();
  api.GetBookings.mockResolvedValueOnce(page()).mockRejectedValueOnce(Error()).mockResolvedValueOnce(page([]));
  api.DeleteBooking.mockResolvedValue(response({ deleted: true }));
  show(); await user.click(await screen.findByRole('button', { name: 'Delete booking request MSS-TEST-001' }));
  await user.click(screen.getByRole('button', { name: 'Permanently delete' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((await screen.findByRole('alert')).textContent).toMatch(/load booking/);
  expect(screen.getByRole('status').textContent).toMatch(/deleted permanently/);
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('No booking requests on this page.');
  expect(api.DeleteBooking).toHaveBeenCalledTimes(1);
});
it.each(['account', 'route'])('discards late deletion results after a %s change', async kind => {
  const user = userEvent.setup(); let finish;
  api.DeleteBooking.mockReturnValue(new Promise(r => { finish = r; }));
  render(<MemoryRouter initialEntries={['/admin/bookings']}><Link to="/away">Away</Link><Routes><Route path="/admin/bookings" element={<AdminBookings />} /><Route path="/away" element={<h1>Other page</h1>} /></Routes></MemoryRouter>);
  await user.click(await screen.findByRole('button', { name: 'Delete booking request MSS-TEST-001' }));
  await user.click(screen.getByRole('button', { name: 'Permanently delete' }));
  if (kind === 'account') localStorage.setItem('mss-token', 'new');
  else { act(() => document.querySelector('a[href="/away"]').click()); await screen.findByRole('heading', { name: 'Other page' }); }
  await act(async () => finish(response({ deleted: true })));
  expect(screen.queryByText(/deleted permanently/)).toBeNull();
  expect(api.GetBookings).toHaveBeenCalledTimes(1);
});
it('requires reload if identity changes after opening confirmation', async () => {
  const user = userEvent.setup(); show();
  await user.click(await screen.findByRole('button', { name: 'Delete booking request MSS-TEST-001' }));
  localStorage.setItem('mss-token', 'new');
  await user.click(screen.getByRole('button', { name: 'Permanently delete' }));
  expect(screen.getByRole('alert').textContent).toMatch(/account changed/);
  expect(api.DeleteBooking).not.toHaveBeenCalled();
});
