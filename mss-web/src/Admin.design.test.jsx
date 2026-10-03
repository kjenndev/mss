// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './components/Admin/Admin.Settings.Component';
import About from './components/Admin/Admin.About.Component';
vi.mock('react-quill-new', () => ({ default: () => <textarea aria-label="Editor" /> }));
import Dashboard from './components/Admin/Admin.Dashboard.Component';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(() => {
 vi.resetAllMocks();
 api.IsAdmin.mockReturnValue(true);
 api.GetAllArtists.mockResolvedValue({ ok: true, json: async () => ({ artists: [] }) });
 api.GetAllUsers.mockResolvedValue({ ok: true, json: async () => ({ users: [{ id: 2, username: 'operator', role: 'artist' }] }) });
});
afterEach(cleanup);
it('gives the operations screen a page heading and keyboard-accessible users region', async () => {
 render(<MemoryRouter><Dashboard /></MemoryRouter>);
 expect(screen.getByRole('heading', { level: 1, name: 'Admin Dashboard' })).toBeTruthy();
 fireEvent.click(screen.getByRole('tab', { name: 'Users' }));
 await screen.findByText('operator');
 expect(screen.getByRole('region', { name: 'User accounts' }).tabIndex).toBe(0);
 expect(screen.getByRole('table', { name: 'User accounts' })).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Edit user' }));
 expect(screen.getByRole('dialog', { name: 'Edit User: operator' })).toBeTruthy();
 expect(screen.getByRole('combobox', { name: 'Role' })).toBeTruthy();
});

it('labels configuration fields and exposes a page-level heading', async () => {
 api.GetSettings.mockResolvedValue({ ok: true, json: async () => ({ raw: [{ key: 'site_title', value: 'MSS', description: 'Site identity' }] }) });
 render(<Settings />);
 expect(await screen.findByRole('heading', { level: 1, name: 'System Settings' })).toBeTruthy();
 expect(screen.getByRole('textbox', { name: 'Site Title' }).value).toBe('MSS');
 expect(screen.getByRole('region', { name: 'Site Title' })).toBeTruthy();
});
it('groups the About editor into named content and cover sections', async () => {
 api.GetSettings.mockResolvedValue({ ok: true, json: async () => ({ settings: { about_content: '<p>Saved</p>' } }) });
 render(<About />);
 expect(await screen.findByRole('heading', { level: 1, name: 'Edit About Page' })).toBeTruthy();
 expect(screen.getByRole('region', { name: 'Cover Photo' })).toBeTruthy();
 expect(screen.getByRole('region', { name: 'Page Content' })).toBeTruthy();
 expect(screen.getByLabelText('Choose New Photo').type).toBe('file');
});
