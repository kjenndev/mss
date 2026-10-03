// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Profile from './components/User/User.Component.Profile';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it('preserves current email while requesting a separately authenticated change', async () => {
  api.GetCurrentUser.mockResolvedValue({
    ok: true,
    json: async () => ({
      user: {
        username: 'member',
        email: 'old@example.com',
        email_verified_at: '2026-10-03',
        email_alerts_opt_in: false
      }
    })
  });
  api.ChangeEmail.mockResolvedValue({
    ok: true,
    status: 202
  });
  render(<MemoryRouter><Profile /></MemoryRouter>);
  await screen.findByText('old@example.com');
  fireEvent.change(screen.getByLabelText(/New email address/), {
    target: {
      value: 'new@example.com'
    }
  });
  fireEvent.change(screen.getByLabelText(/Current password/), {
    target: {
      value: 'current password'
    }
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Send verification link'
  }));
  await screen.findByText(/Check your email/);
  expect(screen.getByText('old@example.com')).toBeTruthy();
  expect(api.ChangeEmail).toHaveBeenCalledWith({
    email: 'new@example.com',
    current_password: 'current password'
  });
  expect(api.UpdateMyProfile).not.toHaveBeenCalled();
});
it('saves a verified email preference through the existing profile action', async () => {
  api.GetCurrentUser.mockResolvedValue({
    ok: true,
    json: async () => ({
      user: {
        username: 'member',
        email: 'old@example.com',
        email_verified_at: '2026-10-03',
        email_alerts_opt_in: false
      }
    })
  });
  api.UpdateMyProfile.mockResolvedValue({
    ok: true
  });
  render(<MemoryRouter><Profile /></MemoryRouter>);
  fireEvent.click(await screen.findByLabelText('Receive email alerts about live streaming and upcoming events'));
  fireEvent.click(screen.getByRole('button', {
    name: 'Save Changes'
  }));
  await screen.findByText('Profile updated successfully');
  expect(api.UpdateMyProfile).toHaveBeenCalledWith({
    username: 'member',
    display_name: '',
    email_alerts_opt_in: true
  });
});
it('prevents unverified opt-in but allows an existing opt-in to be removed', async () => {
  api.GetCurrentUser.mockResolvedValue({
    ok: true,
    json: async () => ({
      user: {
        username: 'member',
        email_alerts_opt_in: true
      }
    })
  });
  render(<MemoryRouter><Profile /></MemoryRouter>);
  const toggle = await screen.findByLabelText('Receive email alerts about live streaming and upcoming events');
  expect(toggle.disabled).toBe(false);
  fireEvent.click(toggle);
  expect(toggle.checked).toBe(false);
  expect(toggle.disabled).toBe(true);
});
it('disables profile saves after a failed GET', async () => {
  api.GetCurrentUser.mockRejectedValue(Error());
  render(<MemoryRouter><Profile /></MemoryRouter>);
  await screen.findByText('Failed to load user data');
  expect(screen.queryByRole('button', {
    name: 'Save Changes'
  })?.disabled ?? true).toBe(true);
});
