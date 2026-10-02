// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import Player from './components/Stream/Syndicate.Player.Component';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(()=>{cleanup();vi.resetAllMocks();});
it('never loads a fallback platform while settings are pending',()=>{
 api.GetSettings.mockReturnValue(new Promise(()=>{}));
 const {container}=render(<Player channelName="abc"/>);
 expect(container.querySelector('iframe')).toBeNull();
});
it('loads the full platform watch route without claiming embed or shared identity',async()=>{
 api.GetSettings.mockResolvedValue({ok:true,json:async()=>({settings:{streaming_platform_url:'https://stream.example.test/'}})});
 render(<Player channelName="abc"/>);
 const iframe=await screen.findByTitle(/Full platform player/i);
 expect(iframe.getAttribute('src')).toBe('https://stream.example.test/watch/abc');
 expect(screen.getByText(/separate.*join/i)).toBeTruthy();
});
it('settings failures offer retry without a frame',async()=>{
 api.GetSettings.mockRejectedValue(new Error('offline'));
 const {container}=render(<Player channelName="abc"/>);
 expect(await screen.findByRole('button',{name:'Retry'})).toBeTruthy();
 expect(container.querySelector('iframe')).toBeNull();
});
