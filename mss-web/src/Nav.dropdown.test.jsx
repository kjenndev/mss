// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Nav from './components/Nav.Component.Wrapper';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
beforeEach(() => {
 api.HasSession.mockReturnValue(true);
 api.GetSessionUser.mockReturnValue('Synthetic User');
 api.IsAdmin.mockReturnValue(false);
 api.GetCurrentUser.mockResolvedValue({ ok: true, json: async () => ({ user: { username: 'Synthetic User' } }) });
 api.GetMyArtists.mockResolvedValue({ ok: true, json: async () => ({ artists: [{ id: 9, name: 'Synthetic Artist' }] }) });
 api.Logout.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
async function open() {
 const user = userEvent.setup();
 render(<MemoryRouter><Nav /><Location /></MemoryRouter>);
 await act(async () => {});
 const trigger = screen.getByRole('button', { name: 'account of current user' });
 await user.click(trigger);
 return { user, trigger };
}
it('uses a readable noninteractive identity header outside the menu actions', async () => {
 await open();
 expect(screen.getByText('Signed in as')).toBeTruthy();
 const identity = screen.getByText('Synthetic User');
 expect(identity.closest('[role="menuitem"]')).toBeNull();
 expect(identity.hasAttribute('tabindex')).toBe(false);
 expect(screen.getByRole('menu', { name: 'Account' })).toBeTruthy();
});

it.each([
 ['Account Settings', '/account'],
 ['Admin Dashboard', '/admin/dashboard'],
 ['System Settings', '/admin/settings'],
 ['Synthetic Artist Profile', '/artists/9'],
 ['Logout', '/login'],
])('preserves the %s destination', async (label, path) => {
 api.IsAdmin.mockReturnValue(true);
 const { user } = await open();
 await user.click(screen.getByRole('menuitem', { name: label, exact: true }));
 await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(path));
 expect(api.Logout).toHaveBeenCalledTimes(label === 'Logout' ? 1 : 0);
});
it.each([true, false])('keeps identity out of keyboard navigation and restores focus (%s)', async admin => {
 api.IsAdmin.mockReturnValue(admin);
 const { user, trigger } = await open();
 expect(document.activeElement.textContent).toBe('Account Settings');
 await user.keyboard('{ArrowDown}');
 expect(document.activeElement.textContent).toBe(admin ? 'Admin Dashboard' : 'Synthetic Artist Profile');
 await user.keyboard('{End}');
 expect(document.activeElement.textContent).toBe('Logout');
 await user.keyboard('{ArrowDown}');
 expect(document.activeElement.textContent).toBe('Account Settings');
 await user.keyboard('{Escape}');
 expect(document.activeElement).toBe(trigger);
});
it('does not expose admin management to a regular account', async () => {
 await open();
 expect(screen.queryByRole('menuitem', { name: 'Admin Dashboard' })).toBeNull();
 expect(screen.queryByRole('menuitem', { name: 'System Settings' })).toBeNull();
 expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Account Settings', 'Synthetic Artist Profile', 'Logout']);
});
