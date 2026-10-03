// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AdminEmail from './components/Admin/Admin.Email';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
const settings = {
  enabled: false,
  from_email: '',
  from_name: 'MSS',
  reply_to: 'support@midnightsoundsyndicate.com',
  public_url: 'https://midnightsoundsyndicate.com',
  api_key_configured: true
};
it('never prefills the key and omits blank key updates', async () => {
  api.GetEmailSettings.mockResolvedValue({
    ok: true,
    json: async () => settings
  });
  api.UpdateEmailSettings.mockResolvedValue({
    ok: true
  });
  render(<AdminEmail />);
  const key = await screen.findByLabelText(/Resend API key/);
  expect(key.type).toBe('password');
  expect(key.value).toBe('');
  fireEvent.click(screen.getByRole('button', {
    name: 'Save email settings'
  }));
  await screen.findByText('Email settings saved.');
  expect(api.UpdateEmailSettings).toHaveBeenCalledWith(settingsWithoutStatus());
});
function settingsWithoutStatus() {
  const {
    api_key_configured: _apiKeyConfigured,
    ...rest
  } = settings;
  return rest;
}
it('clears keys only when explicitly selected', async () => {
  api.GetEmailSettings.mockResolvedValue({
    ok: true,
    json: async () => settings
  });
  api.UpdateEmailSettings.mockResolvedValue({
    ok: true
  });
  render(<AdminEmail />);
  await screen.findByLabelText(/Resend API key/);
  fireEvent.click(screen.getByLabelText('Clear saved API key'));
  fireEvent.click(screen.getByRole('button', {
    name: 'Save email settings'
  }));
  await screen.findByText('Email settings saved.');
  expect(api.UpdateEmailSettings).toHaveBeenCalledWith({
    ...settingsWithoutStatus(),
    clear_api_key: true
  });
});
it('does not announce saved settings when read-back fails', async () => {
  api.GetEmailSettings.mockResolvedValueOnce({
    ok: true,
    json: async () => settings
  }).mockRejectedValueOnce(Error());
  api.UpdateEmailSettings.mockResolvedValue({
    ok: true
  });
  render(<AdminEmail />);
  fireEvent.click(await screen.findByRole('button', {
    name: 'Save email settings'
  }));
  await screen.findByText('Unable to load email settings.');
  expect(screen.queryByText('Email settings saved.')).toBeNull();
});
it('hides save after a settings load failure until successful retry', async () => {
  api.GetEmailSettings.mockRejectedValueOnce(Error()).mockResolvedValueOnce({
    ok: true,
    json: async () => settings
  });
  render(<AdminEmail />);
  await screen.findByText('Unable to load email settings.');
  expect(screen.queryByRole('button', {
    name: 'Save email settings'
  })).toBeNull();
  fireEvent.click(screen.getByRole('button', {
    name: 'Retry'
  }));
  await screen.findByRole('button', {
    name: 'Save email settings'
  });
});

it('ignores the first StrictMode GET after second GET and draft edit', async () => {
  let first;
  api.GetEmailSettings.mockReturnValueOnce(new Promise(resolve => { first = resolve; }))
    .mockResolvedValueOnce({ ok: true, json: async () => settings });
  render(<StrictMode><AdminEmail /></StrictMode>);
  fireEvent.change(await screen.findByLabelText('From name'), { target: { value: 'Edited draft' } });
  await act(async () => first({ ok: true, json: async () => ({ ...settings, from_name: 'Original' }) }));
  expect(screen.getByLabelText('From name').value).toBe('Edited draft');
});
it.each(['https://example.com/', 'https://example.com/path', 'http://example.com'])('rejects non-exact or insecure public origin %s', async public_url => {
  api.GetEmailSettings.mockResolvedValue({ ok: true, json: async () => settings });
  render(<AdminEmail />);
  fireEvent.change(await screen.findByLabelText(/Public site URL/), { target: { value: public_url } });
  fireEvent.click(screen.getByRole('button', { name: 'Save email settings' }));
  expect(api.UpdateEmailSettings).not.toHaveBeenCalled();
  await screen.findByText(/Enter.*exact HTTPS origin/);
});

it.each(['http://localhost:5174', 'http://127.0.0.1:5174', 'http://[::1]:5174'])('accepts exact local development loopback origin %s', async public_url => {
  api.GetEmailSettings.mockResolvedValue({ ok: true, json: async () => ({ ...settings, public_url }) });
  api.UpdateEmailSettings.mockResolvedValue({ ok: true });
  render(<AdminEmail />);
  fireEvent.click(await screen.findByRole('button', { name: 'Save email settings' }));
  await screen.findByText('Email settings saved.');
  expect(api.UpdateEmailSettings.mock.calls[0][0].public_url).toBe(public_url);
});
