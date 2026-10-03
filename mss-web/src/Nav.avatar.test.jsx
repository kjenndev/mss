// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Nav from './components/Nav.Component.Menu';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
const response = user => ({ ok: true, json: async () => ({ user }) });
const alice = { id: 1, username: 'Alice', profile_picture: '/uploads/alice.png' };
const mount = () => render(<MemoryRouter><Nav /></MemoryRouter>);
beforeEach(() => {
  localStorage.setItem('mss-token', 'alice-session');
  api.HasSession.mockImplementation(() => !!localStorage.getItem('mss-token'));
  api.GetSessionUser.mockReturnValue('Alice');
  api.IsAdmin.mockReturnValue(false);
  api.GetCurrentUser.mockResolvedValue(response(alice));
  api.GetMyArtists.mockResolvedValue({ ok: true, json: async () => ({ artists: [{ id: 9, name: 'Artist', profile_picture: '/uploads/artist.png' }] }) });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); });
it('refreshes avatar without remount and falls back on missing or broken pictures', async () => {
  mount();
  fireEvent.error(await screen.findByRole('img', { name: "Alice's profile picture" }));
  expect(screen.getByRole('button', { name: 'account of current user' }).textContent).toBe('A');
  api.GetCurrentUser.mockResolvedValue(response({ ...alice, profile_picture: '/uploads/new.png' }));
  act(() => window.dispatchEvent(new Event('mss-avatar-change')));
  expect((await screen.findByRole('img')).getAttribute('src')).toBe('/uploads/new.png');
  api.GetCurrentUser.mockResolvedValue(response({ ...alice, profile_picture: null }));
  await act(async () => window.dispatchEvent(new Event('mss-avatar-change')));
  expect(screen.queryByRole('img')).toBeNull();
});
it.each(['mss-auth-change', 'storage'])('discards delayed user and artist responses after logout/switch via %s', async event => {
  let resolveUser, resolveArtists;
  api.GetCurrentUser.mockReturnValueOnce(new Promise(resolve => { resolveUser = resolve; }));
  api.GetMyArtists.mockReturnValueOnce(new Promise(resolve => { resolveArtists = resolve; }));
  mount();
  localStorage.removeItem('mss-token');
  act(() => window.dispatchEvent(new Event(event)));
  expect(screen.getByRole('link', { name: 'Login' })).toBeTruthy();
  localStorage.setItem('mss-token', 'bob-session');
  api.GetSessionUser.mockReturnValue('Bob');
  api.GetCurrentUser.mockResolvedValue(response({ id: 2, username: 'Bob', profile_picture: '/uploads/bob.png' }));
  api.GetMyArtists.mockResolvedValue({ ok: true, json: async () => ({ artists: [] }) });
  act(() => window.dispatchEvent(new Event(event)));
  await screen.findByRole('img', { name: "Bob's profile picture" });
  await act(async () => { resolveUser(response(alice)); resolveArtists({ ok: true, json: async () => ({ artists: [{ id: 9, name: 'Old Artist' }] }) }); });
  expect(screen.queryByRole('img', { name: "Alice's profile picture" })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'account of current user' }));
  expect(screen.queryByText('Old Artist Profile')).toBeNull();
});
it('uses the verified account photo instead of artist artwork and retains the menu', async () => {
  mount();
  const img = await screen.findByRole('img', { name: "Alice's profile picture" });
  expect(img.getAttribute('src')).toBe('/uploads/alice.png');
  fireEvent.click(screen.getByRole('button', { name: 'account of current user' }));
  expect(screen.getByText('Account Settings')).toBeTruthy();
  expect(await screen.findByText('Artist Profile')).toBeTruthy();
  expect(screen.getByText('Logout')).toBeTruthy();
});
