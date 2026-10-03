// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Nav from './components/Nav.Component.Wrapper';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(() => {
 api.HasSession.mockReturnValue(true);
 api.GetSessionUser.mockReturnValue('Synthetic User');
 api.IsAdmin.mockReturnValue(false);
 api.GetCurrentUser.mockResolvedValue({ ok: true, json: async () => ({ user: { username: 'Synthetic User' } }) });
 api.GetMyArtists.mockResolvedValue({ ok: true, json: async () => ({ artists: [] }) });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('keeps account outside collapsed mobile links and stacks the real wordmark', async () => {
 render(<MemoryRouter><Nav /></MemoryRouter>);
 const account = await screen.findByRole('button', { name: 'account of current user' });
 expect(screen.getByRole('navigation').contains(account)).toBe(false);
 expect(screen.getByText('Midnight Sound')).toBeTruthy();
 expect(screen.getByText('SYNDICATE')).toBeTruthy();
 expect(screen.getByRole('img', { name: 'Midnight Sound Syndicate' }).getAttribute('src')).toBe('/msslogo.jpg');
 const toggle = screen.getByRole('button', { name: 'Toggle navigation' });
 expect(toggle.getAttribute('aria-expanded')).toBe('false');
 fireEvent.click(toggle);
 expect(toggle.getAttribute('aria-expanded')).toBe('true');
 expect(screen.getByRole('button', { name: 'account of current user' })).toBe(account);
});

it.each([['/', 'Home'], ['/about', 'About'], ['/artists/42', 'Artists'], ['/events/7/edit', 'Events'], ['/artists-extra', null], ['/account', null]])('marks only the current route section at %s', async (path, active) => {
 render(<MemoryRouter initialEntries={[path]}><Nav /></MemoryRouter>);
 await act(async () => {});
 for (const name of ['Home', 'About', 'Artists', 'Events']) {
  expect(screen.getByRole('link', { name }).getAttribute('aria-current')).toBe(name === active ? 'page' : null);
 }
 const shop = screen.getByRole('link', { name: 'Shop' });
 expect(shop.getAttribute('target')).toBe('_blank');
 expect(shop.getAttribute('rel')).toBe('noopener noreferrer');
});
it('preserves guest links without an account trigger', () => {
 api.HasSession.mockReturnValue(false);
 render(<MemoryRouter><Nav /></MemoryRouter>);
 fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
 expect(screen.getByRole('link', { name: 'Login' }).getAttribute('href')).toBe('/login');
 expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe('/register');
 expect(screen.queryByRole('button', { name: 'account of current user' })).toBeNull();
});

it.each([true, false])('preserves account and artist actions with admin gating (%s)', async admin => {
 api.IsAdmin.mockReturnValue(admin);
 api.GetMyArtists.mockResolvedValue({ ok: true, json: async () => ({ artists: [{ id: 9, name: 'Synthetic Artist' }] }) });
 render(<MemoryRouter><Nav /></MemoryRouter>);
 await act(async () => {});
 fireEvent.click(screen.getByRole('button', { name: 'account of current user' }));
 expect(screen.getByRole('menuitem', { name: 'Account Settings' })).toBeTruthy();
 expect(screen.getByRole('menuitem', { name: 'Synthetic Artist Profile' })).toBeTruthy();
 expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeTruthy();
 expect(Boolean(screen.queryByRole('menuitem', { name: 'Admin Dashboard' }))).toBe(admin);
 expect(Boolean(screen.queryByRole('menuitem', { name: 'System Settings' }))).toBe(admin);
});
