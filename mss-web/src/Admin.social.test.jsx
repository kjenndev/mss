// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminSettings from './components/Admin/Admin.Settings.Component';
import * as api from './Data.Helper.Api';

vi.mock('./Data.Helper.Api');

const platforms = [['Twitch','social_twitch'],['Instagram','social_instagram'],['Facebook','social_facebook'],['X / Twitter','social_twitter'],['YouTube','social_youtube'],['TikTok','social_tiktok'],['SoundCloud','social_soundcloud'],['Mixcloud','social_mixcloud'],['Discord','social_discord'],['Bandcamp','social_bandcamp'],['Spotify','social_spotify']];
const keys = platforms.map(([, key]) => key);
const initial = {
  raw: [
    { key: 'site_title', value: 'MSS', description: 'Site title' },
    { key: 'social_twitch', value: 'https://twitch.test/original', description: 'Twitch profile URL' },
    { key: 'social_instagram', value: null, description: 'Instagram profile URL' },
    { key: 'social_facebook', value: '', description: 'Facebook page URL' },
  ],
};
const ok = body => ({ ok: true, json: async () => body });

beforeEach(() => { cleanup(); vi.resetAllMocks(); });

it('shows the complete social catalog as one usable group while retaining generic non-social settings', async () => {
  api.GetSettings.mockResolvedValue(ok(initial));
  render(<AdminSettings />);
  expect(await screen.findByRole('heading', { name: 'Social links' })).toBeTruthy();
  for (const [label] of platforms) expect(screen.getByRole('textbox', { name: label })).toBeTruthy();
  expect(screen.getByDisplayValue('MSS')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Save social links' })).toHaveLength(1);
});

it('saves the whole social group in one batch and announces success only after matching GET readback', async () => {
  const saved = Object.fromEntries(keys.map(key => [key, key === 'social_twitter' ? 'https://x.test/mss' : initial.raw.find(row => row.key === key)?.value ?? '']));
  api.GetSettings.mockResolvedValueOnce(ok(initial)).mockResolvedValueOnce(ok({ raw: initial.raw, settings: saved }));
  api.UpdateSettingsBatch.mockResolvedValue(ok({ settings: saved }));
  render(<AdminSettings />);
  fireEvent.change(await screen.findByRole('textbox', { name: 'X / Twitter' }), { target: { value: saved.social_twitter } });
  fireEvent.click(screen.getByRole('button', { name: 'Save social links' }));

  await screen.findByText('Social links updated successfully');
  expect(api.UpdateSettingsBatch).toHaveBeenCalledWith(keys.map(key => ({ key, value: saved[key] })));
  expect(api.GetSettings).toHaveBeenCalledTimes(2);
});

it('retains the social draft and withholds success when batch save fails', async () => {
  api.GetSettings.mockResolvedValue(ok(initial));
  api.UpdateSettingsBatch.mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) });
  render(<AdminSettings />);
  const twitter = await screen.findByRole('textbox', { name: 'X / Twitter' });
  fireEvent.change(twitter, { target: { value: 'https://x.test/keep-me' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save social links' }));

  await screen.findByText('Failed to update social links');
  expect(screen.getByRole('textbox', { name: 'X / Twitter' })).toHaveValue('https://x.test/keep-me');
  expect(screen.queryByText('Social links updated successfully')).toBeNull();
});

it('retains the social draft and withholds success when readback does not match', async () => {
  api.GetSettings.mockResolvedValueOnce(ok(initial)).mockResolvedValueOnce(ok({ settings: { social_twitter: '' }, raw: [] }));
  api.UpdateSettingsBatch.mockResolvedValue(ok({}));
  render(<AdminSettings />);
  fireEvent.change(await screen.findByRole('textbox', { name: 'X / Twitter' }), { target: { value: 'https://x.test/keep-me' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save social links' }));

  await screen.findByText('Unable to verify saved social links');
  expect(screen.getByRole('textbox', { name: 'X / Twitter' })).toHaveValue('https://x.test/keep-me');
  await waitFor(() => expect(api.GetSettings).toHaveBeenCalledTimes(2));
});

it('rejects a malformed social URL with a field-specific error and no request', async () => {
  api.GetSettings.mockResolvedValue(ok(initial));
  render(<AdminSettings />);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Discord' }), { target: { value: 'https://user:secret@discord.test/invite' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save social links' }));
  expect(await screen.findByText('Discord must be a complete HTTP(S) URL without credentials or whitespace.')).toBeTruthy();
  expect(api.UpdateSettingsBatch).not.toHaveBeenCalled();
  expect(screen.queryByText('Social links updated successfully')).toBeNull();
});

it('disables every social field while saving and synchronously ignores duplicate saves', async () => {
  let finish;
  api.GetSettings.mockResolvedValue(ok(initial));
  api.UpdateSettingsBatch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<AdminSettings />);
  const save = await screen.findByRole('button', { name: 'Save social links' });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Twitch' })).toBeDisabled());
  for (const [label] of platforms) expect(screen.getByRole('textbox', { name: label })).toBeDisabled();
  expect(api.UpdateSettingsBatch).toHaveBeenCalledTimes(1);
  finish({ ok: false, json: async () => ({}) });
  await screen.findByText('Failed to update social links');
  expect(screen.getByRole('textbox', { name: 'Twitch' })).toBeEnabled();
});
