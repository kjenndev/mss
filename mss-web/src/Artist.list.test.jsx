// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ArtistList from './components/Artist/Artist.Component.List';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
const response = artists => ({ ok: true, json: async () => ({ artists }) });
const artists = [
  { id: 2, user_id: 20, name: 'Zulu Test', location: 'Detroit', profile_picture: '/uploads/fixture.jpg' },
  { id: 1, user_id: 10, name: 'Alpha Test', location: 'Chicago' },
];
beforeEach(() => { vi.resetAllMocks(); api.GetAllArtists.mockResolvedValue(response(artists)); });
afterEach(cleanup);
it('renders the portrait directory with semantic identity and existing owner actions', async () => {
  api.CanEditArtist.mockImplementation((id, owner) => id === 1 && owner === 10);
  const { container } = render(<ArtistList />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Syndicate artists' })).toBeTruthy();
  const cards = await screen.findAllByRole('article');
  expect(cards).toHaveLength(2);
  expect(within(cards[0]).getByRole('heading', { name: 'Alpha Test' })).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Zulu Test' }).getAttribute('src')).toBe('/uploads/fixture.jpg');
  expect(screen.getByText('AT')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/artists/1/update');
  expect(screen.getAllByRole('link', { name: /View profile/i }).map(a => a.getAttribute('href'))).toEqual(['/artists/1', '/artists/2']);
  expect(container.querySelector('.MuiPaper-root')).toBeNull();
});

it('searches names and locations case-insensitively, sorts without mutating records, and counts results', async () => {
  render(<ArtistList />);
  await screen.findByText('Alpha Test');
  const names = () => screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
  expect(names()).toEqual(['Alpha Test', 'Zulu Test']);
  expect(screen.getByRole('status').textContent).toBe('2 artists');
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort artists' }), { target: { value: 'za' } });
  expect(names()).toEqual(['Zulu Test', 'Alpha Test']);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search artists' }), { target: { value: '  cHiCaGo  ' } });
  expect(names()).toEqual(['Alpha Test']);
  expect(screen.getByRole('status').textContent).toBe('1 of 2 artists');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing' } });
  expect(screen.getByText('No matching artists. Try another name or location.')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('0 of 2 artists');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'test' } });
  expect(names()).toEqual(['Zulu Test', 'Alpha Test']);
  expect(artists.map(a => a.id)).toEqual([2, 1]);
});

it('replaces a broken portrait with initials and omits absent location copy', async () => {
  api.GetAllArtists.mockResolvedValue(response([{ ...artists[0], location: null }, { id: 3, name: '  single  ' }]));
  render(<ArtistList />);
  fireEvent.error(await screen.findByRole('img', { name: 'Zulu Test' }));
  expect(screen.queryByRole('img', { name: 'Zulu Test' })).toBeNull();
  expect(screen.getByText('ZT')).toBeTruthy();
  expect(screen.getByText('S')).toBeTruthy();
  expect(screen.queryByText(/Unknown Location|Demo artist|Photo placeholder/i)).toBeNull();
  expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
});

it('links only supplied safe provider URLs without inventing provider metadata', async () => {
  api.GetAllArtists.mockResolvedValue(response([
    { id: 1, name: 'Linked Test', soundcloud: 'https://soundcloud.com/fixture', mixcloud: 'https://www.mixcloud.com/fixture/', youtube: 'https://youtube.com/@fixture', twitch: 'fixture_channel' },
    { id: 2, name: 'Unsafe Test', soundcloud: 'javascript:alert(1)', mixcloud: '//evil.test', youtube: 'data:text/html,bad' },
    { id: 3, name: 'Absent Test' },
  ]));
  render(<ArtistList />);
  const cards = await screen.findAllByRole('article');
  const linked = cards.find(card => within(card).queryByText('Linked Test'));
  for (const [name, href] of [['SoundCloud', 'https://soundcloud.com/fixture'], ['Mixcloud', 'https://www.mixcloud.com/fixture/'], ['YouTube', 'https://youtube.com/@fixture'], ['Twitch', 'https://twitch.tv/fixture_channel']]) {
    const link = within(linked).getByRole('link', { name });
    expect(link.getAttribute('href')).toBe(href);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  }
  for (const card of cards.filter(card => card !== linked)) expect(within(card).getAllByRole('link')).toHaveLength(1);
});

it('distinguishes loading from a successful empty directory', async () => {
  let finish;
  api.GetAllArtists.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<ArtistList />);
  expect(screen.getByRole('status').textContent).toBe('Loading artists…');
  expect(screen.queryByText(/No artists/)).toBeNull();
  finish(response([]));
  expect(await screen.findByText('No artists yet.')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('0 artists');
  expect(screen.queryByText(/No matching/)).toBeNull();
});
it.each(['network', 'http', 'malformed'])('retries %s failures without showing misleading empty state', async failure => {
  if (failure === 'network') api.GetAllArtists.mockRejectedValueOnce(new Error('offline'));
  else api.GetAllArtists.mockResolvedValueOnce(failure === 'http' ? { ok: false } : { ok: true, json: async () => ({ artists: {} }) });
  api.GetAllArtists.mockResolvedValueOnce(response([]));
  render(<ArtistList />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(screen.queryByText(/No artists/)).toBeNull();
  expect(await screen.findByText('No artists yet.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(api.GetAllArtists).toHaveBeenCalledTimes(2);
});
