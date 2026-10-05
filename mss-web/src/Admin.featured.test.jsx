// @vitest-environment jsdom
import {StrictMode} from 'react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,cleanup,fireEvent,act,waitFor} from '@testing-library/react';
import AdminFeatured from './components/Admin/AdminFeatured';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
const videos=['abcdefghijk','lmnopqrstuv','12345678901'].map((id,i)=>({id:'youtube:'+id,provider:'youtube',title:'Featured '+(i+1),url:'https://www.youtube.com/watch?v='+id,createdAt:'2020-01-02T00:00:00.000Z',durationSeconds:123,artworkUrl:null}));
const response=videos=>({ok:true,json:async()=>({videos,canAdd:true})});
beforeEach(()=>{vi.resetAllMocks();api.GetHomeFeaturedVideos.mockResolvedValue(response(videos.slice(0,2)));});
afterEach(cleanup);
it('loads, previews, reorders and removes without persistence until explicit save and read-back',async()=>{
 api.PreviewHomeFeaturedVideo.mockResolvedValue({ok:true,json:async()=>({video:videos[2]})});
 api.SaveHomeFeaturedVideos.mockResolvedValue({ok:true});
 render(<AdminFeatured/>);await screen.findByRole('button',{name:'Save changes'});
 fireEvent.change(screen.getByRole('textbox',{name:'YouTube video URL'}),{target:{value:videos[2].url}});fireEvent.click(screen.getByRole('button',{name:'Add video'}));
 await screen.findByRole('button',{name:'Move video 3 up'});fireEvent.click(screen.getByRole('button',{name:'Move video 3 up'}));
 fireEvent.click(screen.getByRole('button',{name:'Remove video 1'}));
 expect(api.SaveHomeFeaturedVideos).not.toHaveBeenCalled();
 api.GetHomeFeaturedVideos.mockResolvedValue(response([videos[2],videos[1]]));
 fireEvent.click(screen.getByRole('button',{name:'Save changes'}));
 expect(await screen.findByText('Homepage featured videos saved.')).toBeTruthy();
 expect(api.SaveHomeFeaturedVideos).toHaveBeenCalledWith([videos[2].url,videos[1].url]);
 expect(document.querySelector('iframe')).toBeNull();
});
it.each([{ok:false},{ok:true,json:async()=>({videos:'bad',canAdd:true})}])('failed read hides editing and save until retry succeeds',async failure=>{
 api.GetHomeFeaturedVideos.mockResolvedValueOnce(failure);render(<AdminFeatured/>);
 expect(await screen.findByRole('button',{name:'Retry featured settings'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Save changes'})).toBeNull();expect(screen.queryByRole('textbox')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Retry featured settings'}));expect(await screen.findByRole('textbox')).toBeTruthy();
});
it('StrictMode late initial response never overwrites an edited current draft',async()=>{
 let old;api.GetHomeFeaturedVideos.mockReturnValueOnce(new Promise(r=>old=r)).mockResolvedValueOnce(response(videos.slice(0,2)));
 render(<StrictMode><AdminFeatured/></StrictMode>);fireEvent.click(await screen.findByRole('button',{name:'Remove video 1'}));
 await act(async()=>old(response(videos)));
 expect(screen.queryByRole('button',{name:'Move video 2 up'})).toBeNull();expect(screen.getByText('Unsaved changes')).toBeTruthy();
});
it('failed save read-back never claims success and locks editing until retry',async()=>{
 api.SaveHomeFeaturedVideos.mockResolvedValue({ok:true});render(<AdminFeatured/>);fireEvent.click(await screen.findByRole('button',{name:'Remove video 1'}));
 api.GetHomeFeaturedVideos.mockResolvedValue({ok:false});fireEvent.click(screen.getByRole('button',{name:'Save changes'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Retry featured settings'})).toBeTruthy());
 expect(screen.queryByText('Homepage featured videos saved.')).toBeNull();expect(screen.queryByRole('button',{name:'Save changes'})).toBeNull();
});
