// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import Home from './components/Home.Component';
import Detail from './components/Artist/Artist.Component.Detail';
import Update from './components/Artist/Artist.Component.Update';
import { MediaPlayerProvider } from './components/Media/MediaPlayerProvider';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Comments/CommentSection',()=>({default:()=>null}));
const video={id:'youtube:abcdefghijk',videoId:'abcdefghijk',provider:'youtube',title:'Original video',artistName:'Test artist',artistId:1,url:'https://www.youtube.com/watch?v=abcdefghijk',createdAt:'2020-01-02T00:00:00Z',durationSeconds:123,artworkUrl:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'};
const audio={id:'soundcloud:one',provider:'soundcloud',title:'Original audio',artistName:'Test artist',url:'https://soundcloud.com/test/one',createdAt:'2021-01-01T00:00:00Z'};
const ok=body=>({ok:true,json:async()=>body});
beforeEach(()=>{vi.resetAllMocks();window.scrollTo=vi.fn();api.GetSettings.mockResolvedValue(ok({settings:{}}));api.GetActiveSyndicateStreams.mockResolvedValue(ok({streams:[]}));api.GetAllEvents.mockResolvedValue(ok({events:[]}));api.GetAllImages.mockResolvedValue(ok({images:[]}));api.GetArtistImages.mockResolvedValue(ok({images:[]}));api.GetMediaLibrary.mockResolvedValue(ok({items:[video,audio],total:2,nextOffset:null,sources:[],complete:true}));const artist={id:1,name:'Test artist',user_id:1,cover_photo:'/uploads/saved.webp',youtube:'https://youtube.com/@channel'};api.GetArtistById.mockResolvedValue(ok({artist}));api.GetArtistManageData.mockResolvedValue(ok({artist}));api.CanEditArtist.mockReturnValue(true);});
afterEach(cleanup);
function view(path='/'){return render(<MemoryRouter initialEntries={[path]}><MediaPlayerProvider><Link to="/artists/2">Other artist</Link><Routes><Route path="/" element={<Home/>}/><Route path="/artists/:id" element={<Detail/>}/><Route path="/artists/:id/update" element={<Update/>}/></Routes></MediaPlayerProvider></MemoryRouter>);}
it.each(['/','/artists/1'])('video selection replaces featured area, stops audio, updates metadata and requests autoplay on %s',async path=>{
 const {container}=view(path);
 fireEvent.click(await screen.findByRole('button',{name:'Play Original audio'}));const oldAudio=screen.getByTitle('SoundCloud player');
 fireEvent.click(screen.getByRole('button',{name:'Play Original video'}));
 const frame=screen.getByTitle('YouTube: Original video');expect(oldAudio.isConnected).toBe(false);expect(container.querySelectorAll('iframe')).toHaveLength(1);
 expect(new URL(frame.src).pathname).toBe('/embed/abcdefghijk');expect(new URL(frame.src).searchParams.get('autoplay')).toBe('1');expect(window.scrollTo).toHaveBeenCalledWith({top:0,behavior:'auto'});
 expect(screen.getByText(/Your browser may require/)).toBeTruthy();
 if(path==='/'){expect(screen.queryByText(/Groovematics/)).toBeNull();expect(screen.getByRole('heading',{level:1,name:'Original video'})).toBeTruthy();}else expect(screen.queryByRole('img',{name:'Test artist cover'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Close video'}));expect(frame.isConnected).toBe(false);
 if(path!=='/')expect(screen.getByRole('img',{name:'Test artist cover'}).getAttribute('src')).toContain('/uploads/saved.webp');
 fireEvent.click(screen.getByRole('button',{name:'Play Original video'}));const second=screen.getByTitle('YouTube: Original video');
 fireEvent.click(screen.getByRole('button',{name:'Play Original audio'}));expect(second.isConnected).toBe(false);expect(screen.getByTitle('SoundCloud player')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Close audio player'}));expect(screen.queryByTitle('YouTube: Original video')).toBeNull();
});
it('route changes clean local video and channel URLs never become iframes',async()=>{
 view('/artists/1');fireEvent.click(await screen.findByRole('button',{name:'Play Original video'}));const frame=screen.getByTitle('YouTube: Original video');fireEvent.click(screen.getByRole('link',{name:'Other artist'}));await screen.findByRole('heading',{level:1,name:'Test artist'});expect(frame.isConnected).toBe(false);expect(screen.queryByTitle('YouTube video player')).toBeNull();
});
it('missing configuration and failed metadata saves are explicit and do not imply success',async()=>{
 api.GetArtistYouTubeVideos.mockResolvedValue(ok({videos:[],configured:false,limit:100}));
 const first=view('/artists/1/update');
 fireEvent.click(await screen.findByRole('tab',{name:'YouTube Links'}));
 expect(await screen.findByText(/server-only YOUTUBE_API_KEY/)).toBeTruthy();expect(screen.getByRole('button',{name:'Add video'}).disabled).toBe(true);first.unmount();
 api.GetArtistYouTubeVideos.mockResolvedValue(ok({videos:[],configured:true,limit:100}));api.AddArtistYouTubeVideo.mockResolvedValue({ok:false,json:async()=>({error:'Video is private, deleted or unavailable.'})});
 view('/artists/1/update');fireEvent.click(await screen.findByRole('tab',{name:'YouTube Links'}));fireEvent.change(await screen.findByLabelText('YouTube Video URL'),{target:{value:'https://youtu.be/abcdefghijk'}});fireEvent.click(screen.getByRole('button',{name:'Add video'}));expect(await screen.findByText('Video is private, deleted or unavailable.')).toBeTruthy();expect(screen.queryByText('YouTube video links updated.')).toBeNull();expect(screen.getByText('No YouTube video links yet.')).toBeTruthy();
});
it('newest-first library combines provider dates while invalid video dates are excluded and video replacements leave one iframe',async()=>{
 const second={...video,id:'youtube:12345678901',videoId:'12345678901',url:'https://www.youtube.com/watch?v=12345678901',title:'Later video',createdAt:'2021-01-01T02:00:00+01:00'};
 api.GetMediaLibrary.mockResolvedValue(ok({items:[{...video,id:'youtube:invaliddate',url:'https://www.youtube.com/watch?v=invaliddate',createdAt:'invalid',title:'Invalid date'},video,audio,second],sources:[],total:4,nextOffset:null,complete:true}));
 const {container}=view('/artists/1');const buttons=await screen.findAllByRole('button',{name:/^Play /});expect(buttons.map(b=>b.getAttribute('aria-label'))).toEqual(['Play Later video','Play Original audio'.replace('Original audio',audio.title),'Play Original video']);
 fireEvent.click(screen.getByRole('button',{name:'Play Original video'}));const previous=screen.getByTitle('YouTube: Original video');fireEvent.click(screen.getByRole('button',{name:'Play Later video'}));expect(previous.isConnected).toBe(false);expect(container.querySelectorAll('iframe')).toHaveLength(1);expect(screen.queryByRole('button',{name:'Play Invalid date'})).toBeNull();
});
it('artist edit separates channel, saves explicit links and confirms deletion inline with readback',async()=>{
 expect(typeof api.GetArtistYouTubeVideos).toBe('function');
 api.GetArtistYouTubeVideos.mockResolvedValueOnce(ok({videos:[],configured:true,limit:100})).mockResolvedValueOnce(ok({videos:[video],configured:true,limit:100})).mockResolvedValueOnce(ok({videos:[],configured:true,limit:100}));api.AddArtistYouTubeVideo.mockResolvedValue(ok({video}));api.DeleteArtistYouTubeVideo.mockResolvedValue(ok({success:true}));
 view('/artists/1/update');await screen.findByLabelText('YouTube Channel URL');fireEvent.click(screen.getByRole('tab',{name:'YouTube Links'}));const field=await screen.findByLabelText('YouTube Video URL');fireEvent.change(field,{target:{value:'https://youtu.be/abcdefghijk'}});fireEvent.click(screen.getByRole('button',{name:'Add video'}));await screen.findByText('Original video');expect(api.AddArtistYouTubeVideo).toHaveBeenCalledWith('1','https://youtu.be/abcdefghijk',false);fireEvent.click(screen.getByRole('button',{name:'Remove Original video'}));expect(api.DeleteArtistYouTubeVideo).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Confirm removal'}));await waitFor(()=>expect(screen.queryByText('Original video')).toBeNull());expect(api.DeleteArtistYouTubeVideo).toHaveBeenCalledWith('1','abcdefghijk');
});
