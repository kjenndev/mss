// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import MediaLibrary from './components/Media/MediaLibrary';
import {MediaPlayerProvider} from './components/Media/MediaPlayerProvider';
import MediaNavigation from './components/Media/MediaNavigation';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
afterEach(cleanup);
it('preserves the same official iframe through internal navbar anchors and route changes',async()=>{
 api.GetMediaLibrary.mockResolvedValue({ok:true,json:async()=>({items:[{id:'a',title:'A',provider:'soundcloud',url:'https://soundcloud.com/test/a'}],sources:[],total:1,nextOffset:null,cache:{},complete:true})});
 render(<MemoryRouter><MediaNavigation><MediaPlayerProvider><a href="/about">About</a><a href="/">Home</a><Routes><Route path="/" element={<MediaLibrary/>}/><Route path="/about" element={<h1>About page</h1>}/></Routes></MediaPlayerProvider></MediaNavigation></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Play A'}));
 const frame=screen.getByTitle('SoundCloud player');
 fireEvent.click(screen.getByRole('link',{name:'About'}));
 expect(await screen.findByRole('heading',{name:'About page'})).toBeTruthy();
 expect(screen.getByTitle('SoundCloud player')).toBe(frame);
 fireEvent.click(screen.getByRole('link',{name:'Home'}));
 await screen.findByRole('heading',{name:'Artist library'});
 expect(screen.getByTitle('SoundCloud player')).toBe(frame);
});
