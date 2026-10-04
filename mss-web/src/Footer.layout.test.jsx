// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import * as ReactDOMClient from 'react-dom/client';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('react-dom/client', async importOriginal => {
  const original = await importOriginal();
  return { ...original, createRoot: vi.fn(original.createRoot) };
});
vi.mock('./components/Home.Component', async () => {
  const { default: MediaLibrary } = await import('./components/Media/MediaLibrary');
  return { default: () => <><h1>Home fixture</h1><MediaLibrary /></> };
});
vi.mock('./components/User/User.Component.Profile', () => ({ default: () => <h1>Account fixture</h1> }));
vi.mock('./components/Admin/Admin.Settings.Component', () => ({ default: () => <h1>Admin fixture</h1> }));
let application;
beforeAll(async () => {
  const root = document.createElement('div'); root.id = 'root'; document.body.append(root);
  ReactDOMClient.createRoot.mockImplementationOnce(() => ({ render: tree => { application = tree; } }));
  await import('./main');
  root.remove();
});
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  api.HasSession.mockReturnValue(false);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('returns scroll and keyboard focus to the header without a navigation', () => {
  window.history.replaceState({}, '', '/terms');
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  render(application);
  const footer = screen.getByRole('contentinfo');
  fireEvent.click(within(footer).getByRole('button', { name: /Back to top/ }));
  expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'instant' });
  expect(document.activeElement).toBe(screen.getByRole('banner').querySelector('a[href="/"]'));
  expect(window.location.pathname).toBe('/terms');
});
it.each([
  ['/account', false, 'user', 'Login'],
  ['/account', true, 'user', 'Account fixture'],
  ['/admin/settings', true, 'admin', 'Admin fixture'],
  ['/admin/settings', true, 'user', null],
])('keeps one footer outside the real route guard: %s session=%s role=%s', async (path, signedIn, role, heading) => {
  api.HasSession.mockReturnValue(signedIn);
  api.GetCurrentUser.mockResolvedValue({ ok: true, json: async () => ({ user: { id: 1, username: 'Fixture', role } }) });
  api.GetMyArtists.mockResolvedValue({ ok: true, json: async () => ({ artists: [] }) });
  window.history.replaceState({}, '', path);
  render(application);
  const content = heading ? await screen.findByRole('heading', { name: heading }) : await screen.findByText(/not authorized/);
  const footer = screen.getByRole('contentinfo');
  expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  expect(content.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it('preserves the real audio iframe through footer navigation including legal routes', async () => {
  api.GetMediaLibrary.mockResolvedValue({ ok: true, json: async () => ({ items: [{ id: 'fixture', title: 'Fixture mix', provider: 'soundcloud', url: 'https://soundcloud.com/fixture/mix' }], sources: [], total: 1, nextOffset: null, cache: {}, complete: true }) });
  window.history.replaceState({}, '', '/');
  render(application);
  fireEvent.click(await screen.findByRole('button', { name: 'Play Fixture mix' }));
  const frame = screen.getByTitle('SoundCloud player');
  const footer = screen.getByRole('contentinfo');
  for (const [name, heading] of [['Terms', 'Terms of Service'], ['Privacy', 'Privacy Policy']]) {
    fireEvent.click(within(footer).getByRole('link', { name }));
    await screen.findByRole('heading', { name: heading });
    expect(screen.getByTitle('SoundCloud player')).toBe(frame);
    expect(screen.getByRole('contentinfo')).toBe(footer);
  }
  expect(footer.compareDocumentPosition(screen.getByRole('complementary', { name: 'MSS audio player' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it('mounts exactly one directory after routed public content in the real application', async () => {
  window.history.replaceState({}, '', '/terms');
  render(application);
  const heading = await screen.findByRole('heading', { name: 'Terms of Service' });
  const footer = screen.getByRole('contentinfo');
  expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  expect(heading.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const directory = within(footer);
  for (const [name, path] of [['About', '/about'], ['Artists', '/artists'], ['Events', '/events'], ['Terms', '/terms'], ['Privacy', '/privacy']]) {
    expect(directory.getByRole('link', { name }).getAttribute('href')).toBe(path);
  }
  expect(directory.getByRole('link', { name: 'support@midnightsoundsyndicate.com' }).getAttribute('href')).toBe('mailto:support@midnightsoundsyndicate.com');
  const shop = directory.getByRole('link', { name: /Shop/ });
  expect(shop.getAttribute('href')).toBe('https://zowiemedia.net/zowieshop/');
  expect(shop.getAttribute('target')).toBe('_blank');
  expect(shop.getAttribute('rel')).toBe('noopener noreferrer');
  expect(directory.getByText('© Midnight Sound Syndicate')).toBeTruthy();
  fireEvent.click(directory.getByRole('link', { name: 'Privacy' }));
  await screen.findByRole('heading', { name: 'Privacy Policy' });
  expect(screen.getByRole('contentinfo')).toBe(footer);
});
