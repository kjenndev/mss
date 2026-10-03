// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import UserProfile from './components/User/User.Component.Profile';
import CreateUser from './components/User/User.Component.Create';
import Login from './components/Auth/Auth.Component.Login';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);
function mount(component, state) {
  return render(<MemoryRouter initialEntries={[{ pathname: '/form', state }]}><Routes>
    <Route path="/form" element={component}/>
    <Route path="/" element={<h1>Home destination</h1>}/>
    <Route path="/login" element={<Login/>}/>
    <Route path="/admin/dashboard" element={<h1>Dashboard destination</h1>}/>
  </Routes></MemoryRouter>);
}
function openHeading(container, name) {
  const heading = screen.getByRole('heading', { level: 1, name });
  expect(heading.querySelector('[aria-hidden="true"]').textContent).toBe('.');
  expect(container.querySelector('.MuiPaper-root')).toBeNull();
}
it('presents an open Login heading and preserves sign-in messages and credentials', async () => {
  api.Authenticate.mockResolvedValue({ ok: true });
  const { container } = mount(<Login/>, { message: 'Please sign in again.' });
  openHeading(container, 'Login');
  expect(screen.getByRole('status').textContent).toBe('Please sign in again.');
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'member' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'exact password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  await screen.findByRole('heading', { name: 'Home destination' });
  expect(api.Authenticate).toHaveBeenCalledWith({ username: 'member', password: 'exact password' });
});
it('retains login failure and re-enables the action', async () => {
  api.Authenticate.mockResolvedValue({ ok: false, json: async () => ({ error: 'Invalid credentials' }) });
  mount(<Login/>);
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  await screen.findByText('Invalid credentials');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Login' }).disabled).toBe(false));
});

it('groups account identity and password separately without a surrounding panel', async () => {
  api.GetCurrentUser.mockResolvedValue({ ok: true, json: async () => ({ user: { username: 'member', display_name: 'Member' } }) });
  api.UpdateMyProfile.mockResolvedValue({ ok: true });
  const { container } = mount(<UserProfile/>);
  await screen.findByLabelText('Username');
  openHeading(container, 'Account Settings');
  expect(screen.getByRole('group', { name: 'Profile details' }).contains(screen.getByLabelText('Display Name'))).toBe(true);
  expect(screen.getByRole('group', { name: 'Password' }).contains(screen.getByLabelText('New Password'))).toBe(true);
  fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Updated' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Profile updated successfully');
  expect(api.UpdateMyProfile).toHaveBeenCalledWith({ username: 'member', display_name: 'Updated' });
  expect(api.clearSession).not.toHaveBeenCalled();
});
it('preserves password validation and the credential-change sign-in flow', async () => {
  api.GetCurrentUser.mockResolvedValue({ ok: true, json: async () => ({ user: { username: 'member' } }) });
  api.UpdateMyProfile.mockResolvedValue({ ok: true });
  mount(<UserProfile/>);
  await screen.findByLabelText('Username');
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'new password 123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Passwords do not match');
  expect(api.UpdateMyProfile).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'new password 123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByRole('status');
  expect(screen.getByRole('status').textContent).toBe('Account credentials updated. Please sign in again.');
  expect(api.clearSession).toHaveBeenCalledOnce();
  expect(api.UpdateMyProfile).toHaveBeenCalledWith({ username: 'member', display_name: '', password: 'new password 123' });
});

it('presents an open create-user form and preserves required validation, roles and save payload', async () => {
  api.CreateUser.mockResolvedValue({ ok: true });
  const { container } = mount(<CreateUser/>);
  openHeading(container, 'Create New User');
  expect(screen.getByRole('group', { name: 'Account details' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Access' }).contains(screen.getByRole('combobox', { name: 'User Role' }))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
  await screen.findByText('Username and password are required.');
  expect(api.CreateUser).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: 'member' } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'exact password' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'User Role' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Administrator' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create User' }));
  await screen.findByRole('heading', { name: 'Dashboard destination' });
  expect(api.CreateUser).toHaveBeenCalledWith({ username: 'member', display_name: '', password: 'exact password', role: 'admin' });
});
it('keeps create cancellation on the existing dashboard route', async () => {
  mount(<CreateUser/>);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await screen.findByRole('heading', { name: 'Dashboard destination' });
  expect(api.CreateUser).not.toHaveBeenCalled();
});
