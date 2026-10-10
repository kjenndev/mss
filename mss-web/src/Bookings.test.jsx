// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { normalizeEmail, validEmail } from '../../mss-api/email-settings.js';
import Bookings from './components/Bookings/Bookings';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
function fill() {
  change(/Venue name/, 'The Room'); change(/Contact name/, 'Sam'); change(/Phone/, '555-0100');
  change(/Email/, 'sam@example.com'); change(/Tell us/, 'A night of music');
}
it('allows an explicit new submission after a failed request without losing the entered details', async () => {
  api.SubmitBooking.mockResolvedValue({ ok: false, json: async () => ({ error: 'Unavailable.' }) });
  render(<Bookings />); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Send booking request' }));
  await screen.findByRole('alert');
  const original = api.SubmitBooking.mock.calls[0][0].submission_id;
  fireEvent.click(screen.getByRole('button', { name: 'Start a new request' }));
  expect(screen.getByLabelText(/Venue name/).value).toBe('The Room');
  fireEvent.click(screen.getByRole('button', { name: 'Send booking request' }));
  await screen.findByRole('alert');
  expect(api.SubmitBooking.mock.calls[1][0].submission_id).not.toBe(original);
});
it.each(['network', 'invalid-json'])('preserves the request and shows a useful %s failure', async failure => {
  if (failure === 'network') api.SubmitBooking.mockRejectedValue(TypeError('Failed to fetch'));
  else api.SubmitBooking.mockResolvedValue({ ok: false, json: async () => { throw SyntaxError('Unexpected token'); } });
  render(<Bookings />); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Send booking request' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Unable to send your request. Please retry.');
  expect(screen.getByLabelText(/Tell us/).value).toBe('A night of music');
});
it('omits event type, budget and attendance from the accessible form', () => {
  const { container } = render(<Bookings />);
  for (const name of ['event_type', 'budget', 'estimated_attendance']) expect(container.querySelector(`[name="${name}"]`)).toBeNull();
  expect(screen.queryByLabelText(/Event type|Budget|attendance/i)).toBeNull();
});
it('warns about uncertain duplicate requests without losing the draft', async () => {
  api.SubmitBooking.mockRejectedValue(Error('timeout'));
  render(<Bookings />); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Send booking request' }));
  await screen.findByRole('alert');
  expect(screen.getByText(/new request.*duplicate/i)).toBeTruthy();
});
it('sends the contract, locks duplicate clicks, retains draft and UUID across failures then resets after success', async () => {
  let finish;
  api.SubmitBooking.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Your booking request has been received.', reference: 'MSS-123' }) });
  render(<Bookings />); fill();
  fireEvent.click(screen.getByLabelText('DJs'));
  const button = screen.getByRole('button', { name: 'Send booking request' });
  fireEvent.click(button); fireEvent.click(button);
  expect(api.SubmitBooking).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(true);
  const payload = api.SubmitBooking.mock.calls[0][0];
  expect(payload).toMatchObject({ venue_name: 'The Room', contact_name: 'Sam', phone: '555-0100', email: 'sam@example.com', message: 'A night of music', services: ['djs'], website: '', event_date: '', location: '' });
  expect(payload.submission_id).toMatch(/^[0-9a-f-]{36}$/);
  for (const name of ['event_type', 'budget', 'estimated_attendance']) expect(payload).not.toHaveProperty(name);
  // Exercise the unchanged server validator without importing startup/DB or sending mail.
  const source = readFileSync('../mss-api/bookings.js', 'utf8');
  const validate = runInNewContext(source.slice(source.indexOf('const uuid ='), source.indexOf('// Forwarding headers')) + '\nvalidate', {
    normalizeEmail, validEmail, error: status => Object.assign(Error(), { status }),
  });
  const accepted = validate(payload);
  expect(accepted).toMatchObject({ venue_name: 'The Room', event_type: '', budget: '', estimated_attendance: null });
  expect(validate({ ...payload, event_type: 'Festival', budget: '$500', estimated_attendance: 100 })).toMatchObject({ event_type: 'Festival', budget: '$500', estimated_attendance: 100 });
  expect(() => validate({ ...payload, email: 'invalid' })).toThrow();
  expect(() => validate({ ...payload, estimated_attendance: -1 })).toThrow();
  await act(async () => finish({ ok: false, json: async () => ({ error: 'Please retry later.' }) }));
  expect(screen.getByRole('alert').textContent).toContain('Please retry later.');
  expect(screen.getByLabelText(/Venue name/).value).toBe('The Room');
  fireEvent.click(button);
  await screen.findByText(/MSS-123/);
  expect(api.SubmitBooking.mock.calls[1][0].submission_id).toBe(payload.submission_id);
  fireEvent.click(screen.getByRole('button', { name: 'Start another request' }));
  expect(screen.getByLabelText(/Venue name/).value).toBe('');
  fill(); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send booking request' })));
  expect(api.SubmitBooking.mock.calls[2][0].submission_id).not.toBe(payload.submission_id);
});
it('presents the three services, required accessible fields and inline validation', () => {
  render(<Bookings />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Bring/);
  expect(screen.getByText(/growing roster/)).toBeTruthy();
  expect(screen.getByText(/partner.*JDS Lasers/)).toBeTruthy();
  expect(screen.getByText(/own.*other platforms/)).toBeTruthy();
  expect(screen.getByText(/not a confirmed booking/)).toBeTruthy();
  expect(screen.getByText(/not public/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Send booking request' }));
  expect(screen.getByLabelText(/Venue name/).getAttribute('aria-invalid')).toBe('true');
  expect(api.SubmitBooking).not.toHaveBeenCalled();
  fill(); change(/Email/, 'bad');
  fireEvent.click(screen.getByRole('button', { name: 'Send booking request' }));
  expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
});
