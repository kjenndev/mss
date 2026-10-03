// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ArtistCreate from './components/Artist/Artist.Component.Create';
import ArtistUpdate from './components/Artist/Artist.Component.Update';
import EventCreate from './components/Event/Event.Component.Create';
import EventUpdate from './components/Event/Event.Component.Update';
import ArtistDelete from './components/Artist/Artist.Component.Delete';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/User/User.Helper.DropDown', () => ({ default: () => null }));
vi.mock('./components/Artist/Artist.Helper.DropDown', () => ({ default: () => null }));
vi.mock('@mui/x-date-pickers/DateTimePicker', () => ({ DateTimePicker: () => <input aria-label="Date & Time" /> }));
beforeEach(() => {
  cleanup(); vi.resetAllMocks();
  api.IsAdmin.mockReturnValue(true); api.CanCreateEvent.mockReturnValue(true);
  api.CanEditEvent.mockReturnValue(true);
  api.GetArtistManageData.mockResolvedValue({ ok: true, json: async () => ({ artist: { id: 1, name: 'Artist' } }) });
  api.GetArtistImages.mockResolvedValue({ ok: true, json: async () => ({ images: [] }) });
  api.GetAllUsers.mockResolvedValue({ ok: true, json: async () => ({ users: [] }) });
  api.GetEventById.mockResolvedValue({ ok: true, json: async () => ({ event: { id: 1, title: 'Event' } }) });
});
it.each([
  [ArtistCreate, '/artists/create', 'Create New Artist Profile', 'Artist details'],
  [ArtistUpdate, '/artists/1/update', 'Update Artist Profile', 'Artist details'],
  [EventCreate, '/events/create', 'Create New Event', 'Event details'],
  [EventUpdate, '/events/1/update', 'Update Event', 'Event details'],
])('provides an editorial page heading and named form sections on case %#', async (Component, path, title, section) => {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path={path.includes('/1/') ? path.replace('/1/', '/:id/') : path} element={<Component />} /></Routes></MemoryRouter>);
  const heading = await screen.findByRole('heading', { level: 1, name: title });
  expect(heading.querySelector('[aria-hidden="true"]').textContent).toBe('.');
  expect(screen.getByRole('region', { name: section })).toBeTruthy();
  expect(screen.getByText(path.startsWith('/artists') ? 'Artist management' : 'Event management')).toBeTruthy();
});

it('offers a keyboard-operable gallery upload action', async () => {
  render(<MemoryRouter initialEntries={['/artists/1/update']}><Routes><Route path="/artists/:id/update" element={<ArtistUpdate />} /></Routes></MemoryRouter>);
  const upload = await screen.findByRole('button', { name: 'Upload gallery image' });
  expect(upload.tagName).toBe('BUTTON');
});
it.each([[EventCreate, 'Choose Flyer Image'], [EventUpdate, 'Change Flyer Image']])('offers a keyboard-operable flyer upload action on case %#', async (Component, name) => {
  render(<MemoryRouter initialEntries={['/events/1/update']}><Routes><Route path="/events/:id/update" element={<Component />} /></Routes></MemoryRouter>);
  const upload = await screen.findByRole('button', { name });
  expect(upload.tagName).toBe('BUTTON');
});
it('requires confirmation before deleting an artist', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  api.DeleteArtist.mockResolvedValue({ ok: false, status: 500 });
  render(<MemoryRouter><ArtistDelete id={1} onDelete={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(window.confirm).toHaveBeenCalled();
  expect(api.DeleteArtist).not.toHaveBeenCalled();
});
it('keeps a failed artist deletion on the page with actionable feedback', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  api.DeleteArtist.mockResolvedValue({ ok: false, status: 500 });
  const deleted = vi.fn();
  render(<MemoryRouter><ArtistDelete id={1} onDelete={deleted} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to delete artist. Please try again.');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled());
  expect(deleted).not.toHaveBeenCalled();
});
