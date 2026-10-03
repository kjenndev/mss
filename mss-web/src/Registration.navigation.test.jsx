// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import Login from './components/Auth/Auth.Component.Login';
import Nav from './components/Nav.Component.Menu';
import LegalPage from './components/Auth/LegalPage';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
afterEach(cleanup);
it('exposes public signup and recovery links on login', () => {
  render(<MemoryRouter><Login /></MemoryRouter>);
  expect(screen.getByRole('link', {
    name: 'Create account'
  }).getAttribute('href')).toBe('/register');
  expect(screen.getByRole('link', {
    name: 'Resend verification email'
  }).getAttribute('href')).toBe('/resend-verification');
});
it('exposes visitor signup', () => {
  api.HasSession.mockReturnValue(false);
  render(<MemoryRouter><Nav /></MemoryRouter>);
  expect(screen.getByRole('link', {
    name: 'Create account'
  }).getAttribute('href')).toBe('/register');
});
it('renders readable legal sections and version', () => {
  render(<MemoryRouter><LegalPage kind="terms" /></MemoryRouter>);
  expect(screen.getByRole('heading', {
    level: 1,
    name: 'Terms of Service'
  })).toBeTruthy();
  expect(screen.getByText(/Version 2026-10-03/)).toBeTruthy();
  expect(screen.getAllByRole('heading', {
    level: 2
  }).length).toBeGreaterThan(1);
});
it('wires public routes and the admin-only email settings route', () => {
  const source = readFileSync('src/main.jsx', 'utf8');
  for (const path of ['/register', '/verify-email', '/resend-verification', '/terms', '/privacy']) expect(source).toContain('path="' + path + '"');
  expect(source).toContain('path="/admin/email" element={<RouteGuard admin>');
});

it('describes the website operators without asserting unverified entity status or preference history', async () => {
  const { termsSections, privacySections } = await import('./content/registrationLegal');
  const terms = JSON.stringify(termsSections), privacy = JSON.stringify(privacySections);
  expect(terms).not.toMatch(/not an incorporated|not.*separate legal entity/);
  expect(privacy).not.toMatch(/not an incorporated|update records/);
  expect(privacy).toContain('its most recent update time');
  expect(terms).toContain('person or persons operating');
  expect(privacy).toContain('support@midnightsoundsyndicate.com');
});
