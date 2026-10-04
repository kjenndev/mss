// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import MediaLibrary from './components/Media/MediaLibrary';
import { MediaPlayerProvider } from './components/Media/MediaPlayerProvider';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api', () => ({GetMediaLibrary:vi.fn()}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });
const track = (id, provider = 'soundcloud', createdAt = '2026-01-01T00:00:00Z') => ({id,provider,platform:provider === 'soundcloud' ? 'SoundCloud':'Mixcloud',title:`Track ${id}`,artistId:1,artistName:'Test artist',url:provider === 'soundcloud' ? `https://soundcloud.com/test/${id}`:`https://www.mixcloud.com/test/${id}/`,createdAt,durationSeconds:3600});
const response = (items, extra = {}) => ({ok:true,json:async()=>({items,total:items.length,nextOffset:null,complete:true,sources:[],cache:{fetchedAt:'snapshot-1'},...extra})});
it('selects a visible official player and switches queue entries without overlapping frames',async()=>{
 api.GetMediaLibrary.mockResolvedValue(response([track('sc'),track('mc','mixcloud','2025-01-01T00:00:00Z')]));
 const {container}=setup();
 fireEvent.click(await screen.findByRole('button',{name:'Play Track sc'}));
 const first=screen.getByTitle('SoundCloud player');
 expect(new URL(first.src).origin).toBe('https://w.soundcloud.com');
 expect(new URL(first.src).searchParams.get('url')).toBe(track('sc').url);
 expect(new URL(first.src).searchParams.get('auto_play')).toBe('true');
 expect(screen.getByRole('button',{name:'Previous track'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Next track'}));
 expect(first.isConnected).toBe(false);
 const mc=screen.getByTitle('Mixcloud player');
 expect(new URL(mc.src).origin).toBe('https://www.mixcloud.com');
 expect(new URL(mc.src).searchParams.get('feed')).toBe(track('mc','mixcloud').url);
 expect(mc.getAttribute('height')).toBe('120');
 expect(container.querySelectorAll('iframe')).toHaveLength(1);
 expect(screen.getByRole('link',{name:'Open on Mixcloud'}).href).toBe(track('mc','mixcloud').url);
 expect(screen.getByRole('button',{name:'Next track'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Previous track'}));
 expect(mc.isConnected).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Close audio player'}));
 expect(container.querySelector('iframe')).toBeNull();
});
it('rejects unsafe and noncanonical provider URLs rather than creating playable entries',async()=>{
 const urls=['javascript:alert(1)','http://soundcloud.com/test/x','https://soundcloud.com.evil.test/test/x','https://evil.test/x','https://user@soundcloud.com/test/x','https://soundcloud.com:444/test/x','https://soundcloud.com/test','https://soundcloud.com/test/sets/x'];
 api.GetMediaLibrary.mockResolvedValue(response([...urls.map((url,i)=>({...track(String(i)),url})),track('safe')]));
 setup(); await screen.findByRole('button',{name:'Play Track safe'});
 expect(screen.getAllByRole('button',{name:/Play Track/})).toHaveLength(1);
 expect(screen.getByText(/Some uploads could not be displayed safely/)).toBeTruthy();
});
it.each([{ok:false}, {ok:true,json:async()=>({items:null})}])('offers retry instead of false empty results after an API failure (%j)',async failure=>{
 api.GetMediaLibrary.mockResolvedValue(failure); setup();
 expect((await screen.findByRole('button',{name:'Retry library'})).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Retry library'}));
 api.GetMediaLibrary.mockResolvedValue(response([]));
 expect((await screen.findByRole('button',{name:'Retry library'})).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Retry library'}));
 expect(await screen.findByText('No public uploads found for linked artist profiles.')).toBeTruthy();
});
it('reports partial and stale sources without hiding available uploads or claiming an empty library',async()=>{
 api.GetMediaLibrary.mockResolvedValue(response([track('available')],{complete:false,sources:[{artistId:1,artistName:'Test artist',provider:'soundcloud',status:'not_configured',message:'SoundCloud credentials are not configured.'}],cache:{stale:true,refreshing:true}})); setup();
 await screen.findByRole('button',{name:'Play Track available'});
 expect(screen.getByText('Some artist sources are unavailable or incomplete.')).toBeTruthy();
 expect(screen.getByText(/SoundCloud credentials are not configured/)).toBeTruthy();
 expect(screen.getByText(/Showing cached uploads/)).toBeTruthy();
});
it('loads subsequent pages, deduplicates entries and resets when the server snapshot changes',async()=>{
 api.GetMediaLibrary.mockResolvedValueOnce(response([track('one')],{total:3,nextOffset:1})).mockResolvedValueOnce(response([track('one'),track('two')],{total:3,nextOffset:2})).mockResolvedValueOnce(response([track('obsolete')],{total:1,cache:{fetchedAt:'snapshot-2'}})).mockResolvedValueOnce(response([track('replacement')],{total:1,cache:{fetchedAt:'snapshot-2'}}));
 setup(); fireEvent.click(await screen.findByRole('button',{name:'Load more uploads'}));
 await screen.findByRole('button',{name:'Play Track two'});
 expect(screen.getAllByRole('button',{name:/Play Track/})).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Load more uploads'}));
 await screen.findByRole('button',{name:'Play Track replacement'});
 expect(screen.queryByRole('button',{name:'Play Track one'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Play Track obsolete'})).toBeNull();
 expect(api.GetMediaLibrary.mock.calls.map(call=>call[0])).toEqual([0,1,2,0]);
 expect(screen.queryByRole('button',{name:'Load more uploads'})).toBeNull();
});
it('provides player loading, recovery, and provider-owned playback controls',async()=>{
 api.GetMediaLibrary.mockResolvedValue(response([track('sc')])); setup();
 fireEvent.click(await screen.findByRole('button',{name:'Play Track sc'}));
 expect(screen.getByText('Loading SoundCloud player…')).toBeTruthy();
 const frame=screen.getByTitle('SoundCloud player');
 vi.useFakeTimers();
 // Cross-origin iframe failures do not reliably emit error events.
 fireEvent.click(screen.getByRole('button',{name:'Reload player'}));
 await act(async()=>{vi.advanceTimersByTime(15000);});
 expect(screen.getByText(/Player could not be loaded/)).toBeTruthy();
 expect(screen.getByRole('button',{name:'Retry player'}).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Reload player'}));
 expect(frame.isConnected).toBe(false);
 fireEvent.load(screen.getByTitle('SoundCloud player'));
 expect(screen.queryByText('Loading SoundCloud player…')).toBeNull();
 expect(screen.queryByText(/Use the visible provider controls/)).toBeNull();
 expect(screen.getByTitle('SoundCloud player')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Reload player'})).toBeTruthy();
});
it('renders original upload metadata including unknown dates and access restrictions',async()=>{
 api.GetMediaLibrary.mockResolvedValue(response([{...track('preview'),providerAccess:'preview'}, {...track('blocked','soundcloud',null),providerAccess:'blocked'}, {...track('embed-disabled'),playable:false}])); setup();
 await screen.findByRole('button',{name:'Play Track preview'});
 expect(screen.getByText('Preview only')).toBeTruthy();
 expect(screen.getByText('Restricted · check provider')).toBeTruthy();
 expect(screen.getByText('Upload date unknown')).toBeTruthy();
 expect(screen.getAllByText('60 min')).toHaveLength(3);
 expect(screen.getByText('Embedding unavailable · check provider')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Play Track blocked'})).toBeTruthy();
});
it('refreshes a pending server snapshot automatically without replacing the active audio frame',async()=>{
 vi.useFakeTimers();
 api.GetMediaLibrary.mockResolvedValueOnce(response([track('cached')],{cache:{fetchedAt:'old',stale:true,refreshing:true}})).mockResolvedValue(response([track('fresh')],{cache:{fetchedAt:'new',stale:false,refreshing:false}}));
 setup(); await act(async()=>{});
 fireEvent.click(screen.getByRole('button',{name:'Play Track cached'}));
 const frame=screen.getByTitle('SoundCloud player');
 await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
 expect(screen.getByRole('button',{name:'Play Track fresh'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Play Track cached'})).toBeNull();
 expect(screen.getByTitle('SoundCloud player')).toBe(frame);
 await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
 expect(api.GetMediaLibrary).toHaveBeenCalledTimes(2);
});
it('lets listeners reload unavailable sources without a rapid automatic retry loop',async()=>{
 vi.useFakeTimers(); api.GetMediaLibrary.mockResolvedValue(response([],{complete:false,cache:{refreshing:false,stale:true},sources:[]}));
 setup(); await act(async()=>{});
 await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
 expect(api.GetMediaLibrary).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Reload library'}));
 await act(async()=>{}); expect(api.GetMediaLibrary).toHaveBeenCalledTimes(2);
});
it('refreshes expired cache on a bounded TTL schedule',async()=>{
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
 api.GetMediaLibrary.mockResolvedValueOnce(response([],{cache:{expiresAt:'2026-01-01T00:01:00Z'}})).mockResolvedValue(response([track('ttl')],{cache:{}}));
 setup(); await act(async()=>{});
 await act(async()=>{await vi.advanceTimersByTimeAsync(60000);});
 expect(screen.getByRole('button',{name:'Play Track ttl'})).toBeTruthy();
 expect(api.GetMediaLibrary).toHaveBeenCalledTimes(2);
});
function setup() { return render(<MediaPlayerProvider><MediaLibrary /></MediaPlayerProvider>); }
it('orders valid pre-1970 uploads before unknown dates with stable ID ties',async()=>{
 api.GetMediaLibrary.mockResolvedValue(response([
  track('unknown-z','soundcloud',null),
  track('old-z','soundcloud','1960-01-01T00:00:00Z'),
  track('unknown-a','soundcloud','invalid'),
  track('old-a','soundcloud','1960-01-01T00:00:00Z'),
  track('epoch','soundcloud','1970-01-01T00:00:00Z'),
 ]));
 setup();
 const buttons=await screen.findAllByRole('button',{name:/Play Track/});
 expect(buttons.map(button=>button.getAttribute('aria-label'))).toEqual([
  'Play Track epoch','Play Track old-a','Play Track old-z','Play Track unknown-a','Play Track unknown-z',
 ]);
});
it('loads public artist uploads newest first without mounting any player before selection',async()=>{
 api.GetMediaLibrary.mockResolvedValue(response([track('older'),track('newer','mixcloud','2026-02-01T00:00:00Z')]));
 const {container}=setup();
 expect(screen.getByText('Loading artist uploads…')).toBeTruthy();
 const buttons=await screen.findAllByRole('button',{name:/Play Track/});
 expect(buttons.map(button=>button.textContent)).toEqual([expect.stringContaining('Track newer'),expect.stringContaining('Track older')]);
 expect(container.querySelector('iframe')).toBeNull();
 expect(api.GetMediaLibrary).toHaveBeenCalledWith(0);
});

it('uses labeled SVG icon controls in the compact audio dock',async()=>{
 api.GetMediaLibrary.mockResolvedValue(response([track('sc')])); setup();
 fireEvent.click(await screen.findByRole('button',{name:'Play Track sc'}));
 for(const name of ['Previous track','Next track','Reload player','Close audio player']) {
  const button=screen.getByRole('button',{name});
  expect(button.querySelector('svg')).toBeTruthy();
  expect(button.textContent).toBe('');
  expect(button.getAttribute('title')).toBeTruthy();
 }
 const link=screen.getByRole('link',{name:'Open on SoundCloud'});
 expect(link.querySelector('svg')).toBeTruthy();
 expect(link.getAttribute('title')).toBe('Open on SoundCloud');
});

it('uses decorative library icons without losing names or text actions',async()=>{
 api.GetMediaLibrary.mockResolvedValue(response([track('icon')],{total:2,nextOffset:1})); setup();
 const trackButton=await screen.findByRole('button',{name:'Play Track icon'});
 expect(trackButton.querySelector('[data-testid="PlayArrowIcon"][aria-hidden="true"]')).toBeTruthy();
 const reload=screen.getByRole('button',{name:'Reload library'});
 expect(reload.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 expect(reload.textContent).toBe('');
 expect(reload.title).toBe('Reload library');
 expect(reload.style.minWidth).toBe('44px');
 expect(reload.style.minHeight).toBe('44px');
 expect(screen.getByRole('button',{name:'Load more uploads'}).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
});

it('resets artist scope during route reuse, ignores old pages and selects only the new artist queue',async()=>{
 let resolveOld;
 api.GetMediaLibrary.mockResolvedValueOnce(response([track('one')],{total:2,nextOffset:1}))
  .mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;}))
  .mockResolvedValueOnce(response([track('two'),track('three')]));
 const view=render(<MediaPlayerProvider><MediaLibrary artistId="1" /></MediaPlayerProvider>);
 fireEvent.click(await screen.findByRole('button',{name:'Play Track one'}));
 const frame=screen.getByTitle('SoundCloud player');
 fireEvent.click(screen.getByRole('button',{name:'Load more uploads'}));
 view.rerender(<MediaPlayerProvider><MediaLibrary artistId="2" /></MediaPlayerProvider>);
 expect(screen.queryByRole('button',{name:'Play Track one'})).toBeNull();
 await screen.findByRole('button',{name:'Play Track two'});
 expect(api.GetMediaLibrary.mock.calls).toEqual([[0,'1'],[1,'1'],[0,'2']]);
 await act(async()=>resolveOld(response([track('late')])));
 expect(screen.queryByRole('button',{name:'Play Track late'})).toBeNull();
 expect(screen.getByTitle('SoundCloud player')).toBe(frame);
 fireEvent.click(screen.getByRole('button',{name:'Play Track three'}));
 expect(screen.getByRole('button',{name:'Previous track'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Next track'}));
 expect(new URL(screen.getByTitle('SoundCloud player').src).searchParams.get('url')).toBe(track('two').url);
 expect(screen.getByRole('button',{name:'Next track'}).disabled).toBe(true);
});

it('offers the newest playable scoped upload through its collection intro without another fetch',async()=>{
 const intro=({listenToLatest,canListen})=><button disabled={!canListen} onClick={listenToLatest}>Listen to latest</button>;
 api.GetMediaLibrary.mockResolvedValue(response([
  {...track('blocked','soundcloud','2026-05-01'),providerAccess:'blocked'},
  {...track('disabled','soundcloud','2026-04-01'),playable:false},
  track('older','soundcloud','2026-01-01'),track('latest','mixcloud','2026-03-01'),
 ]));
 render(<MediaPlayerProvider><MediaLibrary artistId="7" renderIntro={intro}/></MediaPlayerProvider>);
 expect(screen.getByRole('button',{name:'Listen to latest'}).disabled).toBe(true);
 await screen.findByRole('button',{name:'Play Track latest'});
 fireEvent.click(screen.getByRole('button',{name:'Listen to latest'}));
 expect(new URL(screen.getByTitle('Mixcloud player').src).searchParams.get('feed')).toBe(track('latest','mixcloud').url);
 expect(api.GetMediaLibrary.mock.calls).toEqual([[0,'7']]);
});

it.each([
 response([]), response([{...track('blocked'),providerAccess:'blocked'},{...track('disabled'),playable:false}]), {ok:false}
])('keeps the latest action disabled without an available playable upload (%j)',async result=>{
 api.GetMediaLibrary.mockResolvedValue(result);
 render(<MediaPlayerProvider><MediaLibrary artistId="1" renderIntro={({canListen,listenToLatest})=><button disabled={!canListen} onClick={listenToLatest}>Listen to latest</button>}/></MediaPlayerProvider>);
 await act(async()=>{});
 expect(screen.getByRole('button',{name:'Listen to latest'}).disabled).toBe(true);
 expect(document.querySelector('iframe')).toBeNull();
});

it('shows supplied SoundCloud and Mixcloud artwork inside the existing selection buttons',async()=>{
 const items=[{...track('sc'),artworkUrl:'https://i1.sndcdn.com/synthetic-sc.jpg'}, {...track('mc','mixcloud'),artworkUrl:'https://thumbnailer.mixcloud.com/synthetic-mc.jpg'}];
 api.GetMediaLibrary.mockResolvedValue(response(items)); setup();
 for(const item of items) {
  const button=await screen.findByRole('button',{name:`Play ${item.title}`});
  const image=button.querySelector('img');
  expect(image).not.toBeNull();
  expect(image.getAttribute('src')).toBe(item.artworkUrl);
  expect(image.alt).toBe('');
  expect(image.width).toBe(48); expect(image.height).toBe(48);
  fireEvent.click(image);
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByTitle(`${item.platform} player`)).toBeTruthy();
 }
 expect(document.querySelectorAll('iframe')).toHaveLength(1);
});

it.each([
 ['soundcloud','http://i1.sndcdn.com/cover.jpg'],
 ['soundcloud','https://sndcdn.com.evil.test/cover.jpg'],
 ['soundcloud','https://user:pass@i1.sndcdn.com/cover.jpg'],
 ['soundcloud','https://i1.sndcdn.com:444/cover.jpg'],
 ['soundcloud','https://thumbnailer.mixcloud.com/cover.jpg'],
 ['mixcloud','https://i1.sndcdn.com/cover.jpg'],
 ['mixcloud','javascript:alert(1)'], ['mixcloud','data:image/svg+xml,unsafe'],
 ['mixcloud','/uploads/private.jpg'], ['mixcloud',null], ['mixcloud',{}],
])('keeps %s unsafe/missing artwork inert without dropping the row (%j)',async(provider,artworkUrl)=>{
 api.GetMediaLibrary.mockResolvedValue(response([{...track('safe',provider),artworkUrl}])); setup();
 const button=await screen.findByRole('button',{name:'Play Track safe'});
 expect(button.querySelector('img')).toBeNull();
 fireEvent.click(button); expect(screen.getByTitle(provider==='soundcloud'?'SoundCloud player':'Mixcloud player')).toBeTruthy();
});

it('removes broken artwork without retrying on reload, but attempts a changed source',async()=>{
 const original={...track('sc'),artworkUrl:'https://i1.sndcdn.com/broken.jpg'};
 api.GetMediaLibrary.mockResolvedValue(response([original])); setup();
 const button=await screen.findByRole('button',{name:'Play Track sc'});
 const image=button.querySelector('img'); const slot=image.parentElement;
 fireEvent.error(image);
 expect(button.querySelector('img')).toBeNull(); expect(slot.isConnected).toBe(true);
 fireEvent.click(button); const frame=screen.getByTitle('SoundCloud player');
 fireEvent.click(screen.getByRole('button',{name:'Reload library'})); await act(async()=>{});
 expect(button.querySelector('img')).toBeNull(); expect(screen.getByTitle('SoundCloud player')).toBe(frame);
 api.GetMediaLibrary.mockResolvedValue(response([{...original,artworkUrl:'https://i1.sndcdn.com/replacement.jpg'}]));
 fireEvent.click(screen.getByRole('button',{name:'Reload library'})); await act(async()=>{});
 expect(button.querySelector('img').getAttribute('src')).toBe('https://i1.sndcdn.com/replacement.jpg');
 expect(button.querySelector('img').parentElement).toBe(slot);
 expect(screen.getByTitle('SoundCloud player')).toBe(frame);
});

it.each([undefined, '1'])('places the single play control before artwork and title in library scope %s',async artistId=>{
 api.GetMediaLibrary.mockResolvedValue(response([track('order')]));
 render(<MediaPlayerProvider><MediaLibrary artistId={artistId} /></MediaPlayerProvider>);
 const button=await screen.findByRole('button',{name:'Play Track order'});
 const icon=button.querySelector('[data-testid="PlayArrowIcon"]');
 expect(button.children[0]).toBe(icon.parentElement);
 expect(button.children[1].getAttribute('aria-hidden')).toBe('true');
 expect(button.children[2].querySelector('strong').textContent).toBe('Track order');
 expect(button.closest('li').querySelectorAll('button')).toHaveLength(1);
 fireEvent.click(icon);
 expect(button.getAttribute('aria-pressed')).toBe('true');
 expect(screen.getByTitle('SoundCloud player')).toBeTruthy();
});
