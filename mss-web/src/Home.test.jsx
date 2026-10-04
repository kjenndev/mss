// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,cleanup,fireEvent,act,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import { MediaPlayerProvider } from './components/Media/MediaPlayerProvider';
import Home from './components/Home.Component';
import MediaLibrary from './components/Media/MediaLibrary';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Stream/Syndicate.Player.Component',()=>({default:({isPaused})=><div>{isPaused?'Paused':'Playing'}</div>}));
beforeEach(()=>{cleanup();vi.resetAllMocks();});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('places library below video before events and releases video playback while audio is selected',async()=>{
 mockHome();
 api.GetMediaLibrary.mockResolvedValue({ok:true,json:async()=>({items:[{id:'a',provider:'mixcloud',title:'Library show',artistName:'DJ',url:'https://www.mixcloud.com/dj/show/'}],total:1,nextOffset:null,sources:[],complete:true,cache:{}})});
 render(<MemoryRouter><MediaPlayerProvider><Home/></MediaPlayerProvider></MemoryRouter>);
 const video=screen.getByTitle('Featured Syndicate video');
 const library=screen.getByRole('region',{name:'Artist library'});
 expect(video.compareDocumentPosition(library) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 const events=screen.getByRole('region',{name:'Coming up'});
 const gallery=screen.getByRole('region',{name:'In the frame'});
 expect(library.parentElement).toBe(events.parentElement.parentElement);
 expect(library.compareDocumentPosition(events) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(events.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.queryByRole('region',{name:'Latest content'})).toBeNull();
 expect(api.GetGlobalFeed).not.toHaveBeenCalled();
 fireEvent.click(await screen.findByRole('button',{name:'Play Library show'}));
 expect(video.isConnected).toBe(false);
 expect(screen.getByRole('region',{name:'Syndicate screen'})).toBeTruthy();
 expect(screen.getByRole('heading',{name:'DK Bean'})).toBeTruthy();
 expect(screen.getByText('Video disabled')).toBeTruthy();
 expect(screen.getByTestId('PauseIcon').getAttribute('aria-hidden')).toBe('true');
 expect(screen.getByRole('button',{name:'Return to video'}).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 expect(screen.getByRole('link',{name:/Watch on YouTube/}).closest('[inert]')).toBeTruthy();
 expect(screen.getByTitle('Mixcloud player')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Return to video'}));
 expect(screen.queryByTitle('Mixcloud player')).toBeNull();
 expect(screen.getByTitle('Featured Syndicate video')).toBeTruthy();
});
const videoTitle = 'Featured Syndicate video';
function mockHome({streams = [], settings = {}} = {}) {
 api.GetActiveSyndicateStreams.mockResolvedValue({ok:true,json:async()=>({streams})});
 api.GetSettings.mockResolvedValue({ok:true,json:async()=>({settings})});
 for(const method of ['GetGlobalFeed','GetAllEvents','GetAllImages']) api[method].mockResolvedValue({ok:true,json:async()=>({})});
}
it('shows a responsive click-to-play YouTube fallback when no streams are live',async()=>{
 mockHome();
 render(<MemoryRouter><Home/></MemoryRouter>);
 const iframe = await screen.findByTitle(videoTitle);
 expect(iframe.tagName).toBe('IFRAME');
 expect(iframe.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/z6aXbSXNiHE');
 expect(iframe.getAttribute('allow') || '').not.toContain('autoplay');
 expect(iframe.hasAttribute('allowfullscreen')).toBe(true);
 expect(screen.getByRole('region',{name:'Syndicate screen'}).contains(iframe)).toBe(true);
 expect(screen.queryByText('LIVE')).toBeNull();
 expect(screen.queryByRole('button',{name:'Next'})).toBeNull();
});
it('keeps the selected channel paused across fresh polling arrays',async()=>{
 vi.useFakeTimers();vi.spyOn(window,'open').mockImplementation(()=>null);
 api.GetActiveSyndicateStreams.mockImplementation(async()=>({ok:true,json:async()=>({streams:[{artistId:1,artistName:'Artist',channelName:'abc'}]})}));
 api.GetSettings.mockResolvedValue({ok:true,json:async()=>({settings:{streaming_platform_url:'https://sp.test'}})});
 for(const method of ['GetGlobalFeed','GetAllEvents','GetAllImages']) api[method].mockResolvedValue({ok:true,json:async()=>({})});
 render(<MemoryRouter><Home/></MemoryRouter>);await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 fireEvent.click(screen.getByRole('button',{name:/Join Chat|Open platform player/}));expect(screen.getByText('Paused')).toBeTruthy();
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(screen.getByText('Paused')).toBeTruthy();vi.useRealTimers();
});

it('shows unavailable discovery and load failures instead of false empty content',async()=>{
 for(const method of ['GetActiveSyndicateStreams','GetSettings','GetGlobalFeed','GetAllEvents','GetAllImages']) api[method].mockResolvedValue({ok:false});
 render(<MemoryRouter><Home/></MemoryRouter>);
 expect(await screen.findByText(/Live status unavailable\. Retrying automatically\./)).toBeTruthy();
 expect((await screen.findByRole('button',{name:'Retry content'})).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 expect(screen.queryByText(/No photos have been uploaded/)).toBeNull();
});

it.each([
 [{}, 'Midnight Sound Syndicate', 'Discover and stay connected'],
 [{site_title:'Custom site title', site_description:'Custom description'}, 'Custom site title', 'Custom description'],
])('removes the entire homepage branding panel (%j)',async(settings, title, description)=>{
 mockHome({settings});
 const {container} = render(<MemoryRouter><Home/></MemoryRouter>);
 await act(async()=>{});
 expect(screen.queryByText(title)).toBeNull();
 expect(screen.queryByText(description)).toBeNull();
 expect(container.querySelector('[class*="_sectionPaper_"]')).toBeNull();
});

it('switches from fallback to live and back as polling updates',async()=>{
 vi.useFakeTimers();
 mockHome();
 render(<MemoryRouter><Home/></MemoryRouter>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(screen.getByTitle(videoTitle)).toBeTruthy();
 api.GetActiveSyndicateStreams.mockResolvedValue({ok:true,json:async()=>({streams:[{artistId:1,artistName:'Artist',channelName:'abc'}]})});
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
 expect(screen.queryByTitle(videoTitle)).toBeNull();
 expect(screen.getByText('Artist')).toBeTruthy();
 expect(screen.getByText('Playing')).toBeTruthy();
 expect(screen.getByText('Syndicate Live · On air')).toBeTruthy();
 api.GetActiveSyndicateStreams.mockResolvedValue({ok:true,json:async()=>({streams:[]})});
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
 expect(screen.getByTitle(videoTitle)).toBeTruthy();
 expect(screen.queryByText('Playing')).toBeNull();
 expect(screen.queryByText('LIVE')).toBeNull();
 expect(api.GetActiveSyndicateStreams).toHaveBeenCalledTimes(3);
});

it.each([{streams:[]}, {streams:[{artistId:1,artistName:'Artist',channelName:'abc'}]}])('hides both players when the streams section is explicitly disabled (%j)',async({streams})=>{
 mockHome({streams, settings:{show_live_section:'0'}});
 render(<MemoryRouter><Home/></MemoryRouter>);
 await act(async()=>{});
 expect(screen.queryByTitle(videoTitle)).toBeNull();
 expect(screen.queryByText('Playing')).toBeNull();
 expect(screen.queryByText('LIVE')).toBeNull();
 expect(screen.queryByRole('button',{name:'Next'})).toBeNull();
});

it('retains an honest unavailable alert alongside the fallback and recovers on polling',async()=>{
 vi.useFakeTimers();
 mockHome();
 api.GetActiveSyndicateStreams.mockResolvedValue({ok:false});
 render(<MemoryRouter><Home/></MemoryRouter>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(screen.getByText(/Live status unavailable\. Retrying automatically\./)).toBeTruthy();
 expect(screen.getByTitle(videoTitle)).toBeTruthy();
 api.GetActiveSyndicateStreams.mockResolvedValue({ok:true,json:async()=>({streams:[]})});
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
 expect(screen.queryByText(/Live status unavailable\. Retrying automatically\./)).toBeNull();
 expect(screen.getByTitle(videoTitle)).toBeTruthy();
});

it('presents Cinema replay metadata and honest empty discovery sections',async()=>{
 mockHome(); render(<MemoryRouter><Home/></MemoryRouter>);
 expect(await screen.findByRole('heading',{name:'DK Bean'})).toBeTruthy();
 expect(screen.getByText('Groovematics · July 4, 2021')).toBeTruthy();
 expect(screen.getByRole('link',{name:/Watch on YouTube/}).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 expect(screen.getByRole('link',{name:/Watch on YouTube/}).getAttribute('href')).toBe('https://www.youtube.com/watch?v=z6aXbSXNiHE');
 for (const name of ['Artist library','Coming up','In the frame']) expect(screen.getByRole('region',{name})).toBeTruthy();
 expect(await screen.findByText('No upcoming events announced.')).toBeTruthy();
 expect(screen.queryByText('Latest content')).toBeNull();
 expect(screen.getByText('No photos have been uploaded to the Syndicate yet.')).toBeTruthy();
 expect(screen.getByRole('link',{name:'All events'}).getAttribute('href')).toBe('/events');
});

it('always shows every gallery photo in order without a collapse control and preserves the lightbox',async()=>{
 mockHome(); api.GetAllImages.mockResolvedValue({ok:true,json:async()=>({images:Array.from({length:5},(_,i)=>({id:i,url:`/uploads/test-${i}.jpg`}))})});
 render(<MemoryRouter><Home/></MemoryRouter>); await act(async()=>{});
 expect(screen.getAllByRole('button',{name:/Open photo/})).toHaveLength(5);
 expect(screen.queryByRole('button',{name:/Show fewer photos|View all photos/})).toBeNull();
 expect(screen.getAllByRole('button',{name:/Open photo/}).map(button=>button.querySelector('img').getAttribute('src'))).toEqual(Array.from({length:5},(_,i)=>`/uploads/test-${i}.jpg`));
 fireEvent.click(screen.getByRole('button',{name:'Open photo 5'}));
 expect(screen.getByRole('dialog',{name:'Gallery photo'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Close photo'}));
 await act(async()=>{});
});

it('distinguishes pending discovery from empty content and retries failed content',async()=>{
 mockHome(); let resolve; api.GetAllEvents.mockReturnValue(new Promise(r=>{resolve=r;}));
 api.GetActiveSyndicateStreams.mockReturnValue(new Promise(()=>{}));
 render(<MemoryRouter><Home/></MemoryRouter>);
 expect(screen.queryByText('Checking live status…')).toBeNull();
 expect(screen.getByText('Loading events…')).toBeTruthy();
 expect(screen.getByText('Loading photos…')).toBeTruthy();
 expect(screen.queryByText('No upcoming events announced.')).toBeNull();
 await act(async()=>resolve({ok:false}));
 expect(screen.getByText('Events unavailable.')).toBeTruthy();
 expect(screen.getByText('Gallery unavailable.')).toBeTruthy();
 api.GetAllEvents.mockResolvedValue({ok:true,json:async()=>({events:[]})});
 fireEvent.click(screen.getByRole('button',{name:'Retry content'}));
 expect(await screen.findByText('No upcoming events announced.')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Retry content'})).toBeNull();
});

it('keeps carousel numbering and controls valid when the stream list shrinks',async()=>{
 vi.useFakeTimers(); mockHome({streams:[1,2,3].map(i=>({artistId:i,artistName:`Artist ${i}`,channelName:`channel${i}`}))});
 render(<MemoryRouter><Home/></MemoryRouter>); await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 fireEvent.click(screen.getByRole('button',{name:'Next'})); fireEvent.click(screen.getByRole('button',{name:'Next'}));
 expect(screen.getByRole('heading',{name:'Artist 3'})).toBeTruthy();
 api.GetActiveSyndicateStreams.mockResolvedValue({ok:true,json:async()=>({streams:[{artistId:1,artistName:'Artist 1',channelName:'channel1'}]})});
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
 expect(screen.getByText('Stream 1 of 1')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Next'}).disabled).toBe(true);
 expect(screen.getByRole('heading',{name:'Artist 1'})).toBeTruthy();
 expect(screen.queryByText('Groovematics · July 4, 2021')).toBeNull();
});

it('omits the title and no-live banner above the player',async()=>{
 mockHome(); render(<MemoryRouter><Home/></MemoryRouter>);
 await act(async()=>{});
 expect(screen.queryByText('Syndicate screen')).toBeNull();
 expect(screen.queryByText('No live streams · Enjoy a replay')).toBeNull();
 expect(screen.getByTitle(videoTitle)).toBeTruthy();
});

it('keeps live video details visible but inert during library selection',async()=>{
 mockHome({streams:[{artistId:1,artistName:'Live DJ',channelName:'live'}],settings:{streaming_platform_url:'https://platform.test'}});
 api.GetMediaLibrary.mockResolvedValue({ok:true,json:async()=>({items:[{id:'a',provider:'mixcloud',title:'Library show',url:'https://www.mixcloud.com/dj/show/'}],total:1,nextOffset:null,sources:[],complete:true,cache:{}})});
 render(<MemoryRouter><MediaPlayerProvider><Home/></MediaPlayerProvider></MemoryRouter>);
 await screen.findByText('Playing');
 fireEvent.click(await screen.findByRole('button',{name:'Play Library show'}));
 expect(screen.queryByText('Playing')).toBeNull();
 expect(screen.getByRole('heading',{name:'Live DJ'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Open platform player'}).closest('[inert]')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Open platform player'}).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 expect(screen.getByText('Video disabled')).toBeTruthy();
 expect(screen.getByTestId('PauseIcon').getAttribute('aria-hidden')).toBe('true');
 expect(screen.getByRole('button',{name:'Return to video'}).querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Return to video'}));
 expect(screen.getByText('Playing')).toBeTruthy();
 expect(screen.queryByTitle('Mixcloud player')).toBeNull();
});

it('uses labeled icon-only carousel and lightbox controls with touch targets',async()=>{
 mockHome({streams:[1,2].map(id=>({artistId:id,artistName:`Artist ${id}`,channelName:`channel${id}`}))});
 api.GetAllImages.mockResolvedValue({ok:true,json:async()=>({images:[{id:1,url:'/uploads/fixture.jpg'}]})});
 render(<MemoryRouter><Home/></MemoryRouter>);
 await screen.findByRole('heading',{name:'Artist 1'});
 for(const name of ['Prev','Next']) assertIconOnly(screen.getByRole('button',{name}),name);
 fireEvent.click(await screen.findByRole('button',{name:'Open photo 1'}));
 assertIconOnly(screen.getByRole('button',{name:'Close photo'}),'Close photo');
});
function assertIconOnly(button,name) {
 expect(button.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 expect(button.textContent).toBe('');
 expect(button.getAttribute('aria-label')).toBe(name);
 expect(button.getAttribute('title')).toBe(name);
 expect(parseFloat(getComputedStyle(button).minWidth)).toBeGreaterThanOrEqual(44);
 expect(parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(44);
}

it.each([['Coming up','2099-01-01T12:00:00Z'],['Previous','2001-01-01T12:00:00Z']])('uses a decorative flyer background in %s and falls back on error',async(section,date)=>{
 mockHome();
 api.GetAllEvents.mockResolvedValue({ok:true,json:async()=>({events:[{id:41,title:'Flyer event',date,flyer:'/uploads/flyer.png',location:'Venue'}]})});
 render(<MemoryRouter><Home/></MemoryRouter>);
 const link=await within(screen.getByRole('region',{name:section})).findByRole('link',{name:/Flyer event/});
 const image=link.querySelector('img');
 expect(image.getAttribute('alt')).toBe('');
 expect(image.getAttribute('aria-hidden')).toBe('true');
 expect(image.className).toContain('eventBackdrop');
 expect(image.getAttribute('src')).toBe('/uploads/flyer.png');
 expect(image.closest('a').getAttribute('href')).toBe('/events/41');
 expect(image.getAttribute('loading')).toBe('lazy');
 expect(link.querySelector('time').getAttribute('dateTime')).toBe(date);
 expect(link.textContent).toContain('Venue');
 expect(image.parentElement).toBe(image.closest('a'));
 fireEvent.error(image);
 expect(link.querySelector('img')).toBeNull();
 expect(link.getAttribute('href')).toBe('/events/41');
 expect(screen.getByText('Flyer event')).toBeTruthy();
});
it.each([null,'javascript:alert(1)',{},'//unsafe.test/flyer.png'])('keeps event details without unsafe or missing flyers (%j)',async flyer=>{
 mockHome();api.GetAllEvents.mockResolvedValue({ok:true,json:async()=>({events:[{id:42,title:'No flyer event',date:'2099-01-01T12:00:00Z',flyer}]})});
 render(<MemoryRouter><Home/></MemoryRouter>);
 expect(await screen.findByText('No flyer event')).toBeTruthy();
 expect(screen.getByText('No flyer event').closest('a').querySelector('img')).toBeNull();
});

it('shows only the latest ten past events below Coming up using actual instants and preserves event links',async()=>{
 mockHome();
 const now=Date.parse('2026-10-03T12:00:00Z'); vi.spyOn(Date,'now').mockReturnValue(now);
 const past=Array.from({length:12},(_,i)=>({id:i+1,title:`Past ${i+1}`,date:new Date(now-(i+1)*86400000).toISOString(),location:'Venue',flyer:'/uploads/past.png'}));
 const boundary=[{id:90,title:'Exact now',date:new Date(now).toISOString()},{id:91,title:'Offset past',date:'2026-10-03T12:59:59+01:00'},{id:92,title:'Offset future',date:'2026-10-03T08:00:01-04:00'}];
 api.GetAllEvents.mockResolvedValue({ok:true,json:async()=>({events:[...past.reverse(),...boundary,...[null,'','invalid'].map((date,i)=>({id:100+i,title:`Unknown ${i}`,date})),{id:200,title:'Future',date:'2099-01-01T00:00:00Z'}]})});
 render(<MemoryRouter><Home/></MemoryRouter>); await act(async()=>{});
 const previous=screen.getByRole('region',{name:'Previous'}), upcoming=screen.getByRole('region',{name:'Coming up'});
 expect(upcoming.compareDocumentPosition(previous)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(previous.parentElement).toBe(upcoming.parentElement);
 const links=within(previous).getAllByRole('link');
 expect(links).toHaveLength(10);
 expect(links.map(link=>link.getAttribute('href'))).toEqual(['/events/91',...Array.from({length:9},(_,i)=>`/events/${i+1}`)]);
 expect(within(upcoming).getAllByRole('link').map(link=>link.getAttribute('href'))).toEqual(['/events','/events/92','/events/200']);
 const flyer=links[1].querySelector('img');
 expect(flyer.closest('a').getAttribute('href')).toBe('/events/1');
 expect(flyer.closest('a').querySelector('time')).toBeTruthy();
 expect(flyer.closest('a').textContent).toContain('Venue');
 fireEvent.error(flyer); expect(within(previous).getByText('Past 1')).toBeTruthy();
 expect(screen.queryByText('Exact now')).toBeNull();
});

it('opts the homepage library into stretched desktop layout without changing its shared default',async()=>{
 mockHome(); render(<MemoryRouter><Home/></MemoryRouter>); await act(async()=>{});
 expect(screen.getByRole('region',{name:'Artist library'}).className).toContain('fillHeight');
 cleanup(); render(<MemoryRouter><MediaLibrary /></MemoryRouter>); await act(async()=>{});
 expect(screen.getByRole('region',{name:'Artist library'}).className).not.toContain('fillHeight');
});
it('distinguishes previous-event loading, failure, retry and genuinely empty results',async()=>{
 mockHome(); let resolve; api.GetAllEvents.mockReturnValue(new Promise(r=>{resolve=r;}));
 render(<MemoryRouter><Home/></MemoryRouter>);
 expect(screen.getByText('Loading previous events…')).toBeTruthy();
 expect(screen.queryByText('No previous events.')).toBeNull();
 await act(async()=>resolve({ok:false}));
 expect(screen.getByText('Previous events unavailable.')).toBeTruthy();
 expect(screen.queryByText('No previous events.')).toBeNull();
 api.GetAllEvents.mockResolvedValue({ok:true,json:async()=>({events:[]})});
 fireEvent.click(screen.getByRole('button',{name:'Retry content'}));
 expect(await screen.findByText('No previous events.')).toBeTruthy();
});

it.each(['1969-12-31T12:00:00Z','2026-10-03T12:00:00Z'])('keeps the three earliest future events and strict millisecond boundaries at %s',async instant=>{
 mockHome(); const now=Date.parse(instant); vi.spyOn(Date,'now').mockReturnValue(now);
 const events=[5,2,4,1,3,0,-1].map(offset=>({id:10+offset,title:`Boundary ${offset}`,date:new Date(now+offset).toISOString()}));
 events.push(...[null,'',undefined,'not-a-date',0,{}].map((date,i)=>({id:100+i,title:`Unknown ${i}`,date})));
 api.GetAllEvents.mockResolvedValue({ok:true,json:async()=>({events})});
 render(<MemoryRouter><Home/></MemoryRouter>); await act(async()=>{});
 const upcoming=screen.getByRole('region',{name:'Coming up'}),previous=screen.getByRole('region',{name:'Previous'});
 expect(within(upcoming).getAllByRole('link').map(link=>link.getAttribute('href'))).toEqual(['/events','/events/11','/events/12','/events/13']);
 expect(within(previous).getAllByRole('link').map(link=>link.getAttribute('href'))).toEqual(['/events/9']);
 expect(screen.queryByText('Boundary 0')).toBeNull();
});
