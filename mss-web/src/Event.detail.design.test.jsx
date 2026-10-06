// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Detail from './components/Event/Event.Component.Detail';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Comments/CommentSection', () => ({ default: ({ eventId }) => <div>Comments for {eventId}</div> }));
const event = { id: 7, title: 'Night Assembly', date: '2026-10-24T21:00:00', location: 'Community Hall', description: 'Real event description', flyer: '/uploads/flyer.png', flyer_artist_name: 'Flyer Creator', flyer_artist_url: 'https://example.com/credit', ticket_link: 'https://example.com/tickets', artists: [{ id: 3, name: 'Performer' }], images: [{ id: 9, url: '/uploads/photo.png' }] };
function mount() {
 return render(<MemoryRouter initialEntries={['/events/7']}><Routes><Route path="/events/:id" element={<Detail />} /><Route path="/events/:id/update" element={<div>Event editor</div>} /><Route path="/artists/:id" element={<div>Artist profile</div>} /></Routes></MemoryRouter>);
}
beforeEach(() => {
 vi.resetAllMocks();
 api.GetEventById.mockResolvedValue({ ok: true, json: async () => ({ event }) });
 api.CanEditEvent.mockReturnValue(true);
});
it('places event identity and actions beside the portrait with photos and conversation below', async () => {
 const { container } = mount();
 const title = await screen.findByRole('heading', { level: 1, name: 'Night Assembly' });
 const details = title.closest('article');
 expect(details).toBeTruthy();
 expect(within(details).getByRole('link', { name: /Get Tickets/i }).getAttribute('href')).toBe(event.ticket_link);
 expect(within(details).getByRole('button', { name: /Edit Event/i })).toBeTruthy();
 expect(within(details).getByText('Community Hall')).toBeTruthy();
 expect(within(details).getByRole('heading', { name: 'The lineup' })).toBeTruthy();
 expect(within(details).getByText(event.description)).toBeTruthy();
 expect(screen.getByRole('link', { name: 'Flyer Creator' }).getAttribute('href')).toBe(event.flyer_artist_url);
 const photos = screen.getByRole('region', { name: 'Event Photos' });
 const conversation = screen.getByRole('region', { name: 'Conversation' });
 expect(photos.parentElement).toBe(conversation.parentElement);
 expect(within(conversation).getByText('Comments for 7')).toBeTruthy();
 expect(container.querySelector('.MuiPaper-root')).toBeNull();
 fireEvent.click(within(details).getByRole('button', { name: /Edit Event/i }));
 expect(await screen.findByText('Event editor')).toBeTruthy();
});

it('omits event breadcrumbs while retaining the event heading and lineup links', async () => {
 mount();
 expect(await screen.findByRole('heading', { level: 1, name: event.title })).toBeTruthy();
 expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
 expect(screen.queryByRole('link', { name: 'Events' })).toBeNull();
 expect(screen.getAllByText(event.title, { exact: true })).toHaveLength(1);
 expect(screen.getByRole('link', { name: 'Performer' }).getAttribute('href')).toBe('/artists/3');
 expect(screen.getByText('Comments for 7')).toBeTruthy();
});

it('keeps a truthful fallback when the flyer cannot load', async () => {
 mount();
 fireEvent.error(await screen.findByAltText(event.title));
 expect(screen.getByText('No Flyer Available')).toBeTruthy();
 expect(screen.getByRole('link', { name: /Get Tickets/i })).toBeTruthy();
});
it('retains artist navigation and accessible original-photo links', async () => {
 mount();
 const artist = await screen.findByRole('link', { name: 'Performer' });
 expect(screen.getByRole('link', { name: 'Open event photo 1' }).getAttribute('href')).toBe('/uploads/photo.png');
 fireEvent.click(artist);
 expect(await screen.findByText('Artist profile')).toBeTruthy();
});
it.each([
 ['visitor', false, false, undefined, false],
 ['owner', true, false, undefined, true],
 ['admin', false, true, undefined, true],
 ['participant', false, false, 3, true],
])('preserves upload permission for %s', async (_role, canEdit, admin, artistId, upload) => {
 api.CanEditEvent.mockReturnValue(canEdit);
 api.IsAdmin.mockReturnValue(admin);
 api.GetSessionArtistId.mockReturnValue(artistId);
 const { container } = mount();
 await screen.findByRole('heading', { level: 1, name: event.title });
 expect(Boolean(container.querySelector('input[type=file]'))).toBe(upload);
 expect(Boolean(screen.queryByRole('button', { name: /Edit Event/i }))).toBe(canEdit);
});
it('shows loading and retries event loading without losing the real comments scope', async () => {
 api.GetEventById.mockResolvedValueOnce({ ok: false });
 mount();
 expect(screen.getByRole('progressbar')).toBeTruthy();
 fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
 expect(await screen.findByRole('heading', { level: 1, name: event.title })).toBeTruthy();
 expect(screen.getByText('Comments for 7')).toBeTruthy();
});
it('retains missing-data fallbacks without inventing links', async () => {
 api.GetEventById.mockResolvedValue({ ok: true, json: async () => ({ event: { id: 7, title: 'Unannounced', artists: [], images: [] } }) });
 mount();
 expect(await screen.findByText('No Flyer Available')).toBeTruthy();
 expect(screen.getByText('Date TBD')).toBeTruthy();
 expect(screen.getByText('Location TBD')).toBeTruthy();
 expect(screen.getByText('No description provided.')).toBeTruthy();
 expect(screen.getByText('No photos yet.')).toBeTruthy();
 expect(screen.queryByRole('link', { name: /Get Tickets/i })).toBeNull();
});
it('refreshes gallery data after a successful upload', async () => {
 api.UploadEventImage.mockResolvedValue({ ok: true });
 const { container } = mount();
 await screen.findByRole('heading', { level: 1, name: event.title });
 const file = new File(['fixture'], 'test.png', { type: 'image/png' });
 fireEvent.change(container.querySelector('input[type=file]'), { target: { files: [file] } });
 await waitFor(() => expect(api.UploadEventImage).toHaveBeenCalledWith('7', file));
 await waitFor(() => expect(api.GetEventById).toHaveBeenCalledTimes(2));
 expect(await screen.findByRole('heading', { level: 1, name: event.title })).toBeTruthy();
});
