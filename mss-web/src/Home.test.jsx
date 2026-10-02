// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,cleanup,fireEvent,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Home from './components/Home.Component';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Stream/Syndicate.Player.Component',()=>({default:({isPaused})=><div>{isPaused?'Paused':'Playing'}</div>}));
beforeEach(()=>{cleanup();vi.resetAllMocks();});
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
