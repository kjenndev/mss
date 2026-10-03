// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as api from './Data.Helper.Api';
import Register from './components/Auth/Register';
vi.mock('./Data.Helper.Api');
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('treats malformed registration configuration as unavailable', async () => {
  api.GetRegistrationConfig.mockResolvedValue({
    ok: true,
    json: async () => null
  });
  render(<MemoryRouter><Register /></MemoryRouter>);
  await screen.findByText(/Registration is currently unavailable/);
  expect(screen.queryByRole('button', {
    name: 'Create account'
  })).toBeNull();
});
it('does not offer submission while registration is unavailable', async () => {
  api.GetRegistrationConfig.mockResolvedValue({
    ok: true,
    json: async () => ({
      enabled: false,
      terms_version: '2026-10-03',
      privacy_version: '2026-10-03'
    })
  });
  render(<MemoryRouter><Register /></MemoryRouter>);
  await screen.findByText(/Registration is currently unavailable/);
  expect(screen.queryByRole('button', {
    name: 'Create account'
  })).toBeNull();
});
it('collects only username and email before securely completing via the email link', async () => {
  api.GetRegistrationConfig.mockResolvedValue({
    ok: true,
    json: async () => ({
      enabled: true,
      terms_version: '2026-10-03',
      privacy_version: '2026-10-03'
    })
  });
  api.Register.mockResolvedValue({
    ok: true,
    status: 202
  });
  render(<MemoryRouter><Register /></MemoryRouter>);
  const submit = await screen.findByRole('button', {
    name: 'Create account'
  });
  fireEvent.change(screen.getByLabelText(/^Username/), {
    target: {
      value: 'LisTener'
    }
  });
  fireEvent.change(screen.getByLabelText(/^Email address/), {
    target: {
      value: 'listener@example.com'
    }
  });
  expect(screen.getByText('Usernames are not case-sensitive')).toBeTruthy();
  expect(screen.getByLabelText(/^Username/).value).toBe('LisTener');
  expect(screen.queryByLabelText(/^Password/)).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(submit);
  await screen.findByText(/Check your email/);
  expect(api.Register).toHaveBeenCalledWith({
    username: 'LisTener',
    email: 'listener@example.com'
  });
  expect(api.Authenticate).not.toHaveBeenCalled();
});
