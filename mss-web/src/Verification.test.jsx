// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VerifyEmail from './components/Auth/VerifyEmail';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api', () => ({ GetVerificationInfo: vi.fn(), VerifyEmail: vi.fn(), HasSession: vi.fn(), Authenticate: vi.fn() }));
const response = data => ({ ok: true, json: async () => data });
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); });
function open() {
  window.history.replaceState(null, '', '/verify-email#token=fixture-token');
  return render(<StrictMode><MemoryRouter><VerifyEmail /></MemoryRouter></StrictMode>);
}
it('scrubs fragment, only reads info on mount, and requires fresh choices before completion', async () => {
  api.GetVerificationInfo.mockResolvedValue(response({ purpose: 'registration', username: 'suggested' }));
  api.VerifyEmail.mockResolvedValue(response({ success: true }));
  open();
  expect(window.location.hash).toBe('');
  expect((await screen.findByLabelText(/^Username/)).value).toBe('suggested');
  expect(api.GetVerificationInfo).toHaveBeenCalledWith({ token: 'fixture-token' });
  expect(api.VerifyEmail).not.toHaveBeenCalled();
  const password = screen.getByLabelText(/^Password/);
  expect(password.autocomplete).toBe('new-password');
  expect(password.minLength).toBe(5); expect(password.maxLength).toBe(1024);
  expect(screen.getByLabelText(/Receive email alerts/).checked).toBe(false);
  const button = screen.getByRole('button', { name: 'Complete registration' });
  fireEvent.submit(button.closest('form'));
  expect(api.VerifyEmail).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: 'fresh-choice' } });
  fireEvent.change(password, { target: { value: 'fresh password 123' } });
  fireEvent.click(screen.getByLabelText(/18 years/));
  fireEvent.click(screen.getByLabelText(/I agree/));
  fireEvent.click(button); fireEvent.click(button);
  await screen.findByText(/Email verified/);
  expect(api.VerifyEmail).toHaveBeenCalledTimes(1);
  expect(api.VerifyEmail).toHaveBeenCalledWith({ token: 'fixture-token', username: 'fresh-choice', password: 'fresh password 123', accept_terms: true, confirm_adult: true, terms_version: '2026-10-03', privacy_version: '2026-10-03', email_alerts_opt_in: false });
  expect(api.Authenticate).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});
it('discards stale StrictMode info without overwriting edited username', async () => {
  let first;
  api.GetVerificationInfo.mockReturnValueOnce(new Promise(resolve => { first = resolve; }))
    .mockResolvedValueOnce(response({ purpose: 'registration', username: 'suggested' }));
  open();
  fireEvent.change(await screen.findByLabelText(/^Username/), { target: { value: 'draft' } });
  await act(async () => first(response({ purpose: 'registration', username: 'stale' })));
  expect(screen.getByLabelText(/^Username/).value).toBe('draft');
  expect(api.VerifyEmail).not.toHaveBeenCalled();
});
it('offers both signup resend and authenticated Account Settings recovery for expired links', async () => {
  api.GetVerificationInfo.mockResolvedValue({ ok: false, status: 400 });
  open();
  await screen.findByText(/expired/);
  expect(screen.getByRole('link', { name: 'Resend verification email' }).getAttribute('href')).toBe('/resend-verification');
  expect(screen.getByRole('link', { name: 'Account Settings' }).getAttribute('href')).toBe('/account');
  expect(screen.getByText(/new email-change link/)).toBeTruthy();
  expect(api.VerifyEmail).not.toHaveBeenCalled();
});
it('requires a logged-in account and current password for email change, retaining token through 401 retry', async () => {
  api.GetVerificationInfo.mockResolvedValue(response({ purpose: 'email_change' }));
  api.HasSession.mockReturnValue(false);
  api.VerifyEmail.mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValueOnce(response({ success: true }));
  open();
  const password = await screen.findByLabelText(/^Current password/);
  expect(password.autocomplete).toBe('current-password');
  expect(screen.queryByLabelText(/^Username/)).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  const button = screen.getByRole('button', { name: 'Confirm email change' });
  fireEvent.change(password, { target: { value: 'OlD4' } });
  fireEvent.click(button);
  expect(api.VerifyEmail).not.toHaveBeenCalled();
  await screen.findByText(/Sign in to the account requesting this change/);
  api.HasSession.mockReturnValue(true);
  fireEvent.click(button);
  await screen.findByText(/Sign in to the account requesting this change/);
  fireEvent.click(button);
  await screen.findByText(/Email verified/);
  expect(api.VerifyEmail).toHaveBeenCalledTimes(2);
  expect(api.VerifyEmail).toHaveBeenLastCalledWith({ token: 'fixture-token', current_password: 'OlD4' }, true);
  expect(screen.getByRole('link', { name: /Sign in.*tab/ }).getAttribute('href')).toBe('/login');
  expect(localStorage.length).toBe(0);
});

it.each([4, 1025])('rejects a %i-character completion password even with agreements checked', async length => {
  api.GetVerificationInfo.mockResolvedValue(response({ purpose: 'registration', username: 'suggested' }));
  open();
  fireEvent.change(await screen.findByLabelText(/^Password/), { target: { value: 'x'.repeat(length) } });
  fireEvent.click(screen.getByLabelText(/18 years/)); fireEvent.click(screen.getByLabelText(/I agree/));
  fireEvent.submit(screen.getByRole('button', { name: 'Complete registration' }).closest('form'));
  expect(api.VerifyEmail).not.toHaveBeenCalled();
  await screen.findByText(/Password must be between 5 and 1024/);
});
it('submits an explicitly selected optional alert preference and accepts a pasted password', async () => {
  api.GetVerificationInfo.mockResolvedValue(response({ purpose: 'registration', username: 'suggested' }));
  api.VerifyEmail.mockResolvedValue(response({ success: true }));
  open();
  const password = await screen.findByLabelText(/^Password/);
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  expect(password.dispatchEvent(paste)).toBe(true);
  fireEvent.change(password, { target: { value: 'pasted password 123' } });
  fireEvent.click(screen.getByLabelText(/18 years/)); fireEvent.click(screen.getByLabelText(/I agree/));
  fireEvent.click(screen.getByLabelText(/Receive email alerts/));
  fireEvent.click(screen.getByRole('button', { name: 'Complete registration' }));
  await screen.findByText(/Email verified/);
  expect(api.VerifyEmail.mock.calls[0][0].email_alerts_opt_in).toBe(true);
});
it('does not mutate after unmount while token info is pending', async () => {
  let resolve;
  api.GetVerificationInfo.mockImplementation(() => new Promise(r => { resolve = r; }));
  const view = open(); view.unmount();
  await act(async () => resolve(response({ purpose: 'registration', username: 'late' })));
  expect(api.VerifyEmail).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(/^Username/)).toBeNull();
});

it.each([5, 1024])('accepts a %i-character completion password unchanged', async length => {
  api.GetVerificationInfo.mockResolvedValue(response({ purpose: 'registration', username: 'MixedCase' }));
  api.VerifyEmail.mockResolvedValue(response({ success: true }));
  open();
  const password = await screen.findByLabelText(/^Password/);
  const value = 'AbCdE'.repeat(Math.ceil(length / 5)).slice(0, length);
  fireEvent.change(password, { target: { value } });
  fireEvent.click(screen.getByLabelText(/18 years/)); fireEvent.click(screen.getByLabelText(/I agree/));
  fireEvent.submit(screen.getByRole('button', { name: 'Complete registration' }).closest('form'));
  await screen.findByText(/Email verified/);
  expect(api.VerifyEmail.mock.calls[0][0]).toMatchObject({ username: 'MixedCase', password: value });
  expect(password.minLength).toBe(5); expect(password.maxLength).toBe(1024);
});
