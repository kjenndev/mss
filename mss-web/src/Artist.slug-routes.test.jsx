import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArtistDetail from './components/Artist/Artist.Component.Detail';
import ArtistList from './components/Artist/Artist.Component.List';
import { artistProfilePath } from './artistRoutes';
import * as api from './Data.Helper.Api';

vi.mock('./Data.Helper.Api', async original => ({ ...(await original()), GetArtistById: vi.fn(), GetArtistImages: vi.fn(), GetSettings: vi.fn(), GetActiveSyndicateStreams: vi.fn(), GetMediaLibrary: vi.fn(), GetAllArtists: vi.fn(), CanEditArtist: () => false, HasSession: () => false, IsAdmin: () => false }));
vi.mock('./components/Comments/CommentSection', () => ({ default: () => <div>Comments</div> }));

function LocationProbe() {
  return <output aria-label="Current path">{useLocation().pathname}</output>;
}

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  api.GetArtistImages.mockResolvedValue({ ok: true, json: async () => ({ images: [] }) });
  api.GetSettings.mockResolvedValue({ ok: true, json: async () => ({ settings: {} }) });
  api.GetActiveSyndicateStreams.mockResolvedValue({ ok: true, json: async () => ({ streams: [] }) });
  api.GetMediaLibrary.mockResolvedValue({ ok: true, json: async () => ({ items: [], sources: [], total: 0, nextOffset: null, complete: true }) });
});

describe('artist slug profile routes', () => {
  it('builds only encoded canonical slug profile paths', () => {
    expect(artistProfilePath({ slug: 'midnight-sound-syndicate' })).toBe('/artists/midnight-sound-syndicate');
    expect(() => artistProfilePath({ id: 7 })).toThrow(/slug/i);
    for (const artist of [{ name: '123', slug: '123' }, { name: 'Create', slug: 'create' }]) {
      expect(() => artistProfilePath(artist)).toThrow(/slug/i);
    }
  });

  it('links every directory profile card by slug while edit stays ID-based', async () => {
    api.GetAllArtists.mockResolvedValue({ ok: true, json: async () => ({ artists: [{ id: 7, slug: 'midnight-sound-syndicate', name: 'Midnight Sound Syndicate' }] }) });
    render(<MemoryRouter><ArtistList /></MemoryRouter>);
    expect((await screen.findByRole('link', { name: 'Midnight Sound Syndicate' })).getAttribute('href')).toBe('/artists/midnight-sound-syndicate');
  });

  it('resolves a slug then uses the numeric ID for related APIs', async () => {
    api.GetArtistById.mockResolvedValue({ ok: true, json: async () => ({ artist: { id: 7, slug: 'midnight-sound-syndicate', name: 'Midnight Sound Syndicate' }, canonicalPath: '/artists/midnight-sound-syndicate' }) });
    render(<MemoryRouter initialEntries={['/artists/midnight-sound-syndicate']}><Routes><Route path="/artists/:profile" element={<ArtistDetail />} /></Routes></MemoryRouter>);
    await screen.findByRole('heading', { level: 1, name: 'Midnight Sound Syndicate' });
    expect(api.GetArtistById).toHaveBeenCalledWith('midnight-sound-syndicate');
    await waitFor(() => expect(api.GetArtistImages).toHaveBeenCalledWith(7));
    await waitFor(() => expect(api.GetMediaLibrary).toHaveBeenCalledWith(0, 7));
  });

  it('replaces a legacy numeric browser URL with the canonical slug without losing the loaded profile', async () => {
    api.GetArtistById.mockResolvedValue({ ok: true, json: async () => ({ artist: { id: 7, slug: 'midnight-sound-syndicate', name: 'Midnight Sound Syndicate' }, canonicalPath: '/artists/midnight-sound-syndicate' }) });
    render(<MemoryRouter initialEntries={['/artists/7']}><LocationProbe /><Routes><Route path="/artists/:profile" element={<ArtistDetail />} /></Routes></MemoryRouter>);
    await screen.findByRole('heading', { level: 1, name: 'Midnight Sound Syndicate' });
    await waitFor(() => expect(screen.getByRole('status', { name: 'Current path' })).toHaveTextContent('/artists/midnight-sound-syndicate'));
  });
});
