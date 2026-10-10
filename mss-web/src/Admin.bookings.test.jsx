// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import AdminBookings, { BookingDetail } from './components/Bookings/AdminBookings';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api', () => ({ GetBookings: vi.fn(), GetBooking: vi.fn(), AddBookingComment: vi.fn(), RetryBookingNotifications: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); });
afterEach(cleanup);
const response = data => ({ ok: true, json: async () => data });
const record = { id: 1, reference: 'MSS-001', venue_name: '<img src=x onerror=alert(1)>', contact_name: 'Sam', email: 'sam@example.com', phone: '555-0100', services: ['djs', 'lasers'], message: '<script>bad()</script>', event_date: '2026-12-01', created_at: '2026-10-10T10:00:00Z' };
const detail = { booking: record, comments: [], notification: { status: 'failed', sent: 0, total: 2, can_retry: true } };
function showDetail() { return render(<MemoryRouter initialEntries={['/admin/bookings/1']}><Routes><Route path="/admin/bookings/:id" element={<BookingDetail />} /></Routes></MemoryRouter>); }
it('omits delivery controls and never polls or retries notifications while preserving drafts', async () => {
  vi.useFakeTimers();
  try {
    api.GetBooking.mockResolvedValue(response({ ...detail, notification: { status: 'pending', sent: 0, total: 2, can_retry: true, retry_scheduled: true } }));
    showDetail(); await act(async () => {});
    expect(screen.queryByRole('region', { name: 'Email notifications' })).toBeNull();
    expect(screen.queryByRole('button', { name: /notification|delivery/i })).toBeNull();
    fireEvent.change(screen.getByLabelText('Internal comment'), { target: { value: 'Keep this draft' } });
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(api.GetBooking).toHaveBeenCalledTimes(1);
    expect(api.RetryBookingNotifications).not.toHaveBeenCalled();
    expect(api.AddBookingComment).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Internal comment').value).toBe('Keep this draft');
  } finally { cleanup(); vi.useRealTimers(); }
});
it('loads details and saves comments without notification metadata', async () => {
  api.GetBooking.mockResolvedValue(response({ booking: record, comments: [] }));
  api.AddBookingComment.mockResolvedValue(response({ comment: { id: 9, author_name: 'Admin', content: 'Planning note', created_at: record.created_at } }));
  showDetail(); await screen.findByText(record.email);
  fireEvent.change(screen.getByLabelText('Internal comment'), { target: { value: 'Planning note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
  await screen.findByText('Comment added.');
  expect(screen.getByText('Planning note')).toBeTruthy();
  expect(api.RetryBookingNotifications).not.toHaveBeenCalled();
});
it('enforces the backend 3000-character comment boundary', async () => {
  api.GetBooking.mockResolvedValue(response(detail));
  api.AddBookingComment.mockResolvedValue(response({ comment: { id: 9, content: 'saved', created_at: record.created_at } }));
  showDetail(); await screen.findByText(record.email);
  const input = screen.getByLabelText('Internal comment');
  expect(input.maxLength).toBe(3000);
  fireEvent.change(input, { target: { value: 'x'.repeat(3001) } });
  fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
  expect(api.AddBookingComment).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toMatch(/3000/);
  fireEvent.change(input, { target: { value: 'x'.repeat(3000) } });
  fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
  await screen.findByText('Comment added.');
  expect(api.AddBookingComment.mock.calls[0][1].content.length).toBe(3000);
});
it('allows starting a new comment after an uncertain failure while retaining the draft', async () => {
  api.GetBooking.mockResolvedValue(response(detail));
  api.AddBookingComment.mockRejectedValue(Error());
  showDetail(); await screen.findByText(record.email);
  fireEvent.change(screen.getByLabelText('Internal comment'), { target: { value: 'Draft note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add comment' })); await screen.findByRole('alert');
  const original = api.AddBookingComment.mock.calls[0][1].submission_id;
  fireEvent.click(screen.getByRole('button', { name: 'Start a new comment' }));
  expect(screen.getByLabelText('Internal comment').value).toBe('Draft note');
  fireEvent.click(screen.getByRole('button', { name: 'Add comment' })); await screen.findByRole('alert');
  expect(api.AddBookingComment.mock.calls[1][1].submission_id).not.toBe(original);
});
it('shows useful detail and comment network errors with recoverable drafts', async () => {
  api.GetBooking.mockRejectedValueOnce(TypeError('Failed to fetch')).mockResolvedValueOnce(response(detail));
  api.AddBookingComment.mockRejectedValue(TypeError('Failed to fetch'));
  showDetail();
  expect((await screen.findByRole('alert')).textContent).toBe('Unable to load booking request. Please retry.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText(record.email);
  fireEvent.change(screen.getByLabelText('Internal comment'), { target: { value: 'Keep this' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Unable to add comment. Please retry.');
  expect(screen.getByLabelText('Internal comment').value).toBe('Keep this');
});
it('discards inbox bodies when the account changes during parsing', async () => {
  localStorage.setItem('mss-token', 'old');
  let finish;
  api.GetBookings.mockResolvedValue({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) });
  render(<MemoryRouter><AdminBookings /></MemoryRouter>);
  await act(async () => {}); localStorage.setItem('mss-token', 'new');
  await act(async () => finish({ requests: [record], total: 1 }));
  expect(screen.queryByText(record.venue_name)).toBeNull();
});
it('discards late comment results after account changes', async () => {
  api.GetBooking.mockResolvedValue(response(detail));
  let finish;
  api.AddBookingComment.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  showDetail(); await screen.findByText(record.email);
  fireEvent.change(screen.getByLabelText('Internal comment'), { target: { value: 'Secret note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
  localStorage.setItem('mss-token', 'new');
  await act(async () => finish(response({ comment: { id: 4, content: 'Secret note', created_at: record.created_at } })));
  expect(screen.queryByText('Comment added.')).toBeNull();
});
it('discards detail bodies if the authenticated identity changes while JSON is loading', async () => {
  localStorage.setItem('mss-token', 'old');
  let finish;
  api.GetBooking.mockResolvedValue({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) });
  showDetail();
  await act(async () => {});
  localStorage.setItem('mss-token', 'new');
  await act(async () => finish(detail));
  expect(screen.queryByText(record.email)).toBeNull();
});
it('renders private detail, services and timestamped escaped comments; retains a failed comment and its retry UUID', async () => {
  api.GetBooking.mockResolvedValue(response(detail));
  let finish;
  api.AddBookingComment.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(response({ comment: { id: 1, author_name: 'Admin', content: '<script>note</script>', created_at: record.created_at } }));
  showDetail();
  expect(screen.getByRole('status').textContent).toMatch(/Loading/);
  await screen.findByText(record.email);
  expect(screen.getByText(record.phone)).toBeTruthy();
  expect(screen.getByText('DJs, Laser art')).toBeTruthy();
  expect(screen.getByText(record.message)).toBeTruthy();
  expect(screen.getByText(/Only administrators/)).toBeTruthy();
  expect(screen.getByText('No internal comments yet.')).toBeTruthy();
  const input = screen.getByLabelText('Internal comment');
  fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
  expect(api.AddBookingComment).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '<script>note</script>' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
  expect(screen.getByRole('button', { name: 'Saving comment…' }).disabled).toBe(true);
  await act(async () => finish({ ok: false, json: async () => ({ error: 'Comment unavailable.' }) }));
  await screen.findByText('Comment unavailable.');
  expect(input.value).toBe('<script>note</script>');
  fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
  await screen.findByText('Comment added.');
  expect(input.value).toBe('');
  expect(api.AddBookingComment.mock.calls[0][1]).toEqual(api.AddBookingComment.mock.calls[1][1]);
  expect(api.AddBookingComment.mock.calls[0][1].submission_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(screen.getByText('<script>note</script>')).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('time[datetime="2026-10-10T10:00:00Z"]')).toBeTruthy();
});
it('loads a paginated inbox with safe text, loading, errors, retry and empty states', async () => {
  api.GetBookings.mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(response({ requests: [{ ...record, comment_count: 2, notification_status: 'failed' }], total: 21, page: 1, pageSize: 20 })).mockResolvedValueOnce(response({ requests: [], total: 21, page: 2, pageSize: 20 }));
  render(<MemoryRouter><AdminBookings /></MemoryRouter>);
  expect(screen.getByRole('status').textContent).toMatch(/Loading/);
  await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  const link = await screen.findByRole('link', { name: record.venue_name });
  expect(link.getAttribute('href')).toBe('/admin/bookings/1');
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByText(/2 comments/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText('No booking requests on this page.');
  expect(api.GetBookings).toHaveBeenLastCalledWith(2, 20);
});

it.each(['read', 'comment'])('discards late %s results across booking routes', async kind => {
  let finish;
  const deferred = new Promise(resolve => { finish = resolve; });
  api.GetBooking.mockImplementation(id => id === '2' ? Promise.resolve(response({ booking: { ...record, id: 2, email: 'second@example.com' }, comments: [] })) : kind === 'read' ? deferred : Promise.resolve(response(detail)));
  api.AddBookingComment.mockReturnValue(deferred);
  render(<MemoryRouter initialEntries={['/admin/bookings/1']}><Link to="/admin/bookings/2">Next booking</Link><Routes><Route path="/admin/bookings/:id" element={<BookingDetail />} /></Routes></MemoryRouter>);
  if (kind === 'comment') {
    await screen.findByText(record.email);
    fireEvent.change(screen.getByLabelText('Internal comment'), { target: { value: 'Old draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
  }
  fireEvent.click(screen.getByRole('link', { name: 'Next booking' }));
  await screen.findByText('second@example.com');
  fireEvent.change(screen.getByLabelText('Internal comment'), { target: { value: 'New draft' } });
  await act(async () => finish(response(kind === 'read' ? detail : { comment: { id: 4, content: 'Obsolete comment', created_at: record.created_at } })));
  expect(screen.queryByText(record.email)).toBeNull();
  expect(screen.queryByText('Obsolete comment')).toBeNull();
  expect(screen.queryByText('Comment added.')).toBeNull();
  expect(screen.getByLabelText('Internal comment').value).toBe('New draft');
});
