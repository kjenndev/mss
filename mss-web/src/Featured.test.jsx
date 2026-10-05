// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,cleanup,fireEvent,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Home from './components/Home.Component';
import {MediaPlayerProvider} from './components/Media/MediaPlayerProvider';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Stream/Syndicate.Player.Component',()=>({default:({channelName})=><iframe title={'Live '+channelName}/> }));
const videos=['abcdefghijk','lmnopqrstuv','12345678901'].map((id,i)=>({id:'youtube:'+id,videoId:id,provider:'youtube',title:'Featured '+(i+1),url:'https://www.youtube.com/watch?v='+id,createdAt:'2020-01-02T00:00:00.000Z',durationSeconds:123,artworkUrl:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'}));
const response=data=>({ok:true,json:async()=>data});
beforeEach(()=>{
 vi.resetAllMocks();
 api.GetSettings.mockResolvedValue(response({settings:{}}));
 api.GetAllEvents.mockResolvedValue(response({events:[]}));api.GetAllImages.mockResolvedValue(response({images:[]}));
 api.GetMediaLibrary.mockResolvedValue(response({items:[],sources:[],cache:{},total:0}));
 api.GetActiveSyndicateStreams.mockResolvedValue(response({streams:[]}));
 api.GetHomeFeaturedVideos.mockResolvedValue(response({videos,canAdd:true}));
});
afterEach(()=>{cleanup();vi.useRealTimers();});
const mount=()=>render(<MemoryRouter><MediaPlayerProvider><Home/></MediaPlayerProvider></MemoryRouter>);
it('does not mount a fallback player before initial live discovery resolves',async()=>{
 let resolve;api.GetActiveSyndicateStreams.mockReturnValue(new Promise(r=>resolve=r));mount();await act(async()=>{});
 expect(document.querySelector('iframe')).toBeNull();expect(screen.getByText('Checking live status…')).toBeTruthy();
 await act(async()=>resolve(response({streams:[{artistId:1,artistName:'Artist 1',channelName:'channel1'}]})));
 expect(screen.getByTitle('Live channel1')).toBeTruthy();expect(screen.queryByTitle('Featured: Featured 1')).toBeNull();
});
it('late featured metadata does not replace a live source or its selected iframe',async()=>{
 let resolve;api.GetHomeFeaturedVideos.mockReturnValue(new Promise(r=>resolve=r));api.GetActiveSyndicateStreams.mockResolvedValue(response({streams:[{artistId:1,artistName:'Artist 1',channelName:'channel1'}]}));mount();
 const frame=await screen.findByTitle('Live channel1');await act(async()=>resolve(response({videos,canAdd:true})));
 expect(screen.getByTitle('Live channel1')).toBe(frame);expect(document.querySelectorAll('iframe')).toHaveLength(1);expect(screen.queryByTitle('Featured: Featured 1')).toBeNull();
});
it('one video hides all navigation and empty or failed data never installs a hardcoded replay',async()=>{
 api.GetHomeFeaturedVideos.mockResolvedValueOnce(response({videos:[videos[0]],canAdd:true}));const first=mount();await screen.findByTitle('Featured: Featured 1');expect(screen.queryByRole('button',{name:'Next'})).toBeNull();expect(screen.queryByRole('button',{name:'Select Featured 1'})).toBeNull();first.unmount();
 api.GetHomeFeaturedVideos.mockResolvedValueOnce(response({videos:[],canAdd:false}));const second=mount();await screen.findByText('No featured videos selected yet.');expect(document.querySelector('iframe')).toBeNull();second.unmount();
 api.GetHomeFeaturedVideos.mockResolvedValueOnce({ok:false});mount();await screen.findByRole('button',{name:'Retry featured videos'});expect(document.querySelector('iframe')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Retry featured videos'}));expect(await screen.findByTitle('Featured: Featured 1')).toBeTruthy();
});
it('explicit library video and audio choices survive live arrival and offline polls until return',async()=>{
 vi.useFakeTimers();window.scrollTo=vi.fn();
 const audio={id:'mixcloud:one',provider:'mixcloud',title:'Library audio',url:'https://www.mixcloud.com/fixture/show/',createdAt:'2021-01-01T00:00:00Z'};
 api.GetMediaLibrary.mockResolvedValue(response({items:[{...videos[0],title:'Library video'},audio],sources:[],total:2,nextOffset:null,complete:true,cache:{}}));mount();await act(async()=>vi.advanceTimersByTimeAsync(1));
 fireEvent.click(screen.getByRole('button',{name:'Play Library video'}));const frame=screen.getByTitle('YouTube: Library video');
 api.GetActiveSyndicateStreams.mockResolvedValue(response({streams:[{artistId:2,artistName:'Artist 2',channelName:'channel2'}]}));await act(async()=>vi.advanceTimersByTimeAsync(10000));
 expect(screen.getByTitle('YouTube: Library video')).toBe(frame);expect(document.querySelectorAll('iframe')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Return to live'}));expect(frame.isConnected).toBe(false);expect(screen.getByTitle('Live channel2')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Play Library audio'}));const dock=screen.getByTitle('Mixcloud player');expect(screen.queryByTitle('Live channel2')).toBeNull();
 api.GetActiveSyndicateStreams.mockResolvedValue(response({streams:[]}));await act(async()=>vi.advanceTimersByTimeAsync(10000));expect(screen.getByTitle('Mixcloud player')).toBe(dock);expect(document.querySelectorAll('iframe')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Return to video'}));expect(dock.isConnected).toBe(false);expect(screen.getByTitle('Featured: Featured 1')).toBeTruthy();
});
it('renders curated order, no page-load autoplay, and switches one keyed player',async()=>{
 mount();
 const frame=await screen.findByTitle('Featured: Featured 1');
 expect(frame.getAttribute('src')).toContain('autoplay=0');
 expect(screen.getByText('1 / 3')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Select Featured 3'}));
 expect(frame.isConnected).toBe(false);expect(screen.getByTitle('Featured: Featured 3')).toBeTruthy();
 expect(screen.getByText('3 / 3')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(screen.getByTitle('Featured: Featured 1')).toBeTruthy();
});
it('live priority keeps channel identity through reorder, shrink and last offline',async()=>{
 vi.useFakeTimers();const streams=[1,2,3].map(i=>({artistId:i,artistName:'Artist '+i,channelName:'channel'+i}));
 api.GetActiveSyndicateStreams.mockResolvedValue(response({streams}));mount();await act(async()=>vi.advanceTimersByTimeAsync(1));
 fireEvent.click(screen.getByRole('button',{name:'Select Artist 2'}));const frame=screen.getByTitle('Live channel2');
 api.GetActiveSyndicateStreams.mockResolvedValue(response({streams:[streams[2],streams[1],streams[0]]}));await act(async()=>vi.advanceTimersByTimeAsync(10000));
 expect(screen.getByTitle('Live channel2')).toBe(frame);
 api.GetActiveSyndicateStreams.mockResolvedValue(response({streams:[streams[0]]}));await act(async()=>vi.advanceTimersByTimeAsync(10000));
 expect(frame.isConnected).toBe(false);expect(screen.getByTitle('Live channel1')).toBeTruthy();expect(screen.queryByRole('button',{name:'Next'})).toBeNull();
 api.GetActiveSyndicateStreams.mockResolvedValue(response({streams:[]}));await act(async()=>vi.advanceTimersByTimeAsync(10000));
 expect(screen.getByTitle('Featured: Featured 1')).toBeTruthy();expect(screen.queryByTitle('Live channel1')).toBeNull();
});
