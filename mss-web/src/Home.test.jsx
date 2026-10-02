// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,cleanup,fireEvent,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Home from './components/Home.Component';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Stream/Syndicate.Player.Component',()=>({default:({isPaused})=><div>{isPaused?'Paused':'Playing'}</div>}));
beforeEach(()=>{cleanup();vi.resetAllMocks();});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
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
 expect(iframe.className).toContain('twitchIframe');
 expect(iframe.parentElement.className).toContain('iframeWrapper');
 const section = iframe.closest('.MuiPaper-root');
 expect(section.className).toContain('carouselSectionPaper');
 expect(getComputedStyle(section).minHeight).toBe('0px');
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
 expect(await screen.findByText(/Live status unavailable/)).toBeTruthy();
 expect(await screen.findByRole('button',{name:'Retry content'})).toBeTruthy();
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
 expect(screen.getByText('LIVE')).toBeTruthy();
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
 expect(screen.getByText(/Live status unavailable/)).toBeTruthy();
 expect(screen.getByTitle(videoTitle)).toBeTruthy();
 api.GetActiveSyndicateStreams.mockResolvedValue({ok:true,json:async()=>({streams:[]})});
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
 expect(screen.queryByText(/Live status unavailable/)).toBeNull();
 expect(screen.getByTitle(videoTitle)).toBeTruthy();
});
