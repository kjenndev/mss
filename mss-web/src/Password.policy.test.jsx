// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreateUser from './components/User/User.Component.Create';
import Profile from './components/User/User.Component.Profile';
import Dashboard from './components/Admin/Admin.Dashboard.Component';
import Login from './components/Auth/Auth.Component.Login';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);
const ok = data => ({ ok: true, json: async () => data });
it('login still submits legacy short credentials unchanged', async () => {
 api.Authenticate.mockResolvedValue(ok({}));
 render(<MemoryRouter><Login /></MemoryRouter>);
 fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'LeGaCy' } });
 fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'OlD4' } });
 expect(screen.getByText('Usernames are not case-sensitive')).toBeTruthy();
 expect(screen.getByLabelText('Password').hasAttribute('minlength')).toBe(false);
 fireEvent.click(screen.getByRole('button', { name: 'Login' }));
 await waitFor(() => expect(api.Authenticate).toHaveBeenCalledWith({ username: 'LeGaCy', password: 'OlD4' }));
});
async function openForm(kind) {
 if (kind === 'create') {
  api.CreateUser.mockResolvedValue(ok({}));
  render(<MemoryRouter><CreateUser /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'tester' } });
  return { input: screen.getByLabelText(/^Password/), button: screen.getByRole('button', { name: 'Create User' }), save: api.CreateUser };
 }
 if (kind === 'profile') {
  api.GetCurrentUser.mockResolvedValue(ok({ user: { username: 'tester' } }));
  api.UpdateMyProfile.mockResolvedValue(ok({}));
  render(<MemoryRouter><Profile /></MemoryRouter>);
  return { input: await screen.findByLabelText('New Password'), confirm: screen.getByLabelText('Confirm New Password'), button: screen.getByRole('button', { name: 'Save Changes' }), save: api.UpdateMyProfile };
 }
 api.IsAdmin.mockReturnValue(true);
 api.GetAllArtists.mockResolvedValue(ok({ artists: [] }));
 api.GetAllUsers.mockResolvedValue(ok({ users: [{ id: 2, username: 'tester', role: 'artist' }] }));
 api.UpdateUser.mockResolvedValue(ok({}));
 render(<MemoryRouter><Dashboard /></MemoryRouter>);
 fireEvent.click(screen.getByRole('tab', { name: 'Users' }));
 const row = (await screen.findByText('tester')).closest('tr');
 fireEvent.click(within(row).getAllByRole('button')[0]);
 return { input: screen.getByLabelText('New Password (leave blank to keep)'), button: screen.getByRole('button', { name: 'Save Changes' }), save: api.UpdateUser };
}
for (const kind of ['create', 'profile', 'admin']) {
 it.each([4, 1025])(`${kind} rejects a new password of %i characters`, async length => {
  const form = await openForm(kind);
  fireEvent.change(form.input, { target: { value: 'AbCdE'.repeat(Math.ceil(length / 5)).slice(0, length) } });
  if (form.confirm) fireEvent.change(form.confirm, { target: { value: 'AbCdE'.repeat(Math.ceil(length / 5)).slice(0, length) } });
  fireEvent.click(form.button);
  expect(form.save).not.toHaveBeenCalled();
  expect(screen.getByText('Password must be between 5 and 1024 characters')).toBeTruthy();
 });
 it.each([5, 1024])(`${kind} accepts a new password of %i characters`, async length => {
  const form = await openForm(kind);
  expect(form.input.getAttribute('aria-describedby')).toBeTruthy();
  fireEvent.change(form.input, { target: { value: 'AbCdE'.repeat(Math.ceil(length / 5)).slice(0, length) } });
  if (form.confirm) fireEvent.change(form.confirm, { target: { value: 'AbCdE'.repeat(Math.ceil(length / 5)).slice(0, length) } });
  fireEvent.click(form.button);
  await waitFor(() => expect(form.save).toHaveBeenCalled());
  expect(form.save.mock.calls[0].at(-1).password).toBe('AbCdE'.repeat(Math.ceil(length / 5)).slice(0, length));
  expect(form.input.minLength).toBe(5);
  expect(form.input.maxLength).toBe(1024);
  expect(document.getElementById(form.input.getAttribute('aria-describedby')).textContent).toMatch(/5.*1024/);
 });
}
it.each(['profile', 'admin'])('%s leaves a blank password unchanged', async kind => {
 const form = await openForm(kind);
 fireEvent.click(form.button);
 await waitFor(() => expect(form.save).toHaveBeenCalled());
 expect(form.save.mock.calls[0].at(-1)).not.toHaveProperty('password');
});
