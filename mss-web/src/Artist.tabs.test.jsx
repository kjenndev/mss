// @vitest-environment jsdom
import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ArtistUpdate from './components/Artist/Artist.Component.Update';
import * as api from './Data.Helper.Api';
import { readFileSync } from 'node:fs';
const editorStyles = readFileSync('src/components/Artist/Artist.Component.Update.module.css', 'utf8');
vi.mock('./Data.Helper.Api');
const artist = { id: 1, name: 'Fixture artist', user_id: 2, is_disabled: false };
const ok = data => ({ ok: true, json: async () => data });
beforeEach(() => {
 cleanup(); vi.resetAllMocks();
 api.IsAdmin.mockReturnValue(true); api.CanEditArtist.mockReturnValue(true);
 api.GetCurrentUser.mockResolvedValue(ok({ user: { role: 'admin' } }));
 api.GetArtistManageData.mockResolvedValue(ok({ artist }));
 api.GetArtistImages.mockResolvedValue(ok({ images: [{ id: 3, url: '/fixture.png' }] }));
 api.GetAllUsers.mockResolvedValue(ok({ users: [{ id: 2, username: 'owner', role: 'artist' }] }));
 api.GetArtistYouTubeVideos.mockResolvedValue(ok({ configured: true, limit: 20, videos: [{ videoId: 'abcdefghijk', title: 'Fixture video', url: 'https://www.youtube.com/watch?v=abcdefghijk', createdAt: '2025-01-01T00:00:00Z' }] }));
});
function mount() {
 render(<MemoryRouter initialEntries={['/artists/1/update']}><Routes><Route path="/artists/:id/update" element={<ArtistUpdate />} /></Routes></MemoryRouter>);
 return userEvent.setup();
}
it('defaults to Details and switches linked accessible panels with mouse and keyboard without mutations', async () => {
 const user = mount();
 const details = await screen.findByRole('tab', { name: 'Details', selected: true });
 const tabs = screen.getAllByRole('tab');
 expect(tabs.map(tab => tab.textContent)).toEqual(['Details', 'Gallery Management', 'YouTube Links']);
 expect(within(screen.getByRole('tabpanel', { name: 'Details' })).getByRole('button', { name: 'Save Changes' })).toBeTruthy();
 for (const tab of tabs) {
  expect(tab.type).toBe('button');
  const panel = document.getElementById(tab.getAttribute('aria-controls'));
  expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
 }
 await user.click(screen.getByRole('tab', { name: 'Gallery Management' }));
 expect(screen.getByRole('tabpanel', { name: 'Gallery Management' })).toBeTruthy();
 expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull();
 await user.keyboard('{ArrowRight}');
 expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'YouTube Links' }));
 await user.keyboard('{Enter}');
 expect(screen.getByRole('tabpanel', { name: 'YouTube Links' })).toBeTruthy();
 await user.keyboard('{Home}{Enter}');
 expect(details.getAttribute('aria-selected')).toBe('true');
 for (const fn of [api.UpdateArtist, api.SetArtistVisibility, api.UploadArtistImage, api.DeleteArtistImage, api.AddArtistYouTubeVideo, api.DeleteArtistYouTubeVideo]) expect(fn).not.toHaveBeenCalled();
});
it('preserves detail drafts, gallery nodes and YouTube draft/confirmation while panels are hidden', async () => {
 const user = mount();
 const name = await screen.findByLabelText(/Artist Name/);
 await user.clear(name); await user.type(name, 'Unsaved details');
 await user.click(screen.getByRole('tab', { name: 'Gallery Management' }));
 const upload = screen.getByRole('button', { name: 'Upload gallery image' });
 await user.click(screen.getByRole('tab', { name: 'YouTube Links' }));
 const url = await screen.findByLabelText('YouTube Video URL');
 await user.type(url, 'https://youtu.be/12345678901');
 await user.click(screen.getByRole('button', { name: 'Remove Fixture video' }));
 await user.click(screen.getByRole('tab', { name: 'Details' }));
 expect(name.value).toBe('Unsaved details');
 expect(screen.queryByRole('textbox', { name: 'YouTube Video URL' })).toBeNull();
 await user.click(screen.getByRole('tab', { name: 'Gallery Management' }));
 expect(screen.getByRole('button', { name: 'Upload gallery image' })).toBe(upload);
 await user.click(screen.getByRole('tab', { name: 'YouTube Links' }));
 expect(screen.getByLabelText('YouTube Video URL')).toBe(url);
 expect(url.value).toBe('https://youtu.be/12345678901');
 expect(screen.getByRole('group', { name: 'Confirm video removal' })).toBeTruthy();
 expect(api.GetArtistYouTubeVideos).toHaveBeenCalledTimes(1);
 expect(api.DeleteArtistYouTubeVideo).not.toHaveBeenCalled();
});
it('retains verified admin and owner gates across switches', async () => {
 api.IsAdmin.mockReturnValue(false); api.CanEditArtist.mockReturnValue(false);
 api.GetCurrentUser.mockResolvedValue(ok({ user: { role: 'user' } }));
 const user = mount(); await screen.findByRole('tab', { name: 'Details' });
 await waitFor(() => expect(api.GetCurrentUser).toHaveBeenCalled());
 expect(screen.queryByRole('switch')).toBeNull();
 expect(screen.getByLabelText('Streaming Platform Channel Name').disabled).toBe(true);
 expect(screen.queryByLabelText('Associated User (Admin Only)')).toBeNull();
 await user.click(screen.getByRole('tab', { name: 'YouTube Links' }));
 expect(screen.queryByLabelText('YouTube Video URL')).toBeNull();
 expect(api.GetArtistYouTubeVideos).not.toHaveBeenCalled();
});

it('overlays profile and cover designations inside gallery artwork and removes visibility dividers', async () => {
 api.GetArtistManageData.mockResolvedValue(ok({ artist: { ...artist, profile_picture: '/fixture.png', cover_photo: '/fixture.png' } }));
 const user = mount();
 const visibility = await screen.findByRole('region', { name: 'Profile visibility' });
 expect(getComputedStyle(visibility).borderTopWidth).not.toBe('1px');
 expect(getComputedStyle(screen.getByRole('region', { name: 'Artist details' })).borderTopWidth).not.toBe('1px');
 await user.click(screen.getByRole('tab', { name: 'Gallery Management' }));
 const image = screen.getByRole('img', { name: 'artist upload' });
 expect(editorStyles).toMatch(/\.imageFrame\s*\{[^}]*position:\s*relative/);
 expect(editorStyles).toMatch(/\.designations\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0/);
 for (const label of ['PROFILE PIC', 'COVER PHOTO']) {
  expect(image.parentElement.contains(screen.getByText(label))).toBe(true);
  expect(screen.getByText(label).compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 }
});
