// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import Detail from './components/Event/Event.Component.Detail';
import * as api from './Data.Helper.Api';

vi.mock('./Data.Helper.Api');
vi.mock('./components/Comments/CommentSection', () => ({ default: ({ eventId }) => <div>Comments for {eventId}</div> }));
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const response = (id) => ({ ok: true, json: async () => ({ event: { id, title: `Event ${id}`, artists: [], images: [] } }) });
function mount() {
  return render(<MemoryRouter initialEntries={['/events/1']}><Link to="/events/2">Next event</Link><Routes><Route path="/events/:id" element={<Detail />} /></Routes></MemoryRouter>);
}
function expectCurrentEvent() {
  expect(screen.getByRole('heading', { level: 1, name: 'Event 2' })).toBeTruthy();
  expect(screen.getByText('Comments for 2')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
}
beforeEach(() => {
  vi.resetAllMocks();
  api.IsAdmin.mockReturnValue(true);
});
it.each(['success', 'failure', 'rejection'])('ignores a late upload %s after changing routes', async (completion) => {
  const upload = deferred();
  api.GetEventById.mockImplementation((id) => Promise.resolve(response(Number(id))));
  api.UploadEventImage.mockReturnValue(upload.promise);
  mount();
  await screen.findByRole('heading', { level: 1, name: 'Event 1' });
  fireEvent.change(screen.getByLabelText('Upload Photo', { selector: 'input' }), {
    target: { files: [new File(['fixture'], 'photo.png', { type: 'image/png' })] },
  });
  expect(api.UploadEventImage).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Next event'));
  await screen.findByRole('heading', { level: 1, name: 'Event 2' });
  await act(async () => {
    if (completion === 'rejection') upload.reject(new Error('Obsolete upload'));
    else upload.resolve({ ok: completion === 'success' });
  });
  expect(api.GetEventById.mock.calls.map(([id]) => id)).toEqual(['1', '2']);
  expectCurrentEvent();
  expect(screen.getByLabelText('Upload Photo', { selector: 'input' }).disabled).toBe(false);
});

it.each(['response', 'body', 'rejection'])('ignores a deferred old GET %s after changing routes', async (completion) => {
  const old = deferred();
  api.GetEventById.mockImplementation((id) => id === '1'
    ? completion === 'body' ? Promise.resolve({ ok: true, json: () => old.promise }) : old.promise
    : Promise.resolve(response(2)));
  mount();
  await act(async () => {});
  fireEvent.click(screen.getByText('Next event'));
  await screen.findByRole('heading', { level: 1, name: 'Event 2' });
  await act(async () => {
    if (completion === 'rejection') old.reject(new Error('Obsolete request'));
    else if (completion === 'body') old.resolve(await response(1).json());
    else old.resolve(response(1));
  });
  expectCurrentEvent();
});
