// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import About from './components/About.Component';
import * as api from './Data.Helper.Api';

vi.mock('./Data.Helper.Api');

const platforms = [
  ['Twitch', 'social_twitch'],
  ['Instagram', 'social_instagram'],
  ['Facebook', 'social_facebook'],
  ['X / Twitter', 'social_twitter'],
  ['YouTube', 'social_youtube'],
  ['TikTok', 'social_tiktok'],
  ['SoundCloud', 'social_soundcloud'],
  ['Mixcloud', 'social_mixcloud'],
  ['Discord', 'social_discord'],
  ['Bandcamp', 'social_bandcamp'],
  ['Spotify', 'social_spotify'],
];

beforeEach(() => {
  cleanup();
  vi.resetAllMocks();
  api.IsAdmin.mockReturnValue(false);
});

function response(settings) {
  return { ok: true, json: async () => ({ settings }) };
}

it('renders every configured supported social link as an accessible safe external icon', async () => {
  const settings = { about_content: '<p>Story</p>' };
  for (const [label, key] of platforms) settings[key] = `https://social.test/${encodeURIComponent(label)}`;
  api.GetSettings.mockResolvedValue(response(settings));
  render(<MemoryRouter><About /></MemoryRouter>);

  await screen.findByText('Story');
  for (const [label, key] of platforms) {
    const link = screen.getByRole('link', { name: label });
    expect(link.getAttribute('href')).toBe(settings[key]);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  }
  const twitch = screen.getByRole('link', { name: 'Twitch' });
  fireEvent.mouseOver(twitch);
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Twitch');
});

it('shows the platform tooltip when an icon link receives keyboard focus', async () => {
  api.GetSettings.mockResolvedValue(response({ social_instagram: 'https://instagram.test/mss' }));
  render(<MemoryRouter><About /></MemoryRouter>);
  const instagram = await screen.findByRole('link', { name: 'Instagram' });
  await userEvent.tab();
  expect(instagram).toHaveFocus();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Instagram');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  expect(instagram).toHaveFocus();
});

it.each([
  ['', ''],
  ['whitespace', '   '],
  ['relative', '/profile'],
  ['javascript', 'javascript:alert(1)'],
  ['data', 'data:text/html,bad'],
  ['mailto', 'mailto:hello@example.com'],
  ['malformed', 'not a url'],
])('omits all mapped social fields when values use a %s URL', async (_name, value) => {
  api.GetSettings.mockResolvedValue(response(Object.fromEntries(platforms.map(([, key]) => [key, value]))));
  render(<MemoryRouter><About /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'About MSS' });
  for (const [label] of platforms) expect(screen.queryByRole('link', { name: label })).toBeNull();
});
