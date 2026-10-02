// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,cleanup,fireEvent,act} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import Detail from './components/Artist/Artist.Component.Detail';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Comments/CommentSection',()=>({default:()=>null}));
vi.mock('./components/Stream/Syndicate.Player.Component',()=>({default:()=> <div>Live player</div>}));
function view(){return render(<MemoryRouter initialEntries={['/artists/1']}><Routes><Route path="/artists/:id" element={<Detail/>}/></Routes></MemoryRouter>);}
beforeEach(()=>{cleanup();vi.resetAllMocks();vi.useRealTimers();api.GetArtistImages.mockResolvedValue({ok:true,json:async()=>({images:[]})});api.GetSettings.mockResolvedValue({ok:true,json:async()=>({settings:{streaming_platform_url:'https://sp.test'}})});api.GetActiveSyndicateStreams.mockResolvedValue({ok:true,json:async()=>({streams:[]})});});
it('offers a retry after artist load failure',async()=>{
 api.GetArtistById.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ok:true,json:async()=>({artist:{id:1,name:'Artist'}})});
 view();fireEvent.click(await screen.findByRole('button',{name:'Retry'}));expect(await screen.findByText('Artist')).toBeTruthy();
});
it('refreshes an offline artist to live without navigation',async()=>{
 vi.useFakeTimers();api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:{id:1,name:'Artist',channel_name:'channel'}})});
 api.GetActiveSyndicateStreams.mockResolvedValueOnce({ok:true,json:async()=>({streams:[]})}).mockResolvedValue({ok:true,json:async()=>({streams:[{artistId:1,channelName:'channel'}]})});
 view();await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(screen.queryByText('Live player')).toBeNull();
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});expect(screen.getByText('Live player')).toBeTruthy();vi.useRealTimers();
});
