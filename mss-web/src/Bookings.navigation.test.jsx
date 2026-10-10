// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import Nav from './components/Nav.Component.Wrapper';
import Menu from './components/Nav.Component.Menu';
import Dashboard from './components/Admin/Admin.Dashboard.Component';
import RouteGuard from './RouteGuard';
import AdminBookings, { BookingDetail } from './components/Bookings/AdminBookings';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('exposes Bookings in the shared desktop/mobile primary nav and closes the mobile menu', () => {
  render(<MemoryRouter initialEntries={['/bookings']}><Nav /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  expect(within(screen.getByRole('navigation', { name: 'Primary' })).getAllByRole('link').map(link => link.textContent)).toEqual(['Home', 'About', 'Bookings', 'Artists', 'Events', 'Shop']);
  const link = screen.getByRole('link', { name: 'Bookings' });
  expect(link.getAttribute('href')).toBe('/bookings');
  expect(link.getAttribute('aria-current')).toBe('page');
  fireEvent.click(link);
  expect(screen.getByRole('button', { name: 'Toggle navigation' }).getAttribute('aria-expanded')).toBe('false');
});
it('wires public and admin-only booking routes under the existing visibility boundary', () => {
  const source = readFileSync('src/main.jsx', 'utf8');
  expect(source).toContain('path="/bookings" element={<Bookings');
  expect(source).toContain('path="/admin/bookings" element={<RouteGuard admin><AdminBookings');
  expect(source).toContain('path="/admin/bookings/:id" element={<RouteGuard admin><BookingDetail');
  expect(source).toContain('<VisibilityBoundary>');
});
it('offers the admin inbox in the dashboard and account menu', async () => {
  api.IsAdmin.mockReturnValue(true); api.HasSession.mockReturnValue(true);
  api.GetAllArtists.mockResolvedValue({ ok: true, json: async () => ({ artists: [] }) });
  api.GetCurrentUser.mockResolvedValue({ ok: true, json: async () => ({ user: { role: 'admin', username: 'Admin' } }) });
  api.GetMyArtists.mockResolvedValue({ ok: true, json: async () => ({ artists: [] }) });
  const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getByRole('link', { name: 'Booking inbox' }).getAttribute('href')).toBe('/admin/bookings');
  view.unmount(); render(<MemoryRouter><Menu /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'account of current user' }));
  expect(await screen.findByRole('menuitem', { name: 'Booking inbox' })).toBeTruthy();
});
it.each([<AdminBookings />, <BookingDetail />])('never mounts or loads private booking data for a non-admin (%s)', async component => {
  api.HasSession.mockReturnValue(true);
  api.GetCurrentUser.mockResolvedValue({ ok: true, json: async () => ({ user: { role: 'artist' } }) });
  render(<MemoryRouter><RouteGuard admin>{component}</RouteGuard></MemoryRouter>);
  await screen.findByText(/not authorized/);
  expect(api.GetBookings).not.toHaveBeenCalled();
  expect(api.GetBooking).not.toHaveBeenCalled();
});
