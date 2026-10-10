// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import Detail from './components/Artist/Artist.Component.Detail';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Comments/CommentSection', () => ({ default: () => <textarea aria-label="Comment draft" /> }));
vi.mock('./components/Media/MediaLibrary', () => ({ default: () => null }));
const artist = { id: 1, user_id: 7, name: 'Synthetic artist', cover_photo: '/uploads/cover.png', profile_picture: '/uploads/portrait.png' };
const ok = data => ({ ok: true, json: async () => data });
function view() { return render(<MemoryRouter initialEntries={['/artists/1']}><Link to="/artists/2">Next artist</Link><Routes><Route path="/artists/:id" element={<Detail />} /></Routes></MemoryRouter>); }
beforeEach(() => {
  cleanup(); vi.resetAllMocks(); localStorage.clear(); localStorage.setItem('mss-token', 'fixture');
  api.GetCurrentUser.mockResolvedValue(ok({ user: { id: 7, role: 'artist' } }));
  api.GetArtistById.mockResolvedValue(ok({ artist }));
  api.GetArtistImages.mockResolvedValue(ok({ images: [{ url: artist.cover_photo }, { url: artist.profile_picture }] }));
  api.GetSettings.mockResolvedValue(ok({ settings: {} }));
  api.GetActiveSyndicateStreams.mockResolvedValue(ok({ streams: [] }));
  api.UpdateArtist.mockResolvedValue(ok({ artist: { ...artist, cover_photo: null } }));
});
it('clears only the cover, returns its image to the gallery and preserves portrait and comment draft', async () => {
  view(); const button = await screen.findByRole('button', { name: 'Remove cover' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment draft' }), { target: { value: 'Keep my draft' } });
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole('img', { name: 'Synthetic artist cover' })).toBeNull());
  expect(api.UpdateArtist).toHaveBeenCalledExactlyOnceWith({ id: '1', cover_photo: null });
  expect(screen.getByRole('img', { name: 'Synthetic artist' })).toHaveAttribute('src', artist.profile_picture);
  expect(screen.getByRole('button', { name: 'Open gallery photo 1' }).querySelector('img')).toHaveAttribute('src', artist.cover_photo);
  expect(screen.getByRole('textbox', { name: 'Comment draft' })).toHaveValue('Keep my draft');
  expect(screen.getByRole('status')).toHaveTextContent('Cover removed. Gallery photos are unchanged.');
});

it.each([
  ['admin', { id: 99, role: 'admin' }, false, true],
  ['ordinary owner', { id: 7, role: 'user' }, false, true],
  ['other artist', { id: 99, role: 'artist', artist_id: 1 }, false, false],
  ['other user', { id: 99, role: 'user' }, false, false],
  ['hidden ordinary owner', { id: 7, role: 'user' }, true, false],
  ['hidden artist owner', { id: 7, role: 'artist' }, true, true],
  ['hidden admin', { id: 99, role: 'admin' }, true, true],
])('gates %s using verified ownership and existing hidden-profile policy', async (_label, user, disabled, allowed) => {
  api.GetCurrentUser.mockResolvedValue(ok({ user }));
  api.GetArtistById.mockResolvedValue(ok({ artist: { ...artist, is_disabled: disabled } }));
  view(); await screen.findByRole('heading', { name: artist.name });
  await act(async () => {});
  expect(Boolean(screen.queryByRole('button', { name: 'Remove cover' }))).toBe(allowed);
  if (allowed) { fireEvent.click(screen.getByRole('button', { name: 'Remove cover' })); await screen.findByRole('status'); }
  else expect(api.UpdateArtist).not.toHaveBeenCalled();
});
it('does not trust a cached admin hint or offer removal to guests', async () => {
  localStorage.removeItem('mss-token'); localStorage.setItem('mss-role', 'admin');
  view(); await screen.findByRole('heading', { name: artist.name });
  expect(screen.queryByRole('button', { name: 'Remove cover' })).toBeNull();
  expect(api.GetCurrentUser).not.toHaveBeenCalled();
});
it('hides the action without a cover or when verification fails', async () => {
  api.GetCurrentUser.mockResolvedValue({ ok: false });
  view(); await screen.findByRole('heading', { name: artist.name }); await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Remove cover' })).toBeNull(); cleanup();
  api.GetCurrentUser.mockResolvedValue(ok({ user: { id: 7, role: 'artist' } }));
  api.GetArtistById.mockResolvedValue(ok({ artist: { ...artist, cover_photo: null } }));
  view(); await screen.findByRole('heading', { name: artist.name }); await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Remove cover' })).toBeNull();
});
it.each(['http', 'network', 'malformed'])('preserves the banner on %s failure and allows retry', async kind => {
  if (kind === 'network') api.UpdateArtist.mockRejectedValueOnce(new Error('offline'));
  else api.UpdateArtist.mockResolvedValueOnce(kind === 'http' ? { ok: false } : ok({ artist }));
  view(); fireEvent.click(await screen.findByRole('button', { name: 'Remove cover' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/try again/);
  expect(screen.getByRole('img', { name: 'Synthetic artist cover' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove cover' })); await screen.findByRole('status');
  expect(api.UpdateArtist).toHaveBeenCalledTimes(2);
});
it('blocks repeated clicks while pending', async () => {
  let finish; api.UpdateArtist.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  view(); const button = await screen.findByRole('button', { name: 'Remove cover' });
  fireEvent.click(button); fireEvent.click(button);
  expect(button).toBeDisabled(); expect(api.UpdateArtist).toHaveBeenCalledTimes(1);
  await act(async () => finish(ok({ artist: { ...artist, cover_photo: null } })));
  await screen.findByRole('status');
});
it('ignores a pending removal after route navigation', async () => {
  let finish; api.UpdateArtist.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  view(); fireEvent.click(await screen.findByRole('button', { name: 'Remove cover' }));
  api.GetArtistById.mockResolvedValue(ok({ artist: { ...artist, id: 2, name: 'Second artist' } }));
  fireEvent.click(screen.getByRole('link', { name: 'Next artist' }));
  await screen.findByRole('heading', { name: 'Second artist' });
  await act(async () => finish(ok({ artist: { ...artist, cover_photo: null } })));
  expect(screen.getByRole('img', { name: 'Second artist cover' })).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
});
it('ignores old-account completion and restores controls once the old request settles', async () => {
  let finish; api.UpdateArtist.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  view(); fireEvent.click(await screen.findByRole('button', { name: 'Remove cover' }));
  api.GetCurrentUser.mockResolvedValue(ok({ user: { id: 99, role: 'admin' } }));
  act(() => { localStorage.setItem('mss-token', 'new-account'); window.dispatchEvent(new Event('mss-auth-change')); });
  await act(async () => finish(ok({ artist: { ...artist, cover_photo: null } })));
  expect(screen.getByRole('img', { name: 'Synthetic artist cover' })).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  expect(await screen.findByRole('button', { name: 'Remove cover' })).not.toBeDisabled();
});
it('rejects delayed identity from a previous account', async () => {
  let finish; api.GetCurrentUser.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  view(); await screen.findByRole('heading', { name: artist.name });
  api.GetCurrentUser.mockResolvedValue(ok({ user: { id: 99, role: 'user' } }));
  act(() => { localStorage.setItem('mss-token', 'new-account'); window.dispatchEvent(new Event('storage')); });
  await act(async () => finish(ok({ user: { id: 7, role: 'admin' } })));
  expect(screen.queryByRole('button', { name: 'Remove cover' })).toBeNull();
});

it('keeps only the removal button inside the top-right cover image wrapper', async () => {
  view(); const button = await screen.findByRole('button', { name: 'Remove cover' });
  const image = screen.getByRole('img', { name: 'Synthetic artist cover' });
  expect(image.parentElement.contains(button)).toBe(true);
  expect(screen.queryByText('Removes the banner only. Keeps your gallery photos.')).toBeNull();
  const style = getComputedStyle(button);
  expect(style.position).toBe('absolute');
  expect(style.top).toBe('12px'); expect(style.right).toBe('12px');
  expect(getComputedStyle(image.parentElement).position).toBe('relative');
});
