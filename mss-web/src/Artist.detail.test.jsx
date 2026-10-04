// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,cleanup,fireEvent,act} from '@testing-library/react';
import {MemoryRouter,Routes,Route,Link} from 'react-router-dom';
import {MediaPlayerProvider} from './components/Media/MediaPlayerProvider';
import {useMediaPlayer} from './components/Media/MediaPlayerContext';
import Detail from './components/Artist/Artist.Component.Detail';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Comments/CommentSection',()=>({default:()=>null}));
vi.mock('./components/Stream/Syndicate.Player.Component',()=>({default:()=> <div>Live player</div>}));
function SelectAudio() { const player=useMediaPlayer(); const item={id:'test',provider:'mixcloud',title:'Queue show',url:'https://www.mixcloud.com/test/show/'}; return <button onClick={()=>player.select(item,[item])}>Select library audio</button>; }
it('uses the scoped library instead of profile embeds and gates live/video during audio',async()=>{
 api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:{id:1,name:'Artist',channel_name:'channel',soundcloud:'https://soundcloud.com/test',mixcloud:'https://www.mixcloud.com/test/',youtube:'https://www.youtube.com/embed/test'}})});
 api.GetActiveSyndicateStreams.mockResolvedValue({ok:true,json:async()=>({streams:[{artistId:1,channelName:'channel'}]})});
 const {container}=render(<MemoryRouter initialEntries={['/artists/1']}><MediaPlayerProvider><SelectAudio/><Routes><Route path="/artists/:id" element={<Detail/>}/></Routes></MediaPlayerProvider></MemoryRouter>);
 await screen.findByText('Live player');
 expect(screen.getByRole('region',{name:'Artist library'})).toBeTruthy();
 expect(api.GetMediaLibrary).toHaveBeenCalledWith(0,'1');
 expect(container.querySelectorAll('iframe')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Select library audio'}));
 expect(screen.queryByText('Live player')).toBeNull();
 expect(container.querySelectorAll('iframe')).toHaveLength(1);
 expect(screen.getByTitle('Mixcloud player')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Switch to artist video'}));
 expect(screen.queryByTitle('Mixcloud player')).toBeNull();
 expect(screen.getByText('Live player')).toBeTruthy();
 expect(container.querySelectorAll('iframe')).toHaveLength(0);
 cleanup();
});
function view(){return render(<MemoryRouter initialEntries={['/artists/1']}><Routes><Route path="/artists/:id" element={<Detail/>}/></Routes></MemoryRouter>);}
beforeEach(()=>{cleanup();vi.resetAllMocks();api.GetMediaLibrary.mockResolvedValue({ok:true,json:async()=>({items:[],sources:[],total:0,nextOffset:null,complete:true})});vi.useRealTimers();api.GetArtistImages.mockResolvedValue({ok:true,json:async()=>({images:[]})});api.GetSettings.mockResolvedValue({ok:true,json:async()=>({settings:{streaming_platform_url:'https://sp.test'}})});api.GetActiveSyndicateStreams.mockResolvedValue({ok:true,json:async()=>({streams:[]})});});
it('offers a retry after artist load failure',async()=>{
 api.GetArtistById.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ok:true,json:async()=>({artist:{id:1,name:'Artist'}})});
 view();fireEvent.click(await screen.findByRole('button',{name:'Retry'}));expect(await screen.findByRole('heading',{level:1,name:'Artist'})).toBeTruthy();
});
it('refreshes an offline artist to live without navigation',async()=>{
 vi.useFakeTimers();api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:{id:1,name:'Artist',channel_name:'channel'}})});
 api.GetActiveSyndicateStreams.mockResolvedValueOnce({ok:true,json:async()=>({streams:[]})}).mockResolvedValue({ok:true,json:async()=>({streams:[{artistId:1,channelName:'channel'}]})});
 view();await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(screen.queryByText('Live player')).toBeNull();
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(screen.getByText('Live player')).toBeTruthy();vi.useRealTimers();
});

it('clears the old artist and library immediately on route change and ignores late artist responses',async()=>{
 let old;
 api.GetArtistById.mockImplementation(id=>id==='1'?new Promise(resolve=>{old=resolve;}):Promise.resolve({ok:true,json:async()=>({artist:{id:2,name:'Second artist'}})}));
 render(<MemoryRouter initialEntries={['/artists/1']}><Link to="/artists/2">Second</Link><Routes><Route path="/artists/:id" element={<Detail/>}/></Routes></MemoryRouter>);
 fireEvent.click(screen.getByRole('link',{name:'Second'}));
 await screen.findByRole('heading',{level:1,name:'Second artist'});
 expect(api.GetMediaLibrary).toHaveBeenCalledWith(0,'2');
 await act(async()=>old({ok:true,json:async()=>({artist:{id:1,name:'Obsolete artist'}})}));
 expect(screen.queryByRole('heading',{level:1,name:'Obsolete artist'})).toBeNull();
 expect(screen.getByRole('heading',{level:1,name:'Second artist'})).toBeTruthy();
 cleanup();
});

it('does not retain a loaded artist library while the next artist is pending',async()=>{
 let next;
 api.GetArtistById.mockResolvedValueOnce({ok:true,json:async()=>({artist:{id:1,name:'First artist'}})})
  .mockImplementationOnce(()=>new Promise(resolve=>{next=resolve;}));
 render(<MemoryRouter initialEntries={['/artists/1']}><Link to="/artists/2">Next artist</Link><Routes><Route path="/artists/:id" element={<Detail/>}/></Routes></MemoryRouter>);
 await screen.findByRole('heading',{level:1,name:'First artist'});
 expect(screen.getByRole('region',{name:'Artist library'})).toBeTruthy();
 fireEvent.click(screen.getByRole('link',{name:'Next artist'}));
 expect(screen.queryByRole('heading',{level:1,name:'First artist'})).toBeNull();
 expect(screen.queryByRole('region',{name:'Artist library'})).toBeNull();
 await act(async()=>next({ok:true,json:async()=>({artist:{id:2,name:'Next loaded'}})}));
 expect(api.GetMediaLibrary.mock.calls).toEqual([[0,'1'],[0,'2']]);
 cleanup();
});

it('does not offer a video switch on an audio-only profile',async()=>{
 api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:{id:1,name:'Audio artist',soundcloud:'https://soundcloud.com/test'}})});
 render(<MemoryRouter initialEntries={['/artists/1']}><MediaPlayerProvider><SelectAudio/><Routes><Route path="/artists/:id" element={<Detail/>}/></Routes></MediaPlayerProvider></MemoryRouter>);
 await screen.findByRole('heading',{level:1,name:'Audio artist'});
 expect(screen.getByText('From this artist')).toBeTruthy();
 expect(screen.getByRole('region',{name:'Artist library'}).closest('.MuiGrid-root').className).toContain('MuiGrid-grid-xs-12');
 fireEvent.click(screen.getByRole('button',{name:'Select library audio'}));
 expect(screen.queryByText(/Artist players are paused/)).toBeNull();
 expect(screen.queryByRole('button',{name:/Switch to artist/})).toBeNull();
 expect(screen.getByRole('region',{name:'Artist library'})).toBeTruthy();
 cleanup();
});

it('presents the editorial artist identity and collection before actual video',async()=>{
 api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:{id:1,name:'Real artist',description:'Actual biography',location:'Chicago',profile_picture:'/uploads/portrait.jpg',cover_photo:'/uploads/cover.jpg',youtube:'https://www.youtube.com/embed/test'}})});
 api.CanEditArtist.mockReturnValue(true);
 api.GetArtistImages.mockResolvedValue({ok:true,json:async()=>({images:[{url:'/uploads/portrait.jpg'},{url:'/uploads/gallery.jpg'}]})});
 view();
 const heading=await screen.findByRole('heading',{level:1,name:'Real artist'});
 expect(heading.querySelector('[aria-hidden="true"]').textContent).toBe('.');
 expect(screen.getByText('Actual biography')).toBeTruthy();
 expect(screen.getByText('Chicago')).toBeTruthy();
 expect(screen.getByRole('img',{name:'Real artist'}).getAttribute('src')).toContain('/uploads/portrait.jpg');
 expect(screen.getByRole('img',{name:'Real artist cover'}).getAttribute('src')).toContain('/uploads/cover.jpg');
 expect(screen.getByRole('img',{name:'Real artist cover'}).compareDocumentPosition(heading)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.getByRole('button',{name:'Edit Profile'})).toBeTruthy();
 const intro=screen.getByRole('heading',{name:'A space for the sound.'});
 const library=screen.getByRole('region',{name:'Artist library'});
 expect(intro.compareDocumentPosition(library)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.queryByTitle('YouTube video player')).toBeNull(); // channel is social-only
 expect(screen.getByRole('button',{name:'Listen to latest'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Open gallery photo 1'}));
 expect(screen.getByRole('dialog',{name:'Artist gallery'})).toBeTruthy();
});

it('uses an honest photo fallback when the artist image cannot load',async()=>{
 api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:{id:1,name:'Missing photo',profile_picture:'/uploads/missing.jpg'}})});
 view();
 fireEvent.error(await screen.findByRole('img',{name:'Missing photo'}));
 expect(screen.getByText('No artist photo yet')).toBeTruthy();
 expect(screen.queryByRole('img',{name:'Missing photo'})).toBeNull();
 expect(screen.getByText('No biography available.')).toBeTruthy();
 expect(screen.getByText('No additional photos yet')).toBeTruthy();
 expect(screen.queryByTitle('YouTube video player')).toBeNull();
});
