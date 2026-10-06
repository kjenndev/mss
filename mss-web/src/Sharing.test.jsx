import { describe, it, expect } from 'vitest';
import { sharingData } from './components/Sharing/shareCard';
describe('sharing identity', () => {
 it('uses only the artist portrait and numeric route, never cover or slug', () => {
  expect(sharingData('artists', { id: 7, name: '音楽 DJ', slug: 'other', profile_picture: '/uploads/portrait.png', cover_photo: '/uploads/cover.png' }, 'https://mss.example')).toMatchObject({ title: '音楽 DJ', image: '/uploads/portrait.png', url: 'https://mss.example/artists/7' });
 });
});

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi } from 'vitest';
import ShareSheet from './components/Sharing/ShareSheet';
it('opens an accessible sheet with the event flyer, copy failure is honest, Escape close restores trigger', async () => {
 vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://mss.example');
 Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
 render(<ShareSheet kind="events" entity={{ id: 8, title: 'Event', flyer: '/uploads/flyer.png', cover_photo: '/uploads/wrong.png' }} />);
 const trigger = screen.getByRole('button', { name: 'Share event' });
 act(() => trigger.focus()); fireEvent.click(trigger);
 expect(screen.getByRole('dialog', { name: 'Take the sound with you' })).toBeInTheDocument();
 expect(screen.getByAltText('Event event flyer')).toHaveAttribute('src', '/uploads/flyer.png');
 fireEvent.click(screen.getByRole('button', { name: /Copy link/ }));
 await screen.findByText(/Copy failed/);
 expect(screen.getByLabelText('Share URL')).toHaveValue('https://mss.example/events/8');
 fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
 await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
 expect(trigger).toHaveFocus();
 vi.unstubAllEnvs();
});

import { createSharePng } from './components/Sharing/shareCard';
it('exports the full natural source into a 1080x1350 PNG without using cover artwork', async () => {
 const drawImage = vi.fn();
 const context = { fillRect: vi.fn(), fillText: vi.fn(), measureText: text => ({ width: text.length * 20 }), drawImage };
 const canvas = { width: 0, height: 0, getContext: () => context, toBlob: cb => cb(new Blob(['png'], { type: 'image/png' })) };
 const img = { naturalWidth: 400, naturalHeight: 800 };
 const loadImage = vi.fn().mockResolvedValue(img);
 const blob = await createSharePng({ title: '音楽', image: '/uploads/portrait.png', detail: 'Chicago' }, { canvas, loadImage });
 expect(loadImage).toHaveBeenCalledWith('/uploads/portrait.png');
 expect(canvas.width).toBe(1080); expect(canvas.height).toBe(1350);
 expect(drawImage).toHaveBeenCalledWith(img, 290, 150, 500, 1000);
 expect(blob.type).toBe('image/png');
});

it('offers Instagram manual download and copy, with no automatic provider posting', () => {
 vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://mss.example');
 render(<ShareSheet kind="artists" entity={{ id: 7, name: 'DJ' }} />);
 fireEvent.click(screen.getByRole('button', { name: 'Share artist' }));
 expect(screen.getByRole('button', { name: /Instagram/ })).toBeEnabled();
 expect(screen.getByText(/Nothing is posted automatically/)).toBeInTheDocument();
 vi.unstubAllEnvs();
});

it('does not claim copy success while clipboard is still pending', async () => {
 vi.stubEnv('VITE_PUBLIC_SITE_ORIGIN', 'https://mss.example');
 let resolve;
 Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise(r => { resolve=r; }) } });
 render(<ShareSheet kind="artists" entity={{ id: 7, name: 'DJ' }} />);
 fireEvent.click(screen.getByRole('button', { name:'Share artist' }));
 fireEvent.click(screen.getByRole('button', { name:'Copy link' }));
 expect(screen.queryByText('Link copied.')).toBeNull();
 await act(async()=>resolve());
 expect(screen.getByText('Link copied.')).toBeInTheDocument();
 vi.unstubAllEnvs();
});
it.each(['', 'http://localhost:5174', 'https://mss.example/evil', 'https://user:pass@mss.example'])('rejects absent or unsafe configured origins: %s', origin=>{
 expect(sharingData('events',{id:8,title:'Event',flyer:'/uploads/flyer.png'},origin).url).toBe('');
});
it('keeps missing artwork neutral and displays a broken-image fallback',()=>{
 render(<ShareSheet kind="events" entity={{id:8,title:'Event',flyer:'/uploads/broken.png'}} />);
 fireEvent.click(screen.getByRole('button',{name:'Share event'}));
 fireEvent.error(screen.getByAltText('Event event flyer'));
 expect(screen.getByText('Event flyer unavailable')).toBeInTheDocument();
});
it('reports export image and canvas failures instead of returning a fake PNG',async()=>{
 await expect(createSharePng({image:'/uploads/broken.png'}, {loadImage:async()=>{throw new Error('Unavailable');}})).rejects.toThrow('Unavailable');
 const context={fillRect:()=>{},fillText:()=>{},measureText:()=>({width:0})};
 await expect(createSharePng({title:'No art'}, {canvas:{getContext:()=>context,toBlob:cb=>cb(null)}})).rejects.toThrow('PNG export failed');
});

it('prints the canonical URL on the downloaded card',async()=>{
 const context={fillRect:vi.fn(),fillText:vi.fn(),measureText:text=>({width:text.length*10})};
 await createSharePng({title:'DJ',url:'https://mss.example/artists/7'}, {canvas:{getContext:()=>context,toBlob:cb=>cb(new Blob())}});
 expect(context.fillText).toHaveBeenCalledWith('https://mss.example/artists/7',48,1320);
});

import { downloadCard } from './components/Sharing/shareCard';
it('preserves Unicode code points in safe filenames and releases download URLs',()=>{
 vi.useFakeTimers();
 const create=vi.fn(()=> 'blob:synthetic'),revoke=vi.fn();
 vi.stubGlobal('URL',Object.assign(class {},{createObjectURL:create,revokeObjectURL:revoke}));
 let filename;
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(){filename=this.download;});
 const title='A'+'𠮷'.repeat(40);
 downloadCard(new Blob(),title);
 expect(filename).toBe(`${title}-share.png`);
 vi.runAllTimers();expect(revoke).toHaveBeenCalledWith('blob:synthetic');
 click.mockRestore();vi.unstubAllGlobals();vi.useRealTimers();
});
